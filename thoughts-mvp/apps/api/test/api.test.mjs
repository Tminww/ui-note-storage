import test from 'node:test'
import assert from 'node:assert/strict'
import { createSQLiteRepository } from '../src/storage/sqlite.mjs'
import { createAI } from '../src/ai/providers.mjs'
import { createPipeline } from '../src/ai/pipeline.mjs'
import { createApp } from '../src/app.mjs'

function createMockFetch() {
    const requests = []
    const mock = async (url, options) => {
        const body = JSON.parse(options.body)
        requests.push({ url, body })
        if (url.includes('/decisions')) {
            const projectKeys = Object.keys(body.questions.project?.criteria || {})
            const key = projectKeys.includes('p0') ? 'p0' : 'inbox'
            const answers = {
                category: {
                    type: 'choice',
                    choice: 'idea',
                    confidence: 0.96,
                    probabilities: { idea: 0.96 }
                }
            }
            if (body.questions.project)
                answers.project = {
                    type: 'choice',
                    choice: key,
                    confidence: 0.94,
                    probabilities: { [key]: 0.94 }
                }
            return new Response(JSON.stringify({ answers }), { status: 200 })
        }
        return new Response(
            JSON.stringify({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                title: 'Улучшить формы',
                                summary: 'Разделить UI и печатные поля.',
                                tags: ['формы', 'UI']
                            })
                        }
                    }
                ]
            }),
            { status: 200 }
        )
    }
    return { mock, requests }
}
const settingsEnv = { OPENROUTER_API_KEY: 'mock-key', STORAGE_DRIVER: 'sqlite' }

test('phone enrichment returns an unconfirmed suggestion and accepts confirmed custom types', async () => {
    const calls = []
    let confident = false
    const ai = createAI({ env: settingsEnv, fetchFn: async (url, init) => {
        const body = JSON.parse(init.body); calls.push(body)
        if (url.includes('/decisions')) return new Response(JSON.stringify({ answers: {
            category: { type: 'choice', choice: confident ? 'c0' : 'unclassified', confidence: 0.99 },
            project: { type: 'choice', choice: 'inbox', confidence: 0.99 }
        } }))
        const proposing = body.messages[0].content.includes('Jev could not')
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(proposing
            ? { project: { name: 'Сад', description: 'Растения' }, category: { name: 'Покупка', description: 'Что купить' }, reason: 'Новый контекст' }
            : { title: 'Купить семена', summary: 'Купить семена для сада', tags: [] }) } }] }))
    } })
    const app = createApp({ repository: createSQLiteRepository(':memory:'), ai, env: settingsEnv })
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
    const enrich = async (body) => {
        const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/enrich`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        })
        return { code: response.status, body: await response.json() }
    }
    try {
        const result = await enrich({ rawText: 'Купить семена', projects: [] })
        assert.equal(result.code, 200); assert.equal(result.body.status, 'needs_review')
        assert.equal(result.body.classificationProposal.project.name, 'Сад')
        assert.equal(result.body.classificationProposal.category.name, 'Покупка')
        assert.equal(app.repository.listProjects().length, 0)
        assert.equal(app.repository.listThoughts().length, 0)
        confident = true
        const categories = [{ id: 'custom:buy', name: 'Покупка', description: 'Что купить' }]
        const next = await enrich({ rawText: 'Купить семена', projects: [{ id: 'garden', name: 'Сад' }], projectId: 'garden', categories })
        assert.equal(next.body.category, 'custom:buy'); assert.equal(next.body.status, 'ready')
        assert.equal(next.body.classificationProposal, null)
        assert.equal((await enrich({ rawText: 'Текст', projects: [], categories, lockedCategory: 'custom:missing' })).code, 400)
    } finally { await app.close() }
})

test('stateless enrichment classifies local project IDs without creating server notes', async () => {
    const { mock } = createMockFetch()
    const app = createApp({
        repository: createSQLiteRepository(':memory:'),
        ai: createAI({ env: settingsEnv, fetchFn: mock }),
        env: settingsEnv
    })
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${app.server.address().port}/api`
    try {
        const response = await fetch(`${base}/enrich`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rawText: 'Идея для работы',
                projects: [{ id: 'phone-project', name: 'Работа', description: 'Контекст' }],
                projectId: 'phone-project'
            })
        })
        assert.equal(response.status, 200)
        const thought = await response.json()
        assert.equal(thought.projectId, 'phone-project')
        assert.equal(thought.title, 'Улучшить формы')
        assert.equal(app.repository.listThoughts().length, 0)
        const invalid = await fetch(`${base}/enrich`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText: 'Текст', projects: [], projectId: 'missing' })
        })
        assert.equal(invalid.status, 400)
    } finally {
        await app.close()
    }
})

