import test from 'node:test'
import assert from 'node:assert/strict'
import { createLocalRepository } from '../src/localCore.ts'

const proposal = { project: { name: 'Сад', description: 'Выращивание растений' }, category: { name: 'Покупка', description: 'Что купить' }, reason: 'Новый контекст', model: 'deepseek', unresolved: { project: true, category: true } }
async function fixture() {
    let raw = null, sequence = 0, fail = false
    const storage = { load: async () => raw, save: async (value) => { if (fail) throw new Error('Disk full'); raw = value } }
    const open = () => createLocalRepository(storage, () => `id-${++sequence}`)
    const repo = open()
    const note = await repo.createThought('Купить семена', null)
    await repo.flush({ enrich: async () => ({ status: 'needs_review', classificationProposal: proposal, errorMessage: 'Jev unavailable' }) })
    return { repo, open, note: () => repo.snapshot().thoughts.find((n) => n.id === note.id), setFail: (value) => { fail = value } }
}
test('an unconfirmed proposal survives restart and never creates a project or type', async () => {
    const f = await fixture(); const reopened = f.open(); await reopened.initialize()
    assert.equal(reopened.snapshot().projects.length, 0); assert.equal(reopened.snapshot().customCategories.length, 0)
    assert.deepEqual(reopened.snapshot().thoughts[0].classificationProposal, proposal)
    assert.equal(f.note().aiPending, false)
    let calls = 0; await f.repo.flush({ enrich: async () => { calls++; return {} } })
    assert.equal(calls, 0, 'Waiting for confirmation must not spend tokens repeatedly')
    assert.deepEqual(f.repo.snapshot().aiHistory[0].result.classificationProposal, proposal)
})
test('confirmation atomically creates the edited project/type, assigns them and queues Notion revisions', async () => {
    const f = await fixture(); const note = f.note()
    const saved = await f.repo.confirmClassification(note.id, note.revision, { ...proposal, project: { name: 'Огород', description: 'На даче' } })
    assert.equal(f.repo.snapshot().projects[0].name, 'Огород')
    assert.equal(f.repo.snapshot().customCategories[0].name, 'Покупка')
    assert.equal(saved.projectId, f.repo.snapshot().projects[0].id)
    assert.equal(saved.category, f.repo.snapshot().customCategories[0].id)
    assert.equal(saved.categoryLocked, true); assert.equal(saved.projectLocked, true)
    assert.equal(saved.status, 'ready'); assert.equal(saved.classificationProposal, null)
    assert.deepEqual(saved.notion, {})
    const reopened = f.open(); await reopened.initialize()
    assert.equal(reopened.snapshot().customCategories[0].id, saved.category)
    await assert.rejects(f.repo.confirmClassification(note.id, note.revision, proposal), /изменилась/)
})
test('case and whitespace duplicates reuse existing projects and types', async () => {
    const f = await fixture(); const existing = await f.repo.createProject({ name: 'Сад', description: '', color: '#123456' })
    const note = f.note()
    await f.repo.confirmClassification(note.id, note.revision, { ...proposal, project: { name: '  САД  ', description: '' }, category: { name: '  Задача  ', description: '' } })
    assert.equal(f.repo.snapshot().projects.length, 1); assert.equal(f.repo.snapshot().customCategories.length, 0)
    assert.equal(f.note().projectId, existing.id); assert.equal(f.note().category, 'task')
})
test('dismissal and stale confirmation create nothing; a text edit invalidates the proposal', async () => {
    const f = await fixture(); const note = f.note()
    await f.repo.updateThought(note.id, { rawText: 'Совсем другая мысль' })
    await assert.rejects(f.repo.confirmClassification(note.id, note.revision, proposal), /изменилась/)
    assert.equal(f.note().classificationProposal, null); assert.equal(f.repo.snapshot().projects.length, 0)
    const g = await fixture(); const n = g.note(); await g.repo.dismissClassification(n.id, n.revision)
    assert.equal(g.note().classificationProposal, null); assert.equal(g.note().aiPending, false)
    assert.equal(g.repo.snapshot().customCategories.length, 0)
})
test('failed storage cannot partially create a project/type or lose the pending proposal', async () => {
    const f = await fixture(); const n = f.note(); f.setFail(true)
    await assert.rejects(f.repo.confirmClassification(n.id, n.revision, proposal), /Disk full/)
    assert.equal(f.repo.snapshot().projects.length, 0); assert.equal(f.repo.snapshot().customCategories.length, 0)
    assert.deepEqual(f.note().classificationProposal, proposal)
})
test('confirmed types survive Notion export/import and manual type locks resist later AI responses', async () => {
    const f = await fixture(); const n = f.note(); await f.repo.confirmClassification(n.id, n.revision, proposal)
    await f.repo.processThought(n.id)
    await f.repo.flush({ enrich: async () => ({ category: 'bug', status: 'ready' }) })
    assert.match(f.note().category, /^custom:/)
    let raw = null
    const other = createLocalRepository({ load: async () => raw, save: async (value) => { raw = value } }, () => 'new')
    await other.importRemote(f.repo.snapshot().projects, [f.note()], 'notion')
    assert.equal(other.snapshot().customCategories[0].name, 'Покупка')
    assert.equal(other.snapshot().thoughts[0].category, f.note().category)
})

test('accepting the suggested project alone does not create a proposed type', async () => {
    let stored = null
    let sequence = 0
    const repository = createLocalRepository({
        load: async () => stored,
        save: async (value) => { stored = value }
    }, () => String(++sequence))
    const thought = await repository.createThought('Разобрать грядки', null)
    const proposal = {
        project: { name: 'Сад', description: '' },
        category: { name: 'Уход', description: '' },
        reason: 'Садовые работы', model: 'test'
    }
    await repository.flush({ enrich: async () => ({ classificationProposal: proposal, status: 'needs_review' }) })
    const pending = repository.snapshot().thoughts[0]
    const saved = await repository.confirmClassification(thought.id, pending.revision, proposal, true)
    assert.equal(repository.snapshot().projects[0].name, 'Сад')
    assert.equal(repository.snapshot().customCategories.length, 0)
    assert.equal(saved.classificationProposal.category.name, 'Уход')
    assert.equal(saved.classificationProposal.project, undefined)
})
