/** Serverless Notion storage: notes and projects are real Notion pages, not a fake local cache.
 *  Personal integration token must only be used on Android/iOS with SecureStore.
 *  Notes are child pages under the selected root page (Inbox) or under project pages.
 *  Metadata lives in a collapsed toggle block. All audio remains on device.
 */
import type { Project, Thought, AIConfig } from './api'
import * as Crypto from 'expo-crypto'
import { getNotionOAuth, getNotionRoot, readSecret } from './deviceConfig'
import { refreshNotionStorage } from './notionOAuth'
import { enrichNote, localSettings, saveLocalSettings } from './onDeviceAI'
import type { LocalProject, LocalThought, SyncAdapters } from './localCore'
import { notionVersionOf } from './localCore'

const BASE = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'
const PREFIX_PROJECT = '📁 '
const PREFIX_THOUGHT = '💭 '
const META_PREFIX = 'THOUGHTS_V1:'
const META_LABEL = 'Данные синхронизации Thoughts'
const compactId = (id: string) => id.replace(/-/g, '').toLowerCase()
const PAGE_ID = /(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i

export function parseNotionProjectPage(value: string): string | null {
    const input = value.trim()
    if (!input) return null
    const direct = input.match(PAGE_ID)
    if (direct?.[0] === input) return compactId(input)
    try {
        const url = new URL(input)
        if (url.protocol === 'https:' && /(^|\.)(notion\.so|notion\.site|notion\.com)$/.test(url.hostname)) {
            const id = url.pathname.replace(/\/$/, '').match(PAGE_ID)?.[0]
            if (id) return compactId(id)
        }
    } catch {
        // Report a single validation error for both invalid URLs and IDs.
    }
    throw new Error('Вставь ссылку на страницу Notion или её ID')
}
const now = () => new Date().toISOString()
const rich = (text: string) =>
    Array.from({ length: Math.ceil(text.length / 1800) }, (_, i) => ({
        type: 'text',
        text: { content: text.slice(i * 1800, (i + 1) * 1800) }
    }))
const paragraph = (text: string) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: rich(text) }
})
const pageTitle = (s: string) => [{ type: 'text', text: { content: s.slice(0, 140) } }]