test('SQLite project/thought CRUD and cascade -> Inbox', () => {
    const repo = createSQLiteRepository(':memory:')
    const p = repo.createProject({ name: 'Forms', description: 'UI, back-end' })
    const thought = repo.createThought({ rawText: 'Мысль для проекта', projectId: p.id })
    assert.equal(repo.listThoughts().length, 1)
    assert.equal(repo.listProjects()[0].thoughtCount, 1)
    assert.equal(repo.getThought(thought.id).projectLocked, true)
    repo.updateThought(thought.id, { title: 'Updated', tags: ['tag'] })
    assert.deepEqual(repo.getThought(thought.id).tags, ['tag'])
    repo.deleteProject(p.id)
    assert.equal(repo.getThought(thought.id).projectId, null)
    repo.close()
})

test('Jev chooses project + category, DeepSeek provides title and summary', async () => {
    const repo = createSQLiteRepository(':memory:')
    const p = repo.createProject({ name: 'Forms', description: 'Разработка формы на сайте' })
    const t = repo.createThought({ rawText: 'Идея: разделить UI и print поля' })
    const { mock, requests } = createMockFetch()
    const ai = createAI({ env: settingsEnv, fetchFn: mock })
    const processed = await createPipeline({ repository: repo, ai })(t.id)
    assert.equal(processed.projectId, p.id)
    assert.equal(processed.category, 'idea')
    assert.equal(processed.status, 'ready')
    assert.equal(processed.title, 'Улучшить формы')
    assert.deepEqual(processed.tags, ['формы', 'UI'])
    assert.equal(requests[0].body.model, 'typesafe/jev-1.14')
    assert.ok(requests[0].url.includes('api/alpha/decisions'))
    assert.equal(requests[1].body.model, 'deepseek/deepseek-v4.1-flash-1017')
    repo.close()
})

test('Missing API key does not discard the original thought', async () => {
    const repo = createSQLiteRepository(':memory:')
    const t = repo.createThought({ rawText: 'Очень важная мысль' })
    const pipeline = createPipeline({
        repository: repo,
        ai: createAI({
            env: {},
            fetchFn: () => {
                throw new Error('should not fetch')
            }
        })
    })
    const processed = await pipeline(t.id)
    assert.equal(processed.rawText, 'Очень важная мысль')
    assert.equal(processed.status, 'pending')
    assert.match(processed.errorMessage, /Jev:/)
    repo.close()
})

