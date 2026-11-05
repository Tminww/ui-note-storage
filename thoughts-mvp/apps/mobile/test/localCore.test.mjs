import test from 'node:test'
import assert from 'node:assert/strict'
import { createLocalRepository, LocalConflictError } from '../src/localCore.ts'

test('manual review cancels pending enrichment until explicitly requested', async () => {
    const a = fixture().open()
    const t = await a.createThought('Test', null)
    await a.updateThought(t.id, { category: 'task', status: 'ready' })
    let calls = 0
    await a.flush({
        enrich: async () => {
            calls++
            return enriched
        }
    })
    assert.equal(calls, 0)
    assert.equal((await a.thoughts())[0].category, 'task')
    await a.processThought(t.id)
    await a.flush({
        enrich: async () => {
            calls++
            return enriched
        }
    })
    assert.equal(calls, 1)
})

function fixture() {
    let raw = null,
        sequence = 0,
        time = 10000,
        fail = false
    const storage = {
        load: async () => raw,
        save: async (value) => {
            if (fail) throw new Error('Disk full')
            raw = value
        }
    }
    const open = () =>
        createLocalRepository(
            storage,
            () => `local-${++sequence}`,
            () => time
        )
    return { open, storage, tick: () => (time += 1000000), setFail: (value) => (fail = value) }
}
const enriched = {
    title: 'AI title',
    summary: 'Summary',
    tags: ['tag'],
    category: 'idea',
    status: 'needs_review',
    projectId: null,
    confidence: 0.9,
    errorMessage: null
}
const deferred = () => {
    let resolve
    const promise = new Promise((r) => (resolve = r))
    return { promise, resolve }
}
function notion() {
    const pages = new Map()
    const removed = []
    let seq = 0
    return {
        pages,
        removed,
        adapter: {
            root: 'root',
            project: async (p, id) => {
                const remote = id || pages.get(p.id)?.id || `remote-${++seq}`
                pages.set(p.id, { id: remote, ...p })
                return remote
            },
            thought: async (t, parent, id) => {
                const remote = id || pages.get(t.id)?.remoteId || `remote-${++seq}`
                pages.set(t.id, { ...t, remoteId: remote, parent })
                return remote
            },
            remove: async (id) => {
                removed.push(id)
            }
        }
    }
}
test('quick project remembers the last manual save across restart and clears on deletion', async () => {
    const f = fixture()
    const local = f.open()
    const project = await local.createProject({ name: 'Музыка', description: '', color: '#123456' })
    await local.createThought('Ритм', project.id)
    await local.createThought('Автоматический выбор', null)
    const restarted = f.open()
    await restarted.initialize()
    assert.equal(restarted.snapshot().lastProjectId, project.id)
    await restarted.deleteProject(project.id)
    assert.equal(restarted.snapshot().lastProjectId, null)
})
test('offline save, project, draft, preferences and queue survive restart', async () => {
    const f = fixture()
    const a = f.open()
    const p = await a.createProject({ name: 'Работа', description: 'Контекст', color: '#123456' })
    await a.createThought('Важная мысль', p.id)
    await a.setDraft('Неоконченное')
    await a.preferences({ theme: 'dark', voiceOnDevice: true })
    const b = f.open()
    await b.initialize()
    assert.equal((await b.thoughts())[0].rawText, 'Важная мысль')
    assert.equal((await b.thoughts())[0].aiPending, true)
    assert.equal(b.snapshot().draft, 'Неоконченное')
    assert.equal(b.snapshot().preferences.theme, 'dark')
    assert.equal(b.snapshot().preferences.voiceOnDevice, true)
})
test('failed local commit never reports a saved note or clears the draft', async () => {
    const f = fixture()
    const a = f.open()
    await a.setDraft('Keep me')
    f.setFail(true)
    await assert.rejects(a.createThought('Keep me', null), /Disk full/)
    assert.equal(a.snapshot().draft, 'Keep me')
    assert.equal(a.snapshot().thoughts.length, 0)
    f.setFail(false)
    await a.createThought('Keep me', null)
    assert.equal(a.snapshot().thoughts.length, 1)
})
test('reconnect enriches stored text and exports the same result to Notion', async () => {
    const f = fixture()
    const a = f.open()
    await a.createThought('Offline', null)
    const n = notion()
    await a.flush({ enrich: async () => enriched, notion: n.adapter })
    const t = (await a.thoughts())[0]
    assert.equal(t.title, 'AI title')
    assert.equal(t.aiPending, false)
    assert.equal(n.pages.get(t.id).summary, 'Summary')
    assert.equal(n.pages.size, 1)
    await a.flush({
        enrich: async () => {
            throw new Error('Should not run twice')
        },
        notion: n.adapter
    })
    assert.equal(n.pages.size, 1)
})
test('AI failure retains the original, retries after backoff and survives restart', async () => {
    const f = fixture()
    const a = f.open()
    await a.createThought('Important', null)
    await a.flush({
        enrich: async () => {
            throw new Error('Offline')
        }
    })
    assert.equal((await a.thoughts())[0].rawText, 'Important')
    assert.equal((await a.thoughts())[0].attempts, 1)
    const b = f.open()
    await b.initialize()
    let calls = 0
    await b.flush({
        enrich: async () => {
            calls++
            return enriched
        }
    })
    assert.equal(calls, 0)
    f.tick()
    await b.flush({
        enrich: async () => {
            calls++
            return enriched
        }
    })
    assert.equal(calls, 1)
})
test('an edit made while AI runs cannot be overwritten by its stale response', async () => {
    const a = fixture().open()
    const t = await a.createThought('Before', null)
    const gate = deferred()
    const started = deferred()
    const work = a.flush({
        enrich: async () => {
            started.resolve()
            await gate.promise
            return enriched
        }
    })
    await started.promise
    await a.updateThought(t.id, { rawText: 'After' })
    gate.resolve()
    await work
    const next = (await a.thoughts())[0]
    assert.equal(next.rawText, 'After')
    assert.equal(next.title, 'Before')
    assert.equal(next.aiPending, true)
})
test('concurrent sync triggers share a single worker', async () => {
    const a = fixture().open()
    await a.createThought('Test', null)
    const gate = deferred()
    let calls = 0
    const adapters = {
        enrich: async () => {
            calls++
            await gate.promise
            return enriched
        }
    }
    const first = a.flush(adapters),
        second = a.flush(adapters)
    assert.equal(first, second)
    gate.resolve()
    await first
    assert.equal(calls, 1)
})
test('a Notion failure stays with the failed revision and clears after a retry', async () => {
    const f = fixture()
    const local = f.open()
    const project = await local.createProject({ name: 'Проект', description: '', color: '#123456' })
    const blocked = await local.createThought('Project note', project.id)
    const inbox = await local.createThought('Inbox note', null)
    const remote = notion()
    await assert.rejects(local.flush({
        notion: { ...remote.adapter, project: async () => { throw new Error('No project access') } }
    }), /No project access/)
    const reopened = f.open()
    const [savedBlocked, savedInbox] = await reopened.thoughts()
    assert.equal(savedBlocked.id, blocked.id)
    assert.deepEqual(savedBlocked.notionErrors.root, {
        revision: savedBlocked.revision, message: 'No project access'
    })
    assert.equal(savedInbox.id, inbox.id)
    assert.equal(savedInbox.notionErrors, undefined)
    assert.equal(savedInbox.notion.root.revision, savedInbox.revision)
    await reopened.flush({ notion: remote.adapter })
    const [synced] = await reopened.thoughts()
    assert.equal(synced.notionErrors.root, undefined)
    assert.equal(synced.notion.root.revision, synced.revision)
})