async function notion<T = any>(path: string, method = 'GET', body?: unknown, explicitToken?: string): Promise<T> {
    const oauth = explicitToken ? null : getNotionOAuth()
    let token = explicitToken ?? oauth?.accessToken ?? await readSecret('notion')
    if (!token) throw new Error('Подключи Notion в настройках.')
    const request = (accessToken: string) => fetch(`${BASE}${path}`, {
        signal: AbortSignal.timeout(30000),
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Notion-Version': VERSION,
            'Content-Type': 'application/json'
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    let response = await request(token)
    if (response.status === 401 && oauth) {
        token = await refreshNotionStorage(oauth)
        response = await request(token)
    }
    if (response.status === 429) {
        const delay = Math.min(
            5000,
            Math.max(1000, Number(response.headers.get('retry-after') || 1) * 1000)
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        response = await request(token)
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok)
        throw new Error(
            `Notion ${response.status}: ${String(data.message || data.code || 'Не удалось выполнить запрос').slice(0, 180)}`
        )
    return data as T
}

function root() {
    const id = getNotionRoot()
    if (!id) throw new Error('В настройках укажи страницу Notion для хранения мыслей.')
    return id
}
function title(block: any): string {
    return block?.child_page?.title || ''
}
async function children(id: string, token?: string): Promise<any[]> {
    let cursor: string | undefined
    const result: any[] = []
    do {
        const url = `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`
        const chunk: any = await notion(url, 'GET', undefined, token)
        result.push(...chunk.results)
        cursor = chunk.has_more ? chunk.next_cursor : undefined
    } while (cursor)
    return result
}
async function getPageBlocks(id: string) {
    return children(id)
}
function blockText(block: any): string {
    return (block[block.type]?.rich_text || [])
        .map((item: any) => item.plain_text ?? item.text?.content ?? '')
        .join('')
}
function metadataEntry(blocks: any[]) {
    for (const block of blocks) {
        if (block.type !== 'paragraph') continue
        const text = blockText(block)
        if (!text.startsWith(META_PREFIX)) continue
        try {
            const value = JSON.parse(text.slice(META_PREFIX.length))
            if (value && typeof value === 'object' && !Array.isArray(value))
                return { id: block.id, value }
        } catch {
            // Leave unrecognized content alone.
        }
    }
}
async function readMetadata(blocks: any[]) {
    const legacy = metadataEntry(blocks)
    for (const block of blocks) {
        if (block.type !== 'toggle' || blockText(block) !== META_LABEL || !block.has_children)
            continue
        const current = metadataEntry(await children(block.id))
        if (current) return { current, legacy }
    }
    return { legacy }
}
async function parseMeta<T>(blocks: any[]): Promise<T | undefined> {
    const { current, legacy } = await readMetadata(blocks)
    const entry = current || legacy
    if (!entry) return undefined
    return {
        ...entry.value,
        rawText:
            entry.value.rawText ??
            blocks.filter((block) => block.type === 'paragraph')
                .map(blockText)
                .filter((text) => !text.startsWith(META_PREFIX))
                .join('')
    } as T
}
function metadataToggle(value: string) {
    return {
        object: 'block',
        type: 'toggle',
        toggle: { rich_text: rich(META_LABEL), children: [paragraph(value)] }
    }
}
function visibleThought(raw: string, summary?: string) {
    const formatted = summary?.trim()
        .replace(/^[ \t]*[-*•][ \t]+\[([ xX])\][ \t]+/gm, (_, mark) => mark === ' ' ? '☐ ' : '☑ ')
        .replace(/^[ \t]*[-*][ \t]+/gm, '• ')
    return formatted ? `Резюме\n${formatted}\n\nИсходный текст\n${raw}` : raw
}
async function createChild(parent: string, name: string, meta: object, raw?: string): Promise<any> {
    // Stable localId is committed with page creation, so a lost response can be reconciled.
    return notion('/pages', 'POST', {
        parent: { type: 'page_id', page_id: parent },
        properties: { title: { type: 'title', title: pageTitle(name) } },
        children: [
            metadataToggle(
                META_PREFIX +
                    JSON.stringify({ ...meta, ...(raw === undefined ? {} : { rawText: raw }) })
            )
        ]
    })
}
async function updateMetadata(pageId: string, meta: object, raw?: string, summary?: string) {
    const blocks = await getPageBlocks(pageId)
    const { current, legacy } = await readMetadata(blocks)
    const previous = (current || legacy)?.value || {}
    const owned: string[] = (previous._textBlocks || []).filter((id: string) =>
        blocks.some((b) => b.id === id)
    )
    const nextIds: string[] = []
    if (raw !== undefined) {
        const visible = visibleThought(raw, summary)
        const texts = Array.from({ length: Math.ceil(visible.length / 1800) }, (_, i) =>
            visible.slice(i * 1800, (i + 1) * 1800)
        )
        for (let i = 0; i < texts.length; i++) {
            if (owned[i]) {
                await notion(`/blocks/${owned[i]}`, 'PATCH', {
                    paragraph: { rich_text: rich(texts[i]) }
                })
                nextIds.push(owned[i])
            } else {
                const appended: any = await notion(`/blocks/${pageId}/children`, 'PATCH', {
                    children: [paragraph(texts[i])]
                })
                nextIds.push(appended.results[0].id)
            }
        }
        for (const blockId of owned.slice(texts.length))
            await notion(`/blocks/${blockId}`, 'DELETE')
    }
    // Only explicitly owned text blocks are changed. Legacy/user-authored paragraphs stay intact.
    const value =
        META_PREFIX +
        JSON.stringify({
            ...previous,
            ...meta,
            ...(raw === undefined ? {} : { rawText: raw, _textBlocks: nextIds })
        })
    if (current)
        await notion(`/blocks/${current.id}`, 'PATCH', { paragraph: { rich_text: rich(value) } })
    else await notion(`/blocks/${pageId}/children`, 'PATCH', { children: [metadataToggle(value)] })
    // Keep the old copy until the replacement is durable. A retry finds the toggle first.
    if (legacy) await notion(`/blocks/${legacy.id}`, 'DELETE')
}
async function renamePage(id: string, name: string) {
    await notion(`/pages/${id}`, 'PATCH', {
        properties: { title: { type: 'title', title: pageTitle(name) } }
    })
}
async function archivePage(id: string) {
    await notion(`/pages/${id}`, 'PATCH', { archived: true })
}

export async function getProjects(
    destinationRoot = root(),
    loadBlocks = getPageBlocks
): Promise<Project[]> {
    const top = await loadBlocks(destinationRoot)
    const rows = top.filter((b) => b.type === 'child_page' && title(b).startsWith(PREFIX_PROJECT))
    const result = await Promise.all(
        rows.map(async (b) => {
            const meta = await parseMeta<Partial<Project>>(await loadBlocks(b.id))
            return {
                id: b.id,
                localId: meta?.localId,
                localRevision: meta?.localRevision,
                name: meta?.name || title(b).slice(PREFIX_PROJECT.length),
                description: meta?.description || '',
                color: meta?.color || '#6259E8',
                createdAt: b.created_time || now(),
                updatedAt: b.last_edited_time || now(),
                thoughtCount: 0,
                notionPageId: meta?.notionPageId ?? null,
                notionPageRoot: meta?.notionPageId ? destinationRoot : null,
                notionPageTitle: meta?.notionPageTitle ?? null
            }
        })
    )
    return result
}
export async function createProject(body: {
    name: string
    description: string
    color: string
}): Promise<Project> {
    const meta = { kind: 'project', ...body }
    const p = await createChild(root(), PREFIX_PROJECT + body.name, meta)
    return {
        id: p.id,
        ...body,
        createdAt: p.created_time,
        updatedAt: p.last_edited_time,
        thoughtCount: 0
    }
}
export async function updateProject(id: string, body: Partial<Project>): Promise<Project> {
    const old = (await getProjects()).find((p) => p.id === id)
    if (!old) throw new Error('Проект не найден')
    const next = { ...old, ...body }
    if (body.name) await renamePage(id, PREFIX_PROJECT + next.name)
    await updateMetadata(id, {
        kind: 'project',
        name: next.name,
        description: next.description,
        color: next.color
    })
    return next
}
export async function deleteProject(id: string) {
    // Do not archive a project with notes: it would hide all of its children.
    const notes = (await children(id)).filter(
        (b) => b.type === 'child_page' && title(b).startsWith(PREFIX_THOUGHT)
    )
    if (notes.length) throw new Error('Сначала перенеси или удали заметки проекта в Notion.')
    await archivePage(id)
    return { ok: true }
}
function thoughtFrom(b: any, meta: Partial<Thought>): Thought {
    return {
        id: b.id,
        localId: meta.localId,
        localRevision: meta.localRevision,
        notionVersion: meta.notionVersion,
        rawText: meta.rawText || '',
        title: meta.title || title(b).slice(PREFIX_THOUGHT.length),
        summary: meta.summary || '',
        tags: meta.tags || [],
        projectId: meta.projectId || null,
        projectLocked: meta.projectLocked ?? false,
        category: meta.category || 'note',
        categoryLocked: meta.categoryLocked,
        categoryDefinition: meta.categoryDefinition,
        classificationProposal: meta.classificationProposal,
        status: meta.status || 'pending',
        confidence: meta.confidence ?? null,
        errorMessage: meta.errorMessage || null,
        generatorModel: meta.generatorModel || null,
        decisionModel: meta.decisionModel || null,
        createdAt: meta.createdAt || b.created_time || now(),
        updatedAt: meta.updatedAt || b.last_edited_time || now()
    }
}
async function readThought(block: any, blocks: any[], linkedProjectId?: string): Promise<Thought | null> {
    const meta = await parseMeta<Partial<Thought> & { kind?: string; _textBlocks?: string[] }>(blocks)
    if (linkedProjectId && (meta?.kind !== 'thought' || !meta.localId ||
        compactId(meta.projectId ?? '') !== compactId(linkedProjectId))) return null
    const result = thoughtFrom(block, meta || {})
    if (meta?.kind !== 'thought' || !meta.localId) return result

    const titleOnPage = title(block).replace(/^💭 /, '')
    const renamed = Boolean(title(block)) &&
        titleOnPage !== pageTitle(PREFIX_THOUGHT + result.title)[0].text.content.slice(PREFIX_THOUGHT.length)
    const owned = Array.isArray(meta._textBlocks)
        ? blocks.filter((item) => meta._textBlocks!.includes(item.id))
        : []
    const visible = owned.map(blockText).join('')
    const edited = owned.length > 0 && visible !== result.rawText && visible !== visibleThought(result.rawText, result.summary)
    if (!renamed && !edited) return result

    const textHeading = '\n\nИсходный текст\n'
    const separator = visible.startsWith('Резюме\n') ? visible.indexOf(textHeading) : -1
    const summary = separator < 0 ? result.summary : visible.slice('Резюме\n'.length, separator)
        .replace(/^☐ /gm, '- [ ] ').replace(/^☑ /gm, '- [x] ').replace(/^• /gm, '- ')
    return {
        ...result,
        title: renamed ? titleOnPage : result.title,
        rawText: edited ? separator < 0 ? visible : visible.slice(separator + textHeading.length) : result.rawText,
        summary: edited ? summary : result.summary,
        notionVersion: 'notion:' + await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify([notionVersionOf(result), titleOnPage, visible])
        )
    }
}
async function inFolder(
    id: string, loadBlocks: typeof getPageBlocks, knownThoughts: ReadonlySet<string>, linkedProjectId?: string
): Promise<Thought[]> {
    const blocks = await loadBlocks(id)
    const notes = blocks.filter(
        (b) => b.type === 'child_page' && (title(b).startsWith(PREFIX_THOUGHT) || knownThoughts.has(compactId(b.id)))
    )
    const results = await Promise.all(notes.map(async (block) => {
        return readThought(block, await loadBlocks(block.id), linkedProjectId)
    }))
    return results.filter((note) => note !== null)
}
export async function getNotionSnapshot(knownThoughtIds: string[] = []) {
    const destinationRoot = root()
    const knownThoughts = new Set(knownThoughtIds.map(compactId))
    const pending = new Map<string, ReturnType<typeof getPageBlocks>>()
    const loadBlocks = (pageId: string) => {
        const key = compactId(pageId)
        const cached = pending.get(key)
        if (cached) return cached
        const blocks = getPageBlocks(pageId)
        pending.set(key, blocks)
        return blocks
    }
    const projects = await getProjects(destinationRoot, loadBlocks)
    const folders = [destinationRoot, ...projects.map((project) => project.id)]
    const linkedErrors = new Map<string, Error>()
    const linked = projects.filter((project) => project.notionPageId)
    const thoughts = (await Promise.all([
        ...folders.map((id) => inFolder(id, loadBlocks, knownThoughts)),
        ...linked.map(async (project) => {
            const pageId = project.notionPageId!
            try {
                return await inFolder(pageId, loadBlocks, knownThoughts, project.id)
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error)
                linkedErrors.set(compactId(pageId), new Error(`${project.name}: ${detail}`))
                return []
            }
        })
    ]))
        .flat()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { root: destinationRoot, projects, thoughts, linkedErrors }
}
export async function getThoughts(): Promise<Thought[]> {
    return (await getNotionSnapshot()).thoughts
}
async function putThought(t: Thought) {
    const { id, rawText, ...meta } = t
    await renamePage(id, PREFIX_THOUGHT + t.title)
    await updateMetadata(id, { kind: 'thought', ...meta }, t.rawText, t.summary)
    return t
}
export async function createThought(rawText: string, projectId: string | null): Promise<Thought> {
    const time = now()
    const initial: Thought = {
        id: '',
        rawText,
        title: rawText.slice(0, 75),
        summary: '',
        tags: [],
        projectId,
        projectLocked: Boolean(projectId),
        category: 'note',
        status: 'pending',
        confidence: null,
        errorMessage: null,
        generatorModel: null,
        decisionModel: null,
        createdAt: time,
        updatedAt: time
    }
    // Persist raw text before any external AI call; a failed model does not lose it.
    const { rawText: _raw, ...meta } = initial
    const page = await createChild(
        projectId || root(),
        PREFIX_THOUGHT + initial.title,
        { kind: 'thought', ...meta },
        rawText
    )
    const persisted = { ...initial, id: page.id }
    try {
        return await processThought(persisted.id, persisted)
    } catch (e) {
        return putThought({
            ...persisted,
            status: 'needs_review',
            errorMessage: String((e as Error).message).slice(0, 250)
        })
    }
}
export async function processThought(id: string, existing?: Thought) {
    const current = existing || (await getThoughts()).find((t) => t.id === id)
    if (!current) throw new Error('Заметка не найдена')
    const projects = await getProjects()
    const settings = await localSettings()
    const enriched = await enrichNote(
        current.rawText,
        projects,
        current.projectLocked ? current.projectId : null,
        settings
    )
    const newParent = enriched.projectId || root()
    const oldParent = current.projectId || root()
    if (newParent !== oldParent) {
        // Move API retains the note page identity and keeps Notion hierarchy in sync.
        await notion(`/pages/${id}/move`, 'POST', {
            parent: { type: 'page_id', page_id: newParent }
        })
    }
    return putThought({ ...current, ...enriched, id, updatedAt: now() })
}
export async function updateThought(id: string, updates: Partial<Thought>): Promise<Thought> {
    const old = (await getThoughts()).find((t) => t.id === id)
    if (!old) throw new Error('Заметка не найдена')
    const newParent = updates.projectId === undefined ? old.projectId : updates.projectId
    if (newParent !== old.projectId)
        await notion(`/pages/${id}/move`, 'POST', {
            parent: { type: 'page_id', page_id: newParent || root() }
        })
    return putThought({
        ...old,
        ...updates,
        projectLocked:
            updates.projectId === undefined ? old.projectLocked : Boolean(updates.projectId),
        id,
        updatedAt: now()
    })
}
export async function deleteThought(id: string) {
    await archivePage(id)
    return { ok: true }
}
export const notionStorage = {
    projects: getProjects,
    createProject,
    updateProject,
    deleteProject,
    thoughts: getThoughts,
    createThought,
    processThought,
    updateThought,
    deleteThought,
    settings: localSettings,
    saveSettings: saveLocalSettings,
    config: async (): Promise<AIConfig> => ({
        generators: [
            {
                id: 'openrouter',
                label: 'OpenRouter (ключ на телефоне)',
                configured: Boolean(await readSecret('openrouter'))
            }
        ],
        decisions: [
            {
                id: 'openrouter',
                label: 'Jev / OpenRouter',
                configured: Boolean(await readSecret('openrouter'))
            },
            { id: 'disabled', label: 'Без Jev', configured: true }
        ]
    })
}

const pageName = (page: { properties?: Record<string, { type: string; title?: { plain_text?: string; text?: { content: string } }[] }> }) =>
    Object.values(page.properties ?? {}).find((property) => property.type === 'title')
        ?.title?.map((part) => part.plain_text ?? part.text?.content ?? '').join('').trim() || null

export type NotionPageChoice = { id: string; title: string }

export async function searchNotionPages(query: string, cursor?: string, token?: string) {
    const data = await notion('/search', 'POST', {
        ...(query.trim() ? { query: query.trim() } : {}),
        ...(cursor ? { start_cursor: cursor } : {}),
        page_size: 25,
        filter: { property: 'object', value: 'page' }
    }, token)
    const pages: NotionPageChoice[] = (data.results || [])
        .filter((page: any) => !page.archived && !page.in_trash)
        .map((page: any) => ({ id: compactId(page.id), title: pageName(page) || 'Без названия' }))
        .filter((page: NotionPageChoice) => !page.title.startsWith(PREFIX_THOUGHT) && !page.title.startsWith(PREFIX_PROJECT))
    return { pages, cursor: data.has_more && typeof data.next_cursor === 'string' ? data.next_cursor as string : undefined }
}

/** Reuse an existing Thoughts child so retrying after a lost response is safe. */
export async function createNotionInbox(parentId: string, token?: string): Promise<NotionPageChoice> {
    const existing = (await children(parentId, token)).find((b) =>
        b.type === 'child_page' && title(b) === 'Thoughts' && !b.archived && !b.in_trash)
    if (existing) return { id: compactId(existing.id), title: 'Thoughts' }
    const page = await notion('/pages', 'POST', {
        parent: { type: 'page_id', page_id: parentId },
        properties: { title: { type: 'title', title: pageTitle('Thoughts') } }
    }, token)
    return { id: compactId(page.id), title: 'Thoughts' }
}

export async function verifyNotionConnection(pageId = root(), token?: string) {
    const page = await notion(`/pages/${pageId}`, 'GET', undefined, token)
    if (page.archived || page.in_trash) throw new Error('Эта страница Notion находится в корзине')
    return pageName(page) || 'Без названия'
}

export async function verifyNotionProjectPage(pageId: string) {
    if (compactId(pageId) === compactId(root()))
        throw new Error('Для проекта выбери отдельную страницу, отличную от общих входящих')
    const page = await notion(`/pages/${pageId}`)
    if (page.archived || page.in_trash) throw new Error('Эта страница Notion находится в корзине')
    const meta = await parseMeta<{ kind?: string }>(await getPageBlocks(pageId))
    if (meta?.kind === 'thought' || meta?.kind === 'project')
        throw new Error('Выбери существующую страницу вне служебных страниц Thoughts')
    return pageName(page)
}

/** One reconciliation snapshot per pass avoids blind create retries and N-squared reads. */
export async function createNotionSyncAdapter(snapshot?: {
    root?: string
    linkedErrors?: ReadonlyMap<string, Error>
    projects: Project[]
    thoughts: Thought[]
}): Promise<NonNullable<SyncAdapters['notion']>> {
    const loaded = snapshot ?? await getNotionSnapshot()
    const destinationRoot = loaded.root ?? root()
    const { projects, thoughts } = loaded
    return {
        root: destinationRoot,
        project: async (local: LocalProject, remoteId?: string) => {
            let remote = remoteId || projects.find((p) => p.localId === local.id)?.id
            const meta = {
                kind: 'project',
                localId: local.id,
                name: local.name,
                description: local.description,
                color: local.color,
                localRevision: local.revision,
                notionPageId: local.notionPageRoot === destinationRoot ? local.notionPageId ?? null : null,
                notionPageTitle: local.notionPageRoot === destinationRoot ? local.notionPageTitle ?? null : null
            }
            if (!remote) {
                const page = await createChild(destinationRoot, PREFIX_PROJECT + local.name, meta)
                remote = page.id
                projects.push({ ...local, id: remote!, localId: local.id })
            } else {
                await renamePage(remote, PREFIX_PROJECT + local.name)
                await updateMetadata(remote, meta)
            }
            return remote!
        },
        thought: async (local: LocalThought, parent: string | null, remoteId?: string, remoteProjectId = parent) => {
            const linkedError = parent ? loaded.linkedErrors?.get(compactId(parent)) : undefined
            if (linkedError) throw linkedError
            let remote = remoteId || thoughts.find((t) => t.localId === local.id)?.id
            const {
                notion: _links,
                notionErrors: _notionErrors,
                revision,
                deleted: _deleted,
                aiPending: _pending,
                aiFeedback: _feedback,
                syncVersion,
                notionConflicts: _conflicts,
                attempts: _attempts,
                retryAt: _retry,
                ...data
            } = local
            const meta = {
                ...data,
                kind: 'thought',
                localId: local.id,
                projectId: remoteProjectId,
                localRevision: revision,
                notionVersion: syncVersion ?? `${revision}:${local.updatedAt}`
            }
            if (!remote) {
                const page = await createChild(
                    parent || destinationRoot,
                    PREFIX_THOUGHT + local.title,
                    meta,
                    local.rawText
                )
                remote = page.id
                thoughts.push({ ...local, id: remote!, localId: local.id })
            } else {
                const page: any = await notion(`/pages/${remote}`)
                const expected = local.notion[destinationRoot]?.version
                if (expected) {
                    const latest = await readThought({
                        id: remote,
                        child_page: { title: pageName(page) }
                    }, await getPageBlocks(remote))
                    if (latest && notionVersionOf(latest) !== expected && latest.notionVersion !== meta.notionVersion)
                        throw new Error('Страница изменилась в Notion. Сначала получим свежую версию.')
                }
                if (
                    page.parent?.page_id?.replace(/-/g, '') !==
                    (parent || destinationRoot).replace(/-/g, '')
                )
                    await notion(`/pages/${remote}/move`, 'POST', {
                        parent: { type: 'page_id', page_id: parent || destinationRoot }
                    })
            }
            await renamePage(remote!, PREFIX_THOUGHT + local.title)
            await updateMetadata(remote!, meta, local.rawText, local.summary)
            return remote!
        },
        remove: async (id: string) => {
            const page: any = await notion(`/pages/${id}`)
            if (!page.archived && !page.in_trash) await archivePage(id)
        }
    }
}
