import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { createHash } from 'node:crypto'
import { notionVersionOf } from '../src/localCore.ts'

const prefix = 'THOUGHTS_V1:'
const paragraph = (id, text) => ({
    id,
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: text }, plain_text: text }] }
})
async function fixture() {
    let sequence = 0,
        loseCreate = false
    const pages = new Map([
        [
            'p',
            {
                id: 'p',
                name: '📁 Работа',
                parent: 'root',
                blocks: [
                    paragraph(
                        'meta-p',
                        prefix + JSON.stringify({ kind: 'project', name: 'Работа' })
                    ),
                    paragraph('user-p', 'Мой текст в Notion')
                ]
            }
        ]
    ])
    const nested = new Map()
    const denied = new Set()
    const insertBlocks = (blocks) => blocks.map((block) => {
        const id = `block-${++sequence}`
        if (block.type !== 'toggle') return { ...block, id }
        const { children, ...toggle } = block.toggle
        nested.set(id, insertBlocks(children))
        return { ...block, id, toggle, has_children: true }
    })
    const calls = []
    const request = async (url, init = {}) => {
        const path = new URL(url).pathname.replace('/v1', ''),
            method = init.method || 'GET',
            body = init.body ? JSON.parse(init.body) : undefined
        calls.push({ path, method, body })
        let result = {}
        const child = path.match(/^\/blocks\/([^/]+)\/children$/)
        const block = path.match(/^\/blocks\/([^/]+)$/)
        const page = path.match(/^\/pages\/([^/]+)$/)
        const move = path.match(/^\/pages\/([^/]+)\/move$/)
        if (path === '/search' && method === 'POST') {
            result = {
                results: [
                    { id: 'a'.repeat(32), properties: { title: { type: 'title', title: [{ plain_text: 'Работа' }] } } },
                    { id: 'b'.repeat(32), archived: true },
                    { id: 'c'.repeat(32), properties: { title: { type: 'title', title: [{ plain_text: '💭 Служебная мысль' }] } } }
                ],
                has_more: true,
                next_cursor: 'next'
            }
        } else if (path === '/pages' && method === 'POST') {
            const id = `page-${++sequence}`
            pages.set(id, {
                id,
                name: body.properties.title.title[0].text.content,
                parent: body.parent.page_id,
                blocks: insertBlocks(body.children)
            })
            if (loseCreate) {
                loseCreate = false
                throw new Error('Response lost')
            }
            result = { id }
        } else if (child) {
            const id = child[1]
            if (denied.has(id)) return new Response(JSON.stringify({ message: 'Access denied' }), { status: 404 })
            if (method === 'PATCH') {
                result = {
                    results: insertBlocks(body.children)
                }
                pages.get(id).blocks.push(...result.results)
            } else
                result = {
                    results: [
                        ...(pages.get(id)?.blocks || nested.get(id) || []),
                        ...[...pages.values()]
                            .filter((p) => p.parent === id && !p.archived)
                            .map((p) => ({
                                id: p.id,
                                type: 'child_page',
                                child_page: { title: p.name }
                            }))
                    ],
                    has_more: false
                }
        } else if (block) {
            const blockId = block[1]
            for (const blocks of [...[...pages.values()].map((page) => page.blocks), ...nested.values()]) {
                const index = blocks.findIndex((block) => block.id === blockId)
                if (index < 0) continue
                if (method === 'PATCH') Object.assign(blocks[index], body)
                if (method === 'DELETE') blocks.splice(index, 1)
            }
        } else if (move) {
            pages.get(move[1]).parent = body.parent.page_id
        } else if (page) {
            const p = pages.get(page[1])
            if (method === 'PATCH') {
                if (body.properties) p.name = body.properties.title.title[0].text.content
                if (body.archived) p.archived = true
            }
            result = {
                id: p.id, parent: { page_id: p.parent }, archived: p.archived || false,
                properties: { Name: { type: 'title', title: [{ plain_text: p.name }] } }
            }
        }
        return new Response(JSON.stringify(result), { status: 200 })
    }
    globalThis.__notionFixture = {
        getNotionRoot: () => 'root',
        getNotionOAuth: () => null,
        readSecret: async () => 'mock-key',
        enrichNote: async () => ({}),
        localSettings: async () => ({}),
        saveLocalSettings: async () => ({}),
        notionVersionOf,
        Crypto: { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (algorithm, data) => createHash(algorithm).update(data).digest('hex') },
        request
    }
    const source = stripTypeScriptTypes(
        readFileSync(new URL('../src/notionStorage.ts', import.meta.url), 'utf8')
    ).replace(/^import .*$/gm, '')
    const stub =
        'const {getNotionOAuth,getNotionRoot,readSecret,enrichNote,localSettings,saveLocalSettings,request,notionVersionOf,Crypto}=globalThis.__notionFixture;const fetch=request;'
    const api = await import(
        `data:text/javascript;base64,${Buffer.from(stub + source + `\n// ${Math.random()}`).toString('base64')}`
    )
    return { api, pages, nested, calls, denied, loseNextCreate: () => (loseCreate = true) }
}
test('updating a project preserves user-authored Notion paragraphs', async () => {
    const f = await fixture()
    await f.api.updateProject('p', { description: 'Updated' })
    assert.ok(f.pages.get('p').blocks.some((b) => b.id === 'user-p'))
    assert.ok(!f.pages.get('p').blocks.some((b) => b.id === 'meta-p'))
    const toggle = f.pages.get('p').blocks.find((b) => b.type === 'toggle')
    assert.equal(toggle.toggle.rich_text[0].text.content, 'Данные синхронизации Thoughts')
    assert.match(f.nested.get(toggle.id)[0].paragraph.rich_text[0].text.content, /Updated/)
    assert.equal((await f.api.getProjects())[0].description, 'Updated')
    await f.api.updateProject('p', { description: 'Updated again' })
    assert.equal(f.pages.get('p').blocks.filter((b) => b.type === 'toggle').length, 1)
})
test('lost Notion create acknowledgement is reconciled by stable local ID', async () => {
    const f = await fixture()
    const local = {
        id: 'local-project',
        name: 'Личное',
        description: 'Тест',
        color: '#123456',
        revision: 1
    }
    const first = await f.api.createNotionSyncAdapter({ projects: [], thoughts: [] })
    f.loseNextCreate()
    await assert.rejects(first.project(local), /Response lost/)
    const second = await f.api.createNotionSyncAdapter()
    const id = await second.project(local)
    assert.ok(id)
    assert.equal(f.calls.filter((c) => c.path === '/pages' && c.method === 'POST').length, 1)
})
test('one Notion snapshot lists root and project blocks only once', async () => {
    const f = await fixture()
    const snapshot = await f.api.getNotionSnapshot()
    assert.equal(snapshot.root, 'root')
    assert.equal(snapshot.projects[0].name, 'Работа')
    assert.equal(f.calls.filter((call) => call.path === '/blocks/root/children').length, 1)
    assert.equal(f.calls.filter((call) => call.path === '/blocks/p/children').length, 1)
})
test('Notion page picker searches by title, with pagination and no managed or archived entries', async () => {
    const f = await fixture()
    assert.deepEqual(await f.api.searchNotionPages('  Работа  ', 'cursor', 'candidate-token'), {
        pages: [{ id: 'a'.repeat(32), title: 'Работа' }],
        cursor: 'next'
    })
    assert.deepEqual(f.calls[0].body, {
        query: 'Работа', start_cursor: 'cursor', page_size: 25, filter: { property: 'object', value: 'page' }
    })
})
test('updating thought text changes only recorded owned blocks', async () => {
    const f = await fixture()
    f.pages.set('n', {
        id: 'n',
        name: '💭 Thought',
        parent: 'root',
        blocks: [
            paragraph(
                'meta-n',
                prefix +
                    JSON.stringify({
                        kind: 'thought',
                        localId: 'local-note',
                        rawText: 'Old',
                        _textBlocks: ['owned']
                    })
            ),
            paragraph('owned', 'Old'),
            paragraph('user-n', 'Keep this paragraph')
        ]
    })
    const adapter = await f.api.createNotionSyncAdapter({ projects: [], thoughts: [] })
    await adapter.thought(
        {
            id: 'local-note',
            title: 'Updated',
            rawText: 'New',
            summary: '- One\n- Two',
            projectId: null,
            revision: 2,
            notion: {},
            aiPending: false,
            attempts: 0,
            retryAt: 0
        },
        null,
        'n'
    )
    assert.equal(
        f.pages.get('n').blocks.find((b) => b.id === 'owned').paragraph.rich_text[0].text.content,
        'Резюме\n• One\n• Two\n\nИсходный текст\nNew'
    )
    assert.ok(f.pages.get('n').blocks.some((b) => b.id === 'user-n'))
    assert.deepEqual(f.calls.filter((c) => c.method === 'DELETE').map((c) => c.path), ['/blocks/meta-n'])
    assert.equal((await f.api.getThoughts())[0].rawText, 'New')
    assert.equal((await f.api.getThoughts())[0].summary, '- One\n- Two')
})