test('Notion outage does not prevent AI processing other thoughts', async () => {
    const a = fixture().open()
    const p = await a.createProject({ name: 'Work', description: '', color: '#123456' })
    await a.createThought('One', p.id)
    await a.createThought('Two', null)
    let calls = 0
    const n = notion()
    n.adapter.project = async () => {
        throw new Error('Notion unavailable')
    }
    n.adapter.thought = async () => {
        throw new Error('Notion unavailable')
    }
    await assert.rejects(
        a.flush({
            enrich: async () => {
                calls++
                return enriched
            },
            notion: n.adapter
        }),
        /Notion/
    )
    assert.equal(calls, 2)
})
test('manual project assignment is locked and survives AI reprocessing', async () => {
    const a = fixture().open()
    const p = await a.createProject({ name: 'Work', description: '', color: '#123456' })
    const t = await a.createThought('Test', null)
    await a.updateThought(t.id, { projectId: p.id })
    await a.flush({ enrich: async () => enriched })
    const next = (await a.thoughts())[0]
    assert.equal(next.projectId, p.id)
    assert.equal(next.projectLocked, true)
})
test('deleting a project moves local notes to Inbox before syncing archive', async () => {
    const a = fixture().open()
    const p = await a.createProject({ name: 'Work', description: '', color: '#123456' })
    const t = await a.createThought('Test', p.id)
    const n = notion()
    await a.flush({ notion: n.adapter })
    await a.deleteProject(p.id)
    assert.equal((await a.thoughts())[0].projectId, null)
    await a.flush({ notion: n.adapter })
    assert.equal(n.pages.get(t.id).parent, null)
    assert.equal(n.removed.length, 1)
})
test('delete during a remote create retains its identity for later archival', async () => {
    const a = fixture().open()
    const t = await a.createThought('Test', null)
    const gate = deferred(),
        started = deferred()
    const n = notion()
    n.adapter.thought = async () => {
        started.resolve()
        await gate.promise
        return 'remote-note'
    }
    const work = a.flush({ notion: n.adapter })
    await started.promise
    await a.deleteThought(t.id)
    gate.resolve()
    await work
    assert.equal((await a.thoughts()).length, 0)
    assert.equal(a.snapshot().thoughts[0].notion.root.id, 'remote-note')
    await a.flush({ notion: n.adapter })
    assert.deepEqual(n.removed, ['remote-note'])
})
test('lost create response is reconciled even when the local note was deleted', async () => {
    const a = fixture().open()
    const t = await a.createThought('Test', null)
    await a.deleteThought(t.id)
    await a.importRemote([], [{ ...t, id: 'remote-note', localId: t.id, localRevision: 1 }], 'root')
    const n = notion()
    await a.flush({ notion: n.adapter })
    assert.deepEqual(n.removed, ['remote-note'])
    assert.equal((await a.thoughts()).length, 0)
})
test('binding, unlinking and deleting a project moves notes without archiving the linked page', async () => {
    const local = fixture().open()
    const remote = notion()
    const project = await local.createProject({ name: 'Музыка', description: '', color: '#123456' })
    const note = await local.createThought('Ритм', project.id)
    await local.flush({ notion: remote.adapter })
    const registryId = local.snapshot().projects[0].notion.root.id
    const noteId = remote.pages.get(note.id).remoteId
    await local.updateProject(project.id, { notionPageId: 'existing-page', notionPageRoot: 'root' })
    await local.flush({ notion: remote.adapter })
    assert.equal(remote.pages.get(note.id).parent, 'existing-page')
    assert.equal(remote.pages.get(note.id).remoteId, noteId)
    await assert.rejects(
        local.createProject({ name: 'Дубль', description: '', color: '#123456', notionPageId: 'existing-page', notionPageRoot: 'root' }),
        /уже привязана/
    )
    await local.updateProject(project.id, { notionPageId: null })
    await local.flush({ notion: remote.adapter })
    assert.equal(remote.pages.get(note.id).parent, registryId)
    await local.updateProject(project.id, { notionPageId: 'existing-page', notionPageRoot: 'root' })
    await local.flush({ notion: remote.adapter })
    await local.deleteProject(project.id)
    await local.flush({ notion: remote.adapter })
    assert.equal(remote.pages.get(note.id).parent, null)
    assert.deepEqual(remote.removed, [registryId])
})
test('switching Notion root preserves a separate mapping for each destination', async () => {
    const a = fixture().open()
    await a.createThought('Test', null)
    const first = notion(),
        second = notion()
    second.adapter.root = 'other-root'
    await a.flush({ notion: first.adapter })
    await a.flush({ notion: second.adapter })
    const t = (await a.thoughts())[0]
    assert.equal(Object.keys(t.notion).length, 2)
    assert.equal(first.pages.size, 1)
    assert.equal(second.pages.size, 1)
})
test('remote import is idempotent and cannot overwrite dirty local work', async () => {
    const a = fixture().open()
    const t = await a.createThought('Local original', null)
    await a.updateThought(t.id, { rawText: 'Local edit' })
    const remote = { ...t, id: 'remote', localId: t.id, rawText: 'Stale remote', localRevision: 1 }
    await a.importRemote([], [remote], 'root')
    await a.importRemote([], [remote], 'root')
    assert.equal((await a.thoughts()).length, 1)
    assert.equal((await a.thoughts())[0].rawText, 'Local edit')
})
test('invalid storage is not replaced by an empty database', async () => {
    let writes = 0
    const a = createLocalRepository(
        {
            load: async () => '{bad json',
            save: async () => {
                writes++
            }
        },
        () => 'id'
    )
    await assert.rejects(a.initialize())
    await assert.rejects(a.createThought('Test', null))
    assert.equal(writes, 0)
})
test('foreground and background writers rebase after a database conflict', async () => {
    let raw = null,
        seq = 0
    const storage = () => {
        let previous = null
        return {
            load: async () => {
                previous = raw
                return raw
            },
            save: async (next) => {
                if (previous !== raw) throw new LocalConflictError('Changed')
                previous = raw = next
            }
        }
    }
    const a = createLocalRepository(storage(), () => `id-${++seq}`),
        b = createLocalRepository(storage(), () => `id-${++seq}`)
    await Promise.all([a.initialize(), b.initialize()])
    await a.createThought('Foreground', null)
    await b.createThought('Background', null)
    await a.reload()
    assert.deepEqual((await a.thoughts()).map((t) => t.rawText).sort(), [
        'Background',
        'Foreground'
    ])
})

