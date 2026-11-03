import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLocalRepository } from '../src/localCore.ts'

function fixture() {
    let raw = null, serial = 0, time = 1_000_000
    const storage = { load: async () => raw, save: async (value) => { raw = value } }
    const repo = createLocalRepository(storage, () => `id-${++serial}`, () => time)
    return { repo, storage, advance(ms) { time += ms }, raw: () => raw }
}
const models = { provider: 'openrouter', generatorModel: 'generator', decisionModel: 'classifier' }

test('AI history commits before the call and retains usage/results across restart', async () => {
    const f = fixture(); const note = await f.repo.createThought('История моей идеи', null)
    await f.repo.flush({ aiModels: models, enrich: async () => {
        assert.equal(JSON.parse(f.raw()).aiHistory[0].status, 'started')
        f.advance(2400)
        return { title: 'Идея', summary: 'Описание', status: 'ready', category: 'idea', usage: { requests: 2, totalTokens: 112, costUsd: 0.00012 } }
    } })
    const entry = f.repo.snapshot().aiHistory[0]
    assert.equal(entry.thoughtId, note.id)
    assert.equal(entry.durationMs, 2400)
    assert.equal(entry.status, 'success')
    assert.equal(entry.applied, true)
    assert.equal(entry.usage.totalTokens, 112)
    assert.equal(entry.generatorModel, 'generator')
    const reopened = createLocalRepository(f.storage, () => 'new')
    await reopened.initialize()
    assert.deepEqual(reopened.snapshot().aiHistory, JSON.parse(JSON.stringify(f.repo.snapshot().aiHistory)))
})

test('each retry is a distinct history item; errors redact credentials', async () => {
    const f = fixture(); await f.repo.createThought('Заметка', null)
    await f.repo.flush({ aiModels: models, enrich: async () => { throw new Error('Request Bearer abc123, sk-or-v1-private-key failed') } })
    assert.equal(f.repo.snapshot().aiHistory[0].status, 'error')
    assert.doesNotMatch(JSON.stringify(f.repo.snapshot().aiHistory), /abc123|sk-or-v1-private-key/)
    await f.repo.retry()
    await f.repo.flush({ enrich: async () => ({ status: 'ready' }) })
    assert.deepEqual(f.repo.snapshot().aiHistory.map((h) => h.status), ['error', 'success'])
    assert.notEqual(f.repo.snapshot().aiHistory[0].id, f.repo.snapshot().aiHistory[1].id)
})

test('an AI response discarded after a user edit remains visible as not applied', async () => {
    const f = fixture(); const note = await f.repo.createThought('Ранний текст', null)
    await f.repo.flush({ enrich: async () => {
        await f.repo.updateThought(note.id, { rawText: 'Новый текст' })
        return { title: 'Устаревший ответ', status: 'ready' }
    } })
    assert.equal(f.repo.snapshot().thoughts[0].rawText, 'Новый текст')
    const entry = f.repo.snapshot().aiHistory[0]
    assert.equal(entry.inputText, 'Ранний текст')
    assert.equal(entry.applied, false)
    assert.equal(entry.result.title, 'Устаревший ответ')
})

test('partial processing is recorded as partial and missing cost stays unknown', async () => {
    const f = fixture(); await f.repo.createThought('Текст', null)
    await f.repo.flush({ enrich: async () => ({ status: 'needs_review', summary: 'Часть ответа', errorMessage: 'Classifier unavailable' }) })
    const entry = f.repo.snapshot().aiHistory[0]
    assert.equal(entry.status, 'partial')
    assert.equal(entry.error, 'Classifier unavailable')
    assert.equal(entry.usage, undefined)
})

test('old local snapshots acquire an empty history without losing notes', async () => {
    const f = fixture(); await f.repo.createThought('Старая заметка', null)
    const legacy = JSON.parse(f.raw()); delete legacy.aiHistory
    await f.storage.save(JSON.stringify(legacy))
    const reopened = createLocalRepository(f.storage, () => 'new')
    await reopened.initialize()
    assert.equal(reopened.snapshot().thoughts[0].rawText, 'Старая заметка')
    assert.deepEqual(reopened.snapshot().aiHistory, [])
})

test('history retention is bounded to the documented 500 latest processing attempts', async () => {
    const f = fixture(); await f.repo.createThought('Текст', null)
    const saved = JSON.parse(f.raw())
    saved.aiHistory = Array.from({ length: 500 }, (_, index) => ({ id: `old-${index}`, status: 'error' }))
    await f.storage.save(JSON.stringify(saved)); await f.repo.reload()
    await f.repo.flush({ enrich: async () => ({ status: 'ready' }) })
    const history = f.repo.snapshot().aiHistory
    assert.equal(history.length, 500)
    assert.equal(history[0].id, 'old-1')
    assert.equal(history.at(-1).status, 'success')
})

test('history accepts only numeric usage fields and excludes unexpected credential fields', async () => {
    const f = fixture(); await f.repo.createThought('Текст', null)
    await f.repo.flush({ enrich: async () => ({ status: 'ready', usage: { totalTokens: 15, costUsd: 'unknown', Authorization: 'private-token' } }) })
    assert.deepEqual(f.repo.snapshot().aiHistory[0].usage, { totalTokens: 15 })
    assert.doesNotMatch(JSON.stringify(f.repo.snapshot().aiHistory), /private-token/)
})