test('a linked page recovers only app notes for its registered project', async () => {
    const f = await fixture()
    const target = '40e31ec95e44810893c6dba5d11faf95'
    assert.equal(f.api.parseNotionProjectPage(`https://app.notion.com/p/${target}?pvs=21`), target)
    assert.throws(() => f.api.parseNotionProjectPage(`https://notion.so.example.org/${target}`), /Вставь ссылку/)
    f.pages.set(target, { id: target, name: 'Existing page', blocks: [paragraph('user', 'Keep me')] })
    f.pages.set('foreign', { id: 'foreign', parent: target, name: '💭 Manual', blocks: [] })
    assert.equal(await f.api.verifyNotionProjectPage(target), 'Existing page')
    const adapter = await f.api.createNotionSyncAdapter()
    await adapter.project({ id: 'local-project', name: 'Музыка', revision: 1, notionPageId: target, notionPageRoot: 'root' }, 'p')
    const note = {
        id: 'local-note', title: 'Ритм', rawText: 'Тренировка', revision: 1, notion: {},
        notionErrors: { root: { revision: 1, message: 'Local error detail' } }
    }
    const noteId = await adapter.thought(note, 'p')
    const toggle = f.pages.get(noteId).blocks.find((b) => b.type === 'toggle')
    assert.doesNotMatch(f.nested.get(toggle.id)[0].paragraph.rich_text[0].text.content, /notionErrors|Local error detail/)
    assert.equal(await adapter.thought(note, target, noteId, 'p'), noteId)
    assert.equal(f.pages.get(noteId).parent, target)
    const snapshot = await f.api.getNotionSnapshot()
    assert.equal(snapshot.projects[0].notionPageId, target)
    assert.deepEqual(snapshot.thoughts.map(({ id, projectId }) => [id, projectId]), [[noteId, 'p']])
    assert.equal(f.pages.get(target).name, 'Existing page')
    assert.equal(f.pages.get(target).blocks[0].id, 'user')
})