test('revision instructions survive restart and a failed attempt without replacing the original', async () => {
    const f = fixture()
    const first = f.open()
    const note = await first.createThought('Купить чай и кофе', null)
    await first.updateThought(note.id, { summary: 'Покупки', category: 'task', status: 'ready' })
    await first.processThought(note.id, ' Сделай список ')
    const restarted = f.open()
    await restarted.flush({ enrich: async (captured) => {
        assert.equal(captured.aiFeedback, 'Сделай список')
        assert.equal(captured.summary, 'Покупки')
        throw new Error('Offline')
    } })
    assert.equal(restarted.snapshot().thoughts[0].summary, 'Покупки')
    assert.equal(restarted.snapshot().thoughts[0].aiPending, true)
    f.tick()
    await restarted.flush({ enrich: async (captured) => {
        assert.equal(captured.aiFeedback, 'Сделай список')
        return { summary: '- Чай\n- Кофе', errorMessage: null }
    } })
    const saved = restarted.snapshot().thoughts[0]
    assert.equal(saved.summary, '- Чай\n- Кофе')
    assert.equal(saved.rawText, note.rawText)
    assert.equal(saved.category, 'task')
    assert.equal(saved.status, 'ready')
    assert.equal(saved.aiFeedback, undefined)
    assert.equal(saved.aiPending, false)
})

