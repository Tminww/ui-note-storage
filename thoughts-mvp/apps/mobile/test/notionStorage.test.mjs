import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

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
        if (path === '/pages' && method === 'POST') {
            const id = `page-${++sequence}`
            pages.set(id, {
                id,
                name: body.properties.title.title[0].text.content,
                parent: body.parent.page_id,
                blocks: body.children.map((b) => ({ ...b, id: `block-${++sequence}` }))
            })
            if (loseCreate) {
                loseCreate = false
                throw new Error('Response lost')
            }
            result = { id }
        } else if (child) {
            const id = child[1]
            if (method === 'PATCH') {
                result = {
                    results: body.children.map((b) => ({ ...b, id: `block-${++sequence}` }))
                }
                pages.get(id).blocks.push(...result.results)
            } else
                result = {
                    results: [
                        ...(pages.get(id)?.blocks || []),
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
            for (const p of pages.values()) {
                const b = p.blocks.find((b) => b.id === block[1])
                if (!b) continue
                if (method === 'PATCH') Object.assign(b, body)
                if (method === 'DELETE') p.blocks = p.blocks.filter((b) => b.id !== block[1])
            }
        } else if (page) {
            const p = pages.get(page[1])
            if (method === 'PATCH') {
                if (body.properties) p.name = body.properties.title.title[0].text.content
                if (body.archived) p.archived = true
            }
            result = { id: p.id, parent: { page_id: p.parent }, archived: p.archived || false }
        }
        return new Response(JSON.stringify(result), { status: 200 })
    }
    globalThis.__notionFixture = {
        getNotionRoot: () => 'root',
        readSecret: async () => 'mock-key',
        enrichNote: async () => ({}),
        localSettings: async () => ({}),
        saveLocalSettings: async () => ({}),
        request
    }
    const source = stripTypeScriptTypes(
        readFileSync(new URL('../src/notionStorage.ts', import.meta.url), 'utf8')
    ).replace(/^import .*$/gm, '')
    const stub =
        'const {getNotionRoot,readSecret,enrichNote,localSettings,saveLocalSettings,request}=globalThis.__notionFixture;const fetch=request;'
    const api = await import(
        `data:text/javascript;base64,${Buffer.from(stub + source + `\n// ${Math.random()}`).toString('base64')}`
    )
    return { api, pages, calls, loseNextCreate: () => (loseCreate = true) }
}
test('updating a project preserves user-authored Notion paragraphs', async () => {
    const f = await fixture()
    await f.api.updateProject('p', { description: 'Updated' })
    assert.ok(f.pages.get('p').blocks.some((b) => b.id === 'user-p'))
    assert.equal(f.calls.filter((c) => c.method === 'DELETE').length, 0)
    const meta = f.pages.get('p').blocks.find((b) => b.id === 'meta-p')
    assert.match(meta.paragraph.rich_text[0].text.content, /Updated/)
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
        'New'
    )
    assert.ok(f.pages.get('n').blocks.some((b) => b.id === 'user-n'))
    assert.equal(f.calls.filter((c) => c.method === 'DELETE').length, 0)
})