test('API validates input, creates and updates project, saves thought, and updates settings', async () => {
    const { mock } = createMockFetch()
    const app = createApp({
        repository: createSQLiteRepository(':memory:'),
        ai: createAI({ env: settingsEnv, fetchFn: mock }),
        env: settingsEnv
    })
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
    const port = app.server.address().port
    const request = async (path, method = 'GET', body) => {
        const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        })
        return { status: res.status, body: await res.json() }
    }
    try {
        assert.equal((await request('/health')).body.ok, true)
        assert.equal((await request('/projects', 'POST', { name: '' })).status, 400)
        const pr = await request('/projects', 'POST', {
            name: 'Работа',
            description: 'Рабочий контекст'
        })
        assert.equal(pr.status, 201)
        const note = await request('/thoughts', 'POST', { rawText: 'Идея для проекта' })
        assert.equal(note.status, 201)
        assert.equal(note.body.projectId, pr.body.id)
        assert.equal(note.body.status, 'ready')
        assert.equal((await request('/thoughts')).body.length, 1)
        const update = await request(`/thoughts/${note.body.id}`, 'PATCH', {
            projectId: null,
            category: 'task'
        })
        assert.equal(update.body.projectId, null)
        assert.equal(update.body.category, 'task')
        assert.equal(
            (await request('/settings', 'PATCH', { confidenceThreshold: 1.5 })).status,
            400
        )
        assert.equal(
            (
                await request('/settings', 'PATCH', {
                    generatorProvider: 'custom',
                    generatorModel: 'x/y'
                })
            ).body.generatorProvider,
            'custom'
        )
        const del = await request(`/thoughts/${note.body.id}`, 'DELETE')
        assert.equal(del.body.ok, true)
        assert.equal((await request('/thoughts')).body.length, 0)
    } finally {
        await app.close()
    }
})

test('Low confidence -> review queue, manual project lock honored', async () => {
    const repo = createSQLiteRepository(':memory:')
    const p = repo.createProject({ name: 'Dev' })
    const t = repo.createThought({ rawText: 'Рефакторинг', projectId: p.id })
    const { mock } = createMockFetch()
    const ai = createAI({ env: settingsEnv, fetchFn: mock })
    const result = await createPipeline({ repository: repo, ai })(t.id)
    assert.equal(result.projectId, p.id)
    assert.equal(result.status, 'ready')
    repo.updateSettings({ confidenceThreshold: 0.99 })
    const again = await createPipeline({ repository: repo, ai })(t.id)
    assert.equal(again.projectId, p.id)
    assert.equal(again.status, 'needs_review')
    repo.close()
})

test('JSON export includes raw thoughts without API credentials', () => {
    const repo = createSQLiteRepository(':memory:')
    const p = repo.createProject({ name: 'Заметки' })
    repo.createThought({ rawText: 'Текст без обработки', projectId: p.id })
    const snapshot = repo.exportSnapshot()
    assert.equal(snapshot.format, 'thoughts-mvp-v1')
    assert.equal(snapshot.projects.length, 1)
    assert.equal(snapshot.thoughts[0].rawText, 'Текст без обработки')
    assert.equal(JSON.stringify(snapshot).includes('OPENROUTER_API_KEY'), false)
    repo.close()
})

test('Voice-to-text privacy contract: Russian transcript accepted, audio rejected and never stored', async () => {
    const app = createApp({
        repository: createSQLiteRepository(':memory:'),
        env: { STORAGE_DRIVER: 'sqlite' }
    })
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
    const port = app.server.address().port
    try {
        const base = `http://127.0.0.1:${port}/api/thoughts`
        const invalid = await fetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText: 'Тест', audioBase64: 'YWJj' })
        })
        assert.equal(invalid.status, 400)
        const audio = await fetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'audio/wav' },
            body: 'RIFF...'
        })
        assert.equal(audio.status, 415)
        const text = 'Нужно переписать настройки модели и проверить распределение задач.'
        const valid = await fetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText: text, process: false })
        })
        assert.equal(valid.status, 201)
        const result = await valid.json()
        assert.equal(result.rawText, text)
        assert.equal(result.status, 'pending')
        const snapshot = await fetch(`http://127.0.0.1:${port}/api/export`).then((r) => r.json())
        assert.equal(snapshot.thoughts.length, 1)
        assert.equal(snapshot.thoughts[0].rawText, text)
        assert.equal(JSON.stringify(snapshot).includes('audioBase64'), false)
    } finally {
        await app.close()
    }
})