test('checklist progress persists and a stale tap cannot toggle a different item', async () => {
    const f = fixture()
    const a = f.open()
    const note = await a.createThought('Купить чай и кофе', null)
    const saved = await a.updateThought(note.id, { summary: '- Чай\n- Кофе', status: 'ready' })
    const converted = await a.updateChecklist(note.id, saved.revision)
    const checked = await a.updateChecklist(note.id, converted.revision, 1)
    await assert.rejects(a.updateChecklist(note.id, converted.revision, 0), /Мысль изменилась/)
    const b = f.open()
    await b.initialize()
    assert.equal(b.snapshot().thoughts[0].summary, '- [ ] Чай\n- [x] Кофе')
    assert.equal(b.snapshot().thoughts[0].rawText, note.rawText)
    assert.equal(checked.aiPending, false)
})

test('remote edits update clean notes while divergent edits wait for a choice', async () => {
    const f = fixture()
    const a = f.open()
    const remote = {
        id: 'notion-note', localId: 'shared', localRevision: 1, notionVersion: 'v1',
        title: 'Покупки', rawText: 'Купить чай', summary: '- [ ] Чай',
        tags: [], projectId: null, status: 'ready'
    }
    await a.importRemote([], [remote], 'root')
    const changed = { ...remote, notionVersion: 'v2', summary: '- [x] Чай' }
    await a.importRemote([], [changed], 'root')
    let local = a.snapshot().thoughts[0]
    assert.equal(local.summary, '- [x] Чай')
    await a.updateThought(local.id, { title: 'Моя версия', status: 'ready' }, local.revision)
    const latest = { ...changed, notionVersion: 'v3', title: 'Версия из Notion' }
    await a.importRemote([], [latest], 'root')
    local = a.snapshot().thoughts[0]
    assert.equal(local.title, 'Моя версия')
    assert.equal(local.notionConflicts.root.title, 'Версия из Notion')
    let writes = 0
    const adapter = notion().adapter
    await a.flush({ notion: { ...adapter, thought: async () => { writes++; return 'wrong' } } })
    assert.equal(writes, 0)
    await a.resolveNotionConflict(local.id, 'root', local.revision, 'v3', true)
    assert.deepEqual(a.snapshot().thoughts.map((note) => note.title), ['Версия из Notion', 'Моя версия (моя копия)'])
    assert.equal(a.snapshot().thoughts[0].notionConflicts.root, undefined)
})
