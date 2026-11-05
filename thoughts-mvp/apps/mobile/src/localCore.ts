import type { Project, Thought } from './api'
import { checklistFromList, toggleChecklistItem } from './checklist.ts'
import { allTypes, namedSuggestion, normalizedName, type ClassificationProposal, type ThoughtType } from './taxonomy.ts'

export type Preferences = {
    theme: 'light' | 'dark' | 'system'
    accent: string
    projectColors: boolean
    voiceOnDevice: boolean
    voiceReview: boolean
    haptics: boolean
    confirmAIProposals: boolean
}
export type RemoteLink = { id: string; revision: number; version?: string; parentId?: string }
export type LocalProject = Project & {
    revision: number
    deleted: boolean
    notion: Record<string, RemoteLink>
}
export type LocalThought = Thought & {
    revision: number
    deleted: boolean
    aiPending: boolean
    aiFeedback?: string
    attempts: number
    retryAt: number
    notion: Record<string, RemoteLink>
    notionErrors?: Record<string, { revision: number; message: string }>
    syncVersion?: string
    notionConflicts?: Record<string, Thought>
}
export type AIUsage = { requests?: number; promptTokens?: number; completionTokens?: number; totalTokens?: number; costUsd?: number }
export type EnrichmentResult = Partial<Thought> & { usage?: AIUsage }
export const notionVersionOf = (remote: Thought) => remote.notionVersion ?? `${remote.localRevision ?? 0}:${remote.updatedAt}`
export type AIHistoryEntry = {
    id: string
    thoughtId: string
    revision: number
    startedAt: string
    finishedAt?: string
    durationMs?: number
    status: 'started' | 'success' | 'partial' | 'error'
    provider?: string
    generatorModel?: string | null
    decisionModel?: string | null
    inputText: string
    result?: Partial<Pick<Thought, 'title' | 'summary' | 'category' | 'projectId' | 'confidence' | 'tags' | 'classificationProposal'>>
    error?: string
    applied?: boolean
    usage?: AIUsage
}
export type AppNotification = {
    id: string
    message: string
    createdAt: string
    read: boolean
    kind: 'info' | 'error'
    thoughtId?: string
    source?: string
}
export type LocalState = {
    version: 1
    projects: LocalProject[]
    thoughts: LocalThought[]
    draft: string
    lastProjectId: string | null
    preferences: Preferences
    aiHistory: AIHistoryEntry[]
    customCategories: ThoughtType[]
    notifications: AppNotification[]
}
export type DocumentStorage = {
    load: () => Promise<string | null>
    save: (value: string) => Promise<void>
}
export class LocalConflictError extends Error {
    readonly code = 'LOCAL_CONFLICT'
}
export type SyncAdapters = {
    enrich?: (thought: LocalThought, projects: Project[]) => Promise<EnrichmentResult>
    aiModels?: { provider: string; generatorModel: string; decisionModel: string }
    notion?: {
        root: string
        project: (project: LocalProject, remoteId?: string) => Promise<string>
        thought: (
            thought: LocalThought,
            parentPageId: string | null,
            remoteId?: string,
            remoteProjectId?: string | null
        ) => Promise<string | { id: string; parentId: string }>
        remove: (id: string) => Promise<void>
    }
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const historyError = (message: string) => message
    .replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [скрыто]')
    .replace(/\b(?:sk-|ntn_|secret_)[\w-]+/g, '[ключ скрыт]')
    .slice(0, 500)
const historyUsage = (raw: unknown): AIUsage | undefined => {
    if (typeof raw !== 'object' || raw === null) return undefined
    const safe: AIUsage = {}
    for (const key of ['requests', 'promptTokens', 'completionTokens', 'totalTokens', 'costUsd'] as const) {
        const value = (raw as Record<string, unknown>)[key]
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) safe[key] = value
    }
    return Object.keys(safe).length ? safe : undefined
}
const initial = (): LocalState => ({
    version: 1,
    projects: [],
    thoughts: [],
    aiHistory: [],
    customCategories: [],
    notifications: [],
    draft: '',
    lastProjectId: null,
    preferences: {
        theme: 'system',
        accent: 'indigo',
        projectColors: true,
        voiceOnDevice: false,
        voiceReview: true,
        haptics: true,
        confirmAIProposals: false
    }
})