test('an inaccessible linked page blocks only writes to that page', async () => {
    const f = await fixture()
    const target = '40e31ec95e44810893c6dba5d11faf95'
    const adapter = await f.api.createNotionSyncAdapter()
    await adapter.project({ id: 'local-project', name: 'Музыка', revision: 1, notionPageId: target, notionPageRoot: 'root' }, 'p')
    f.denied.add(target)
    const snapshot = await f.api.getNotionSnapshot()
    assert.match(snapshot.linkedErrors.get(target).message, /Access denied/)
    const sync = await f.api.createNotionSyncAdapter(snapshot)
    const note = { id: 'local-note', title: 'Ритм', rawText: 'Тренировка', revision: 1, notion: {} }
    await assert.rejects(sync.thought(note, target, undefined, 'p'), /Access denied/)
    assert.ok(await sync.thought(note, null))
})

test('edits in the managed Notion text are imported and stale writes are refused', async () => {
    const f = await fixture()
    const adapter = await f.api.createNotionSyncAdapter()
    const note = {
        id: 'local-note', title: 'Задачи', rawText: 'Позвонить', summary: '- [ ] Позвонить',
        updatedAt: '2026-01-01T00:00:00.000Z', revision: 1, syncVersion: 'v1', notion: {}
    }
    const pageId = await adapter.thought(note, null)
    const page = f.pages.get(pageId)
    const managed = page.blocks.find((block) => block.type === 'paragraph')
    managed.paragraph.rich_text[0].text.content = 'Резюме\n☑ Позвонить\n\nИсходный текст\nПозвонил'
    page.name = 'Звонок завершён'
    const remote = (await f.api.getNotionSnapshot([pageId])).thoughts[0]
    assert.equal(remote.title, 'Звонок завершён')
    assert.equal(remote.rawText, 'Позвонил')
    assert.equal(remote.summary, '- [x] Позвонить')
    assert.match(remote.notionVersion, /^notion:/)
    await assert.rejects(adapter.thought({
        ...note, rawText: 'Моя версия', revision: 2, syncVersion: 'v2',
        notion: { root: { id: pageId, revision: 1, version: 'v1' } }
    }, null, pageId), /Страница изменилась/)
    assert.match(managed.paragraph.rich_text[0].text.content, /Позвонил/)
})
