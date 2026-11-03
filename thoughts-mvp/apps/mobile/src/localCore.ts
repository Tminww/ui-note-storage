import type { Project, Thought } from './api'

export type Preferences = {
    theme: 'light' | 'dark' | 'system'
    accent: string
    projectColors: boolean
    voiceOnDevice: boolean
    voiceReview: boolean
    haptics: boolean
}
export type RemoteLink = { id: string; revision: number }
export type LocalProject = Project & {
    revision: number
    deleted: boolean
    notion: Record<string, RemoteLink>
}
export type LocalThought = Thought & {
    revision: number
    deleted: boolean
    aiPending: boolean
    attempts: number
    retryAt: number
    notion: Record<string, RemoteLink>
}
export type LocalState = {
    version: 1
    projects: LocalProject[]
    thoughts: LocalThought[]
    draft: string
    preferences: Preferences
}
export type DocumentStorage = {
    load: () => Promise<string | null>
    save: (value: string) => Promise<void>
}
export class LocalConflictError extends Error {
    readonly code = 'LOCAL_CONFLICT'
}
export type SyncAdapters = {
    enrich?: (thought: Thought, projects: Project[]) => Promise<Partial<Thought>>
    notion?: {
        root: string
        project: (project: LocalProject, remoteId?: string) => Promise<string>
        thought: (
            thought: LocalThought,
            remoteProjectId: string | null,
            remoteId?: string
        ) => Promise<string>
        remove: (id: string) => Promise<void>
    }
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const initial = (): LocalState => ({
    version: 1,
    projects: [],
    thoughts: [],
    draft: '',
    preferences: {
        theme: 'system',
        accent: 'indigo',
        projectColors: true,
        voiceOnDevice: false,
        voiceReview: true,
        haptics: true
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
            state = { ...saved, preferences: { ...initial().preferences, ...saved.preferences } }
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
    }
    const findNote = (s: LocalState, noteId: string) => {
        const note = s.thoughts.find((t) => t.id === noteId && !t.deleted)
        if (!note) throw new Error('Мысль не найдена')
        return note
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
        createProject: (body: { name: string; description: string; color: string }) =>
            mutate((s) => {
                if (!body.name.trim()) throw new Error('Укажи название проекта')
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
                touch(p)
                return p
            }),
        deleteProject: (projectId: string) =>
            mutate((s) => {
                const p = s.projects.find((p) => p.id === projectId)
                if (!p) throw new Error('Проект не найден')
                p.deleted = true
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
                    attempts: 0,
                    retryAt: 0,
                    notion: {}
                }
                s.thoughts.push(t)
                s.draft = ''
                return t
            }),
        updateThought: (noteId: string, body: Partial<Thought>) =>
            mutate((s) => {
                const t = findNote(s, noteId)
                const changedText = body.rawText !== undefined && body.rawText !== t.rawText
                for (const key of ['title', 'rawText', 'summary', 'category', 'status'] as const)
                    if (body[key] !== undefined) Object.assign(t, { [key]: body[key] })
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
                    t.aiPending = true
                    t.status = 'pending'
                    t.attempts = 0
                    t.retryAt = 0
                } else if (body.status === 'ready') {
                    t.aiPending = false
                    t.errorMessage = null
                    t.attempts = 0
                    t.retryAt = 0
                }
                touch(t)
                return t
            }),
        deleteThought: (noteId: string) =>
            mutate((s) => {
                const t = findNote(s, noteId)
                t.deleted = true
                touch(t)
                return { ok: true }
            }),
        processThought: (noteId: string) =>
            mutate((s) => {
                const t = findNote(s, noteId)
                t.aiPending = true
                t.attempts = 0
                t.retryAt = 0
                t.errorMessage = null
                t.status = 'pending'
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
                    const existing = s.thoughts.find(
                        (t) =>
                            t.id === (remote.localId || remote.id) ||
                            t.notion[root]?.id === remote.id
                    )
                    if (existing) {
                        if (source === 'notion' && !existing.notion[root])
                            existing.notion[root] = {
                                id: remote.id,
                                revision: remote.localId
                                    ? (remote.localRevision ?? 0)
                                    : existing.revision
                            }
                        continue
                    }
                    s.thoughts.push({
                        ...remote,
                        id: remote.localId || remote.id,
                        projectId: remote.projectId
                            ? projectIds.get(remote.projectId) || null
                            : null,
                        revision: 1,
                        deleted: false,
                        aiPending: remote.status === 'pending',
                        attempts: 0,
                        retryAt: 0,
                        notion:
                            source === 'notion' ? { [root]: { id: remote.id, revision: 1 } } : {}
                    })
                }
            }),
        flush: (adapters: SyncAdapters) => {
            if (flight) return flight
            flight = (async () => {
                await initialize()
                const destination = adapters.notion
                const errors: unknown[] = []
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
                            errors.push(error)
                        }
                    }
                for (const entry of [...state.thoughts]) {
                    let current = state.thoughts.find((t) => t.id === entry.id)!
                    if (
                        !current.deleted &&
                        current.aiPending &&
                        current.retryAt <= now() &&
                        adapters.enrich
                    ) {
                        const captured = clone(current)
                        try {
                            const result = await adapters.enrich(
                                captured,
                                state.projects.filter((p) => !p.deleted)
                            )
                            await mutate((s) => {
                                const t = s.thoughts.find((t) => t.id === captured.id)!
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
                                    if (result[key] !== undefined)
                                        Object.assign(t, { [key]: result[key] })
                                }
                                if (!t.projectLocked && result.projectId !== undefined)
                                    t.projectId = s.projects.some(
                                        (p) => !p.deleted && p.id === result.projectId
                                    )
                                        ? result.projectId
                                        : null
                                t.aiPending =
                                    Boolean(result.errorMessage) || result.status === 'pending'
                                t.attempts = t.aiPending ? t.attempts + 1 : 0
                                t.retryAt = t.aiPending
                                    ? now() + Math.min(300000, 2000 * 2 ** t.attempts)
                                    : 0
                                touch(t)
                            })
                        } catch (error) {
                            await mutate((s) => {
                                const t = s.thoughts.find((t) => t.id === captured.id)!
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
                    const link = current.notion[destination.root]
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
                        const parent = current.projectId
                            ? state.projects.find((p) => p.id === current.projectId && !p.deleted)
                                  ?.notion[destination.root]?.id
                            : null
                        if (current.projectId && !parent) continue
                        const captured = clone(current)
                        const remoteId = await destination.thought(
                            captured,
                            parent || null,
                            link?.id
                        )
                        await mutate((s) => {
                            const t = s.thoughts.find((t) => t.id === captured.id)!
                            t.notion[destination.root] = {
                                id: remoteId,
                                revision: captured.revision
                            }
                        })
                    } catch (error) {
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
