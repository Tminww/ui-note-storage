import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import * as Crypto from 'expo-crypto'
import { createLocalRepository, type SyncAdapters, type EnrichmentResult } from './localCore'
import { localDocument } from './localDocument'
import { enrichNote, localSettings, reviseNote, saveLocalSettings } from './onDeviceAI'
import { createNotionSyncAdapter, getNotionSnapshot, parseNotionProjectPage, verifyNotionProjectPage } from './notionStorage'
import { getNotionRoot, hasSecret } from './deviceConfig'
import { getApiUrl, request, serverApi, type AIConfig } from './api'

export const localRepository = createLocalRepository(localDocument, () => Crypto.randomUUID())
type SyncStatus = {
    online: boolean
    syncing: boolean
    error: string
    lastSync: number | null
    aiConfigured: boolean
    notionConfigured: boolean
    notionReadError: { root: string; message: string } | null
}
let status: SyncStatus = {
    online: true,
    syncing: false,
    error: '',
    lastSync: null,
    aiConfigured: false,
    notionConfigured: false,
    notionReadError: null
}
const listeners = new Set<() => void>()
const publish = (patch: Partial<SyncStatus>) => {
    status = { ...status, ...patch }
    listeners.forEach((l) => l())
}
export const syncSnapshot = () => status
export const subscribeSync = (listener: () => void) => {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}
let flight: Promise<void> | undefined
const customServer = () => !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(getApiUrl())

export function syncLocalData() {
    if (flight) return flight
    flight = (async () => {
        await localRepository.initialize()
        const network = await NetInfo.fetch()
        publish({ online: network.isConnected !== false && network.isInternetReachable !== false })
        const [hasAI, hasNotion] = await Promise.all([hasSecret('openrouter'), hasSecret('notion')])
        const notionConfigured = Boolean(getNotionRoot() && hasNotion)
        const aiConfigured = hasAI || customServer()
        publish({ aiConfigured, notionConfigured })
        if (!status.online) return
        publish({ syncing: true, error: '' })
        const adapters: SyncAdapters = {}
        if (aiConfigured) {
            const settings = await localSettings()
            adapters.aiModels = { provider: hasAI ? 'openrouter' : 'server', generatorModel: settings.generatorModel, decisionModel: settings.decisionProvider === 'disabled' ? 'disabled' : settings.decisionModel }
            adapters.enrich = async (thought, projects) => {
                if (thought.aiFeedback) {
                    const { rawText, title, summary, tags } = thought
                    const revision = { instruction: thought.aiFeedback, title, summary, tags }
                    const result = hasAI
                        ? await reviseNote(rawText, settings, revision)
                        : await request<EnrichmentResult>('/enrich/revise', {
                            method: 'POST',
                            body: JSON.stringify({ rawText, ...revision, settings })
                        })
                    return { ...result, status: thought.status === 'ready' ? 'ready' : 'needs_review' }
                }
                if (hasAI)
                    return enrichNote(
                        thought.rawText,
                        projects,
                        thought.projectLocked ? thought.projectId : null,
                        settings,
                        { categories: localRepository.snapshot().customCategories, lockedCategory: thought.categoryLocked ? thought.category : null }
                    )
                return request<EnrichmentResult>('/enrich', {
                    method: 'POST',
                    body: JSON.stringify({
                        rawText: thought.rawText,
                        projectId: thought.projectLocked ? thought.projectId : null,
                        projects: projects.map(({ id, name, description }) => ({ id, name, description })),
                        categories: localRepository.snapshot().customCategories,
                        lockedCategory: thought.categoryLocked ? thought.category : null,
                        settings
                    })
                })
            }
        }
        if (notionConfigured) {
            const root = getNotionRoot()
            try {
                const knownThoughtIds = localRepository.snapshot().thoughts
                    .flatMap((thought) => thought.notion[root] ? [thought.notion[root].id] : [])
                const snapshot = await getNotionSnapshot(knownThoughtIds)
                await localRepository.importRemote(snapshot.projects, snapshot.thoughts, snapshot.root)
                adapters.notion = await createNotionSyncAdapter(snapshot)
                publish({ notionReadError: null })
                const linkedError = snapshot.linkedErrors.values().next().value
                if (linkedError) publish({ error: linkedError.message })
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                publish({ error: message, notionReadError: { root, message } })
            }
        }
        await localRepository.flush(adapters)
        publish({ lastSync: Date.now() })
    })()
        .catch((error) => {
            publish({ error: error instanceof Error ? error.message : String(error) })
        })
        .finally(() => {
            publish({ syncing: false })
            flight = undefined
        })
    return flight
}