/** Local repository + durable outbox. Each save commits data and its pending revision together. */
export function createLocalRepository(
    storage: DocumentStorage,
    id: () => string,
    now = () => Date.now()
) {
    let state = initial()
    let initialized: Promise<void> | undefined
    let writes: Promise<unknown> = Promise.resolve()
    let flight: Promise<void> | undefined
    const listeners = new Set<() => void>()
    const ensureUniquePage = (state: LocalState, pageId?: string | null, projectId?: string) => {
        if (pageId && state.projects.some((p) =>
            !p.deleted && p.id !== projectId && p.notionPageId === pageId
        ))
            throw new Error('Эта страница Notion уже привязана к другому проекту')
    }
    const read = async () => {
        const raw = await storage.load()
        if (raw !== null) {
            const saved = JSON.parse(raw) as LocalState
            if (
                saved.version !== 1 ||
                !Array.isArray(saved.thoughts) ||
                !Array.isArray(saved.projects)
            ) {
                throw new Error(
                    'Не удалось прочитать локальную базу. Данные сохранены, база не перезаписана.'
                )
            }
            state = { ...saved, notifications: Array.isArray(saved.notifications) ? saved.notifications : [], lastProjectId: saved.lastProjectId ?? null, customCategories: Array.isArray(saved.customCategories) ? saved.customCategories : [], aiHistory: Array.isArray(saved.aiHistory) ? saved.aiHistory : [], preferences: { ...initial().preferences, ...saved.preferences } }
            for (const thought of state.thoughts) {
                const type = thought.categoryDefinition
                if (type?.id.startsWith('custom:') && !state.customCategories.some((c) => c.id === type.id)) state.customCategories.push(type)
            }
        }
    }
    const initialize = () => (initialized ??= read())
    const mutate = <T>(fn: (next: LocalState) => T): Promise<T> => {
        const operation = writes
            .catch(() => {})
            .then(initialize)
            .then(async () => {
                for (let attempt = 0; attempt < 4; attempt++) {
                    const next = clone(state)
                    const result = fn(next)
                    try {
                        await storage.save(JSON.stringify(next))
                    } catch (error) {
                        if (error instanceof LocalConflictError && attempt < 3) {
                            await read()
                            continue
                        }
                        throw error
                    }
                    state = next
                    listeners.forEach((listener) => listener())
                    return result
                }
                throw new Error('Не удалось сохранить локальные изменения')
            })
        writes = operation
        return operation
    }
    const stamp = () => new Date(now()).toISOString()
    const touch = (item: LocalProject | LocalThought) => {
        item.revision++
        item.updatedAt = stamp()
        if ('rawText' in item) item.syncVersion = id()
    }
    const findNote = (s: LocalState, noteId: string) => {
        const note = s.thoughts.find((t) => t.id === noteId && !t.deleted)
        if (!note) throw new Error('Мысль не найдена')
        return note
    }
    const applyRemoteNote = (local: LocalThought, remote: Thought, root: string) => {
        const { id: _remoteId, ...fields } = remote
        Object.assign(local, fields)
        local.revision++
        local.syncVersion = undefined
        local.aiPending = remote.status === 'pending'
        delete local.aiFeedback
        local.attempts = local.retryAt = 0
        local.notion[root] = { id: remote.id, parentId: remote.notionParentId, revision: local.revision, version: notionVersionOf(remote) }
        if (local.notionConflicts) delete local.notionConflicts[root]
        if (local.notionErrors) delete local.notionErrors[root]
    }
    const applyClassification = (s: LocalState, t: LocalThought, proposal: ClassificationProposal, mode: 'all' | 'project' | 'automatic' = 'all') => {
        const retryError = mode === 'automatic' ? t.errorMessage : null
        const pending = t.classificationProposal!
        if (pending.project && !t.projectLocked) {
            const candidate = namedSuggestion(proposal.project)
            if (!candidate) throw new Error('Укажи название проекта')
            let project = s.projects.find((p) => !p.deleted && normalizedName(p.name) === normalizedName(candidate.name))
            if (!project) {
                project = { ...candidate, id: id(), color: '#5B4FE0', createdAt: stamp(), updatedAt: stamp(), revision: 1, deleted: false, notion: {} }
                s.projects.push(project)
            }
            t.projectId = project.id
            t.projectLocked = mode !== 'automatic'
        }
        if (mode !== 'project' && pending.category && !t.categoryLocked) {
            const candidate = namedSuggestion(proposal.category)
            if (!candidate) throw new Error('Укажи название типа')
            let category = allTypes(s.customCategories).find((c) => normalizedName(c.name) === normalizedName(candidate.name))
            if (!category) {
                category = { ...candidate, id: `custom:${id()}` }
                s.customCategories.push(category)
            }
            t.category = category.id
            t.categoryDefinition = category
            t.categoryLocked = mode !== 'automatic'
        }
        t.classificationProposal = mode === 'project' && pending.category && !t.categoryLocked
            ? { ...pending, project: undefined, unresolved: { project: false, category: true } }
            : null
        t.status = t.projectId && !t.classificationProposal && !(pending.unresolved?.category && !pending.category)
            ? 'ready' : 'needs_review'
        t.aiPending = Boolean(t.aiFeedback)
        t.errorMessage = null
        t.attempts = t.retryAt = 0
        if (retryError) {
            t.errorMessage = retryError
            t.aiPending = true
            t.status = 'needs_review'
        }
    }
    const repository = {
        initialize,
        reload: () => {
            const op = writes
                .catch(() => {})
                .then(read)
                .then(() => {
                    listeners.forEach((l) => l())
                })
            writes = op
            return op
        },
        snapshot: () => state,
        subscribe: (listener: () => void) => {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        setDraft: (draft: string) =>
            mutate((s) => {
                s.draft = draft
            }),
        notify: (message: string, kind: AppNotification['kind'] = 'info', thoughtId?: string, source?: string) =>
            mutate((s) => {
                if (!message.trim()) return
                if (source && s.notifications.some((item) => item.source === source)) return
                const last = s.notifications.at(-1)
                if (last?.message === message && last.kind === kind && last.thoughtId === thoughtId &&
                    now() - Date.parse(last.createdAt) < 60000) return
                s.notifications.push({ id: id(), message: historyError(message), kind, thoughtId, source, createdAt: stamp(), read: false })
                s.notifications = s.notifications.slice(-100)
            }),
        readNotifications: () => mutate((s) => { s.notifications.forEach((item) => { item.read = true }) }),
        removeNotification: (notificationId: string) => mutate((s) => {
            s.notifications = s.notifications.filter((item) => item.id !== notificationId)
        }),
        clearNotifications: () => mutate((s) => { s.notifications = [] }),
        preferences: (patch: Partial<Preferences>) =>
            mutate((s) => {
                Object.assign(s.preferences, patch)
            }),
        projects: async () => {
            await initialize()
            return state.projects
                .filter((p) => !p.deleted)
                .map((p) => ({
                    ...p,
                    thoughtCount: state.thoughts.filter((t) => !t.deleted && t.projectId === p.id)
                        .length
                }))
        },
        thoughts: async () => {
            await initialize()
            return state.thoughts
                .filter((t) => !t.deleted)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        },
        createProject: (body: Pick<Project, 'name' | 'description' | 'color' | 'notionPageId' | 'notionPageRoot' | 'notionPageTitle'>) =>
            mutate((s) => {
                if (!body.name.trim()) throw new Error('Укажи название проекта')
                ensureUniquePage(s, body.notionPageId)
                const p: LocalProject = {
                    ...body,
                    name: body.name.trim(),
                    id: id(),
                    createdAt: stamp(),
                    updatedAt: stamp(),
                    revision: 1,
                    deleted: false,
                    notion: {}
                }
                s.projects.push(p)
                return p
            }),
        updateProject: (projectId: string, body: Partial<Project>) =>
            mutate((s) => {
                const p = s.projects.find((p) => p.id === projectId && !p.deleted)
                if (!p) throw new Error('Проект не найден')
                for (const key of ['name', 'description', 'color'] as const)
                    if (body[key] !== undefined) p[key] = body[key]!
                if (
                    body.notionPageId !== undefined &&
                    ((p.notionPageId ?? null) !== body.notionPageId || p.notionPageRoot !== body.notionPageRoot)
                ) {
                    ensureUniquePage(s, body.notionPageId, p.id)
                    p.notionPageId = body.notionPageId
                    p.notionPageRoot = body.notionPageRoot
                    for (const thought of s.thoughts)
                        if (!thought.deleted && thought.projectId === p.id) touch(thought)
                }
                if (body.notionPageTitle !== undefined) p.notionPageTitle = body.notionPageTitle
                touch(p)
                return p
            }),
        deleteProject: (projectId: string) =>
            mutate((s) => {
                const p = s.projects.find((p) => p.id === projectId)
                if (!p) throw new Error('Проект не найден')
                p.deleted = true
                if (s.lastProjectId === p.id) s.lastProjectId = null
                touch(p)
                s.thoughts
                    .filter((t) => t.projectId === projectId && !t.deleted)
                    .forEach((t) => {
                        t.projectId = null
                        t.projectLocked = false
                        t.aiPending = true
                        t.attempts = 0
                        t.retryAt = 0
                        touch(t)
                    })
                return { ok: true }
            }),
        createThought: (rawText: string, projectId: string | null) =>
            mutate((s) => {
                if (!rawText.trim() || rawText.length > 10000)
                    throw new Error('Мысль должна содержать от 1 до 10000 символов')
                if (projectId && !s.projects.some((p) => p.id === projectId && !p.deleted))
                    throw new Error('Проект не найден')
                const t: LocalThought = {
                    id: id(),
                    rawText: rawText.trim(),
                    title: rawText.trim().slice(0, 75),
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
                    createdAt: stamp(),
                    updatedAt: stamp(),
                    revision: 1,
                    deleted: false,
                    aiPending: true,
                    syncVersion: id(),
                    attempts: 0,
                    retryAt: 0,
                    notion: {}
                }
                s.thoughts.push(t)
                if (projectId) s.lastProjectId = projectId
                s.draft = ''
                return t
            }),
        updateThought: (noteId: string, body: Partial<Thought>, revision?: number) =>
            mutate((s) => {
                const t = findNote(s, noteId)
                if (revision !== undefined && t.revision !== revision)
                    throw new Error('Мысль изменилась. Открой её ещё раз.')
                const changedText = body.rawText !== undefined && body.rawText !== t.rawText
                for (const key of ['title', 'rawText', 'summary', 'category', 'status'] as const)
                    if (body[key] !== undefined) Object.assign(t, { [key]: body[key] })
                if (body.category !== undefined) {
                    t.categoryLocked = true
                    t.categoryDefinition = allTypes(s.customCategories).find((c) => c.id === body.category)
                }
                if ('projectId' in body) {
                    if (
                        body.projectId &&
                        !s.projects.some((p) => p.id === body.projectId && !p.deleted)
                    )
                        throw new Error('Проект не найден')
                    t.projectId = body.projectId ?? null
                    t.projectLocked = Boolean(body.projectId)
                }
                if (changedText) {
                    delete t.aiFeedback
                    t.classificationProposal = null
                    t.aiPending = true
                    t.status = 'pending'
                    t.attempts = 0
                    t.retryAt = 0
                } else if (body.status === 'ready') {
                    delete t.aiFeedback
                    t.classificationProposal = null
                    t.aiPending = false
                    t.errorMessage = null
                    t.attempts = 0
                    t.retryAt = 0
                }
                touch(t)
                return t
            }),
        updateChecklist: (noteId: string, revision: number, index?: number) =>
            mutate((s) => {
                const t = findNote(s, noteId)
                if (t.revision !== revision) throw new Error('Мысль изменилась. Попробуй ещё раз.')
                const summary = index === undefined
                    ? checklistFromList(t.summary)
                    : toggleChecklistItem(t.summary, index)
                if (summary.length > 800) throw new Error('Чек-лист превышает 800 символов')
                if (summary !== t.summary) {
                    t.summary = summary
                    touch(t)
                }
                return t
            }),
        confirmClassification: (noteId: string, revision: number, proposal: ClassificationProposal, projectOnly = false) =>
            mutate((s) => {
                const t = findNote(s, noteId)
                if (t.revision !== revision || !t.classificationProposal)
                    throw new Error('Мысль изменилась. Открой актуальное предложение ещё раз.')
                applyClassification(s, t, proposal, projectOnly ? 'project' : 'all')
                touch(t)
                return t
            }),
        dismissClassification: (noteId: string, revision: number) => mutate((s) => {
            const t = findNote(s, noteId)
            if (t.revision !== revision) throw new Error('Мысль изменилась. Открой её ещё раз.')
            t.classificationProposal = null
            t.aiPending = Boolean(t.aiFeedback)
            t.status = 'needs_review'
            touch(t)
        }),
        deleteThought: (noteId: string) =>
            mutate((s) => {
                const t = findNote(s, noteId)
                t.deleted = true
                touch(t)
                return { ok: true }
            }),
        processThought: (noteId: string, feedback?: string) =>
            mutate((s) => {
                const t = findNote(s, noteId)
                if (feedback !== undefined) {
                    const instruction = feedback.trim()
                    if (!instruction || instruction.length > 1000)
                        throw new Error('Опиши правку в 1–1000 символах')
                    t.aiFeedback = instruction
                } else {
                    delete t.aiFeedback
                    t.classificationProposal = null
                    t.status = 'pending'
                }
                t.aiPending = true
                t.attempts = 0
                t.retryAt = 0
                t.errorMessage = null
                touch(t)
                return t
            }),
        retry: () =>
            mutate((s) => {
                s.thoughts.forEach((t) => {
                    t.retryAt = 0
                    t.attempts = 0
                })
            }),
        resolveNotionConflict: (noteId: string, root: string, revision: number, remoteVersion: string, keepBoth: boolean) =>
            mutate((s) => {
                const local = findNote(s, noteId)
                const remote = local.notionConflicts?.[root]
                if (local.revision !== revision || !remote || notionVersionOf(remote) !== remoteVersion)
                    throw new Error('Версии изменились. Проверь их ещё раз.')
                if (keepBoth) {
                    s.thoughts.push({
                        ...local,
                        id: id(),
                        title: `${local.title.slice(0, 120)} (моя копия)`,
                        localId: undefined,
                        localRevision: undefined,
                        notionVersion: undefined,
                        notion: {},
                        notionErrors: undefined,
                        notionConflicts: undefined,
                        revision: 1,
                        syncVersion: id()
                    })
                }
                applyRemoteNote(local, remote, root)
            }),
        importRemote: (
            projects: Project[],
            thoughts: Thought[],
            root: string,
            source: 'notion' | 'server' = 'notion'
        ) =>
            mutate((s) => {
                const projectIds = new Map<string, string>()
                for (const remote of projects) {
                    const existing = s.projects.find(
                        (p) =>
                            p.id === (remote.localId || remote.id) ||
                            p.notion[root]?.id === remote.id
                    )
                    const localId = existing?.id || remote.localId || remote.id
                    projectIds.set(remote.id, localId)
                    if (existing && source === 'notion' && !existing.notion[root])
                        existing.notion[root] = {
                            id: remote.id,
                            revision: remote.localId
                                ? (remote.localRevision ?? 0)
                                : existing.revision
                        }
                    if (!existing)
                        s.projects.push({
                            ...remote,
                            id: localId,
                            revision: 1,
                            deleted: false,
                            notion:
                                source === 'notion'
                                    ? { [root]: { id: remote.id, revision: 1 } }
                                    : {}
                        })
                }
                for (const remote of thoughts) {
                    const imported = {
                        ...remote,
                        projectId: remote.projectId ? projectIds.get(remote.projectId) || null : null
                    }
                    const type = remote.categoryDefinition
                    if (type?.id.startsWith('custom:') && !s.customCategories.some((c) => c.id === type.id)) s.customCategories.push(type)
                    const existing = s.thoughts.find(
                        (t) =>
                            t.id === (remote.localId || remote.id) ||
                            t.notion[root]?.id === remote.id
                    )
                    if (existing) {
                        if (source !== 'notion') continue
                        const version = notionVersionOf(remote)
                        let link = existing.notion[root]
                        if (!link) {
                            link = existing.notion[root] = {
                                id: remote.id, parentId: remote.notionParentId,
                                revision: remote.notionVersion && remote.notionVersion === existing.syncVersion
                                    ? existing.revision
                                    : remote.localId ? (remote.localRevision ?? 0) : existing.revision,
                                version
                            }
                        }
                        if (existing.deleted) continue
                        if (link.version === version) {
                            link.id = remote.id
                            link.parentId = remote.notionParentId
                            if (existing.notionConflicts) delete existing.notionConflicts[root]
                            continue
                        }
                        if (remote.notionVersion && remote.notionVersion === existing.syncVersion) {
                            existing.notion[root] = { id: remote.id, parentId: remote.notionParentId, revision: existing.revision, version }
                            if (existing.notionConflicts) delete existing.notionConflicts[root]
                        } else if (!link.version && !remote.notionVersion && remote.localRevision === link.revision &&
                            (link.revision !== existing.revision || remote.updatedAt === existing.updatedAt)) {
                            link.version = version
                        } else if (link.revision === existing.revision && !existing.aiFeedback) {
                            applyRemoteNote(existing, imported, root)
                        } else {
                            existing.notionConflicts ??= {}
                            existing.notionConflicts[root] = imported
                        }
                        continue
                    }
                    s.thoughts.push({
                        ...imported,
                        id: remote.localId || remote.id,
                        revision: 1,
                        deleted: false,
                        aiPending: remote.status === 'pending',
                        attempts: 0,
                        retryAt: 0,
                        notion:
                            source === 'notion' ? { [root]: { id: remote.id, parentId: remote.notionParentId, revision: 1, version: notionVersionOf(remote) } } : {}
                    })
                }
            }),
        flush: (adapters: SyncAdapters) => {
            if (flight) return flight
            flight = (async () => {
                await initialize()
                const destination = adapters.notion
                const errors: unknown[] = []
                const projectErrors = new Map<string, unknown>()
                if (destination)
                    for (const captured of [...state.projects]) {
                        if (
                            captured.deleted ||
                            captured.notion[destination.root]?.revision === captured.revision
                        )
                            continue
                        try {
                            const remoteId = await destination.project(
                                clone(captured),
                                captured.notion[destination.root]?.id
                            )
                            await mutate((s) => {
                                const current = s.projects.find((p) => p.id === captured.id)!
                                current.notion[destination.root] = {
                                    id: remoteId,
                                    revision: captured.revision
                                }
                            })
                        } catch (error) {
                            projectErrors.set(captured.id, error)
                            errors.push(error)
                        }
                    }
                for (const entry of [...state.thoughts]) {
                    let current = state.thoughts.find((t) => t.id === entry.id)!
                    if (!current.deleted && current.classificationProposal && !state.preferences.confirmAIProposals) {
                        await mutate((s) => {
                            const t = findNote(s, entry.id)
                            if (t.classificationProposal) {
                                applyClassification(s, t, t.classificationProposal, 'automatic')
                                touch(t)
                            }
                        })
                        current = state.thoughts.find((t) => t.id === entry.id)!
                    }
                    if (
                        !current.deleted &&
                        !(destination && current.notionConflicts?.[destination.root]) &&
                        current.aiPending &&
                        current.retryAt <= now() &&
                        adapters.enrich
                    ) {
                        const captured = clone(current)
                        const historyId = id()
                        const startedAt = now()
                        await mutate((s) => {
                            s.aiHistory.push({ id: historyId, thoughtId: captured.id, revision: captured.revision,
                                startedAt: new Date(startedAt).toISOString(), status: 'started',
                                inputText: captured.rawText, ...adapters.aiModels })
                            s.aiHistory = s.aiHistory.slice(-500)
                        })
                        try {
                            const result = await adapters.enrich(
                                captured,
                                state.projects.filter((p) => !p.deleted)
                            )
                            await mutate((s) => {
                                const t = s.thoughts.find((t) => t.id === captured.id)!
                                const history = s.aiHistory.find((h) => h.id === historyId)
                                if (history) Object.assign(history, {
                                    finishedAt: stamp(), durationMs: Math.max(0, now() - startedAt),
                                    status: result.errorMessage ? 'partial' : 'success',
                                    generatorModel: result.generatorModel ?? adapters.aiModels?.generatorModel,
                                    decisionModel: result.decisionModel ?? adapters.aiModels?.decisionModel,
                                    usage: historyUsage(result.usage),
                                    error: result.errorMessage ? historyError(result.errorMessage) : undefined,
                                    applied: !t.deleted && t.revision === captured.revision,
                                    result: { title: result.title, summary: result.summary, category: result.category,
                                        projectId: result.projectId, confidence: result.confidence, tags: result.tags,
                                        classificationProposal: result.classificationProposal }
                                })
                                if (t.deleted || t.revision !== captured.revision) return
                                for (const key of [
                                    'title',
                                    'summary',
                                    'tags',
                                    'category',
                                    'confidence',
                                    'errorMessage',
                                    'generatorModel',
                                    'decisionModel',
                                    'status'
                                ] as const) {
                                    if (result[key] !== undefined && !(key === 'category' && t.categoryLocked))
                                        Object.assign(t, { [key]: result[key] })
                                }
                                if (!captured.aiFeedback)
                                    t.classificationProposal = result.classificationProposal ?? null
                                t.categoryDefinition = allTypes(s.customCategories).find((c) => c.id === t.category)
                                if (!t.projectLocked && result.projectId !== undefined)
                                    t.projectId = s.projects.some(
                                        (p) => !p.deleted && p.id === result.projectId
                                    )
                                        ? result.projectId
                                        : null
                                t.aiPending = (Boolean(captured.aiFeedback) || !t.classificationProposal) &&
                                    (Boolean(result.errorMessage) || result.status === 'pending')
                                if (!t.aiPending) delete t.aiFeedback
                                if (!s.preferences.confirmAIProposals && t.classificationProposal && !captured.aiFeedback) {
                                    applyClassification(s, t, t.classificationProposal, 'automatic')
                                }
                                t.attempts = t.aiPending ? t.attempts + 1 : 0
                                t.retryAt = t.aiPending
                                    ? now() + Math.min(300000, 2000 * 2 ** t.attempts)
                                    : 0
                                touch(t)
                            })
                        } catch (error) {
                            await mutate((s) => {
                                const t = s.thoughts.find((t) => t.id === captured.id)!
                                const history = s.aiHistory.find((h) => h.id === historyId)
                                if (history) Object.assign(history, {
                                    finishedAt: stamp(), durationMs: Math.max(0, now() - startedAt), status: 'error',
                                    applied: false, error: historyError(error instanceof Error ? error.message : String(error)),
                                    usage: historyUsage(typeof error === 'object' && error !== null ? (error as { usage?: AIUsage }).usage : undefined)
                                })
                                if (t.deleted || t.revision !== captured.revision) return
                                t.errorMessage =
                                    error instanceof Error ? error.message : String(error)
                                t.attempts++
                                t.retryAt = now() + Math.min(300000, 2000 * 2 ** t.attempts)
                            })
                        }
                    }
                    current = state.thoughts.find((t) => t.id === entry.id)!
                    if (!destination) continue
                    if (current.notionConflicts?.[destination.root]) continue
                    const link = current.notion[destination.root]
                    const revision = current.revision
                    try {
                        if (current.deleted) {
                            if (link && link.revision !== current.revision) {
                                await destination.remove(link.id)
                                await mutate((s) => {
                                    const t = s.thoughts.find((t) => t.id === current.id)!
                                    t.notion[destination.root] = {
                                        id: link.id,
                                        revision: current.revision
                                    }
                                })
                            }
                            continue
                        }
                        if (link?.revision === current.revision) continue
                        const project = current.projectId
                            ? state.projects.find((p) => p.id === current.projectId && !p.deleted)
                            : undefined
                        const projectLink = project?.notion[destination.root]
                        if (current.projectId && (!projectLink || projectLink.revision !== project?.revision)) {
                            if (projectErrors.has(current.projectId)) throw projectErrors.get(current.projectId)
                            continue
                        }
                        // The managed page remains the logical project ID even when notes live elsewhere.
                        const linkedPage = project?.notionPageRoot === destination.root
                            ? project.notionPageId : null
                        const captured = clone(current)
                        const remoteId = await destination.thought(
                            captured,
                            linkedPage || projectLink?.id || null,
                            link?.id,
                            projectLink?.id ?? null
                        )
                        await mutate((s) => {
                            const t = s.thoughts.find((t) => t.id === captured.id)!
                            t.notion[destination.root] = {
                                ...(typeof remoteId === 'string' ? { id: remoteId } : remoteId),
                                revision: captured.revision,
                                version: captured.syncVersion ?? `${captured.revision}:${captured.updatedAt}`
                            }
                            if (t.notionErrors) delete t.notionErrors[destination.root]
                        })
                    } catch (error) {
                        if (!current.deleted) {
                            const message = historyError(error instanceof Error ? error.message : String(error))
                            const previous = current.notionErrors?.[destination.root]
                            if (previous?.revision !== revision || previous.message !== message)
                                await mutate((s) => {
                                    const t = s.thoughts.find((row) => row.id === current.id)
                                    if (!t || t.deleted || t.revision !== revision) return
                                    t.notionErrors ??= {}
                                    t.notionErrors[destination.root] = { revision, message }
                                })
                        }
                        errors.push(error)
                    }
                }
                if (destination)
                    for (const p of [...state.projects]) {
                        const link = p.notion[destination.root]
                        if (!p.deleted || !link || link.revision === p.revision) continue
                        if (
                            state.thoughts.some(
                                (t) =>
                                    t.notion[destination.root] &&
                                    t.notion[destination.root].revision !== t.revision
                            )
                        )
                            continue
                        try {
                            await destination.remove(link.id)
                            await mutate((s) => {
                                s.projects.find((row) => row.id === p.id)!.notion[
                                    destination.root
                                ] = { id: link.id, revision: p.revision }
                            })
                        } catch (error) {
                            errors.push(error)
                        }
                    }
                if (errors.length) throw errors[0]
            })().finally(() => {
                flight = undefined
            })
            return flight
        }
    }
    return repository
}