export function startLocalSync() {
    let active = AppState.currentState === 'active' || AppState.currentState === null
    const network = NetInfo.addEventListener((value) => {
        publish({ online: value.isConnected !== false && value.isInternetReachable !== false })
        if (status.online && active) void syncLocalData()
    })
    const app = AppState.addEventListener('change', (value) => {
        active = value === 'active'
        if (active) void localRepository.reload().then(syncLocalData)
    })
    const interval = setInterval(() => {
        if (active && status.online) void syncLocalData()
    }, 15000)
    void syncLocalData()
    return () => {
        network()
        app.remove()
        clearInterval(interval)
    }
}

export async function retryLocalData() {
    await localRepository.retry()
    await syncLocalData()
}
export async function changeNotionConnection(change: () => Promise<void>) {
    if (flight) await flight
    await change()
    void syncLocalData()
}
export async function importServerData() {
    const [projects, thoughts] = await Promise.all([serverApi.projects(), serverApi.thoughts()])
    await localRepository.importRemote(projects, thoughts, 'server', 'server')
    void syncLocalData()
}
const queue =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
        const result = await fn(...args)
        void syncLocalData()
        return result
    }
async function validateProjectPage(value: string | null | undefined, current?: string | null) {
    if (value === undefined) return {}
    const notionPageId = parseNotionProjectPage(value ?? '')
    const notionPageRoot = notionPageId ? getNotionRoot() : null
    const notionPageTitle = notionPageId
        ? notionPageId !== current ? await verifyNotionProjectPage(notionPageId) : undefined
        : null
    if (notionPageId && notionPageRoot !== getNotionRoot())
        throw new Error('Общее хранилище Notion изменилось. Повтори привязку страницы')
    return { notionPageId, notionPageRoot, notionPageTitle }
}
export const localApi = {
    projects: localRepository.projects,
    thoughts: localRepository.thoughts,
    createProject: queue(async (body: Parameters<typeof localRepository.createProject>[0]) =>
        localRepository.createProject({
            ...body,
            ...await validateProjectPage(body.notionPageId)
        })
    ),
    updateProject: queue(async (id: string, body: Parameters<typeof localRepository.updateProject>[1]) => {
        const current = localRepository.snapshot().projects.find((project) => project.id === id)
        return localRepository.updateProject(id, {
            ...body,
            ...await validateProjectPage(
                body.notionPageId,
                current?.notionPageRoot === getNotionRoot() ? current?.notionPageId : null
            )
        })
    }),
    deleteProject: queue(localRepository.deleteProject),
    createThought: queue(localRepository.createThought),
    updateThought: queue(localRepository.updateThought),
    updateChecklist: queue(localRepository.updateChecklist),
    deleteThought: queue(localRepository.deleteThought),
    processThought: queue(localRepository.processThought),
    resolveNotionConflict: queue(localRepository.resolveNotionConflict),
    settings: localSettings,
    saveSettings: async (settings: Parameters<typeof saveLocalSettings>[0]) => {
        const saved = await saveLocalSettings(settings)
        await localRepository.retry()
        void syncLocalData()
        return saved
    },
    config: async (): Promise<AIConfig> => ({
        generators: [
            { id: 'openrouter', label: 'OpenRouter', configured: await hasSecret('openrouter') }
        ],
        decisions: [
            {
                id: 'openrouter',
                label: 'AI-классификация',
                configured: await hasSecret('openrouter')
            },
            { id: 'disabled', label: 'Без классификации', configured: true }
        ]
    })
}
