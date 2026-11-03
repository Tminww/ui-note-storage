import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import * as Crypto from 'expo-crypto'
import { createLocalRepository, type SyncAdapters } from './localCore'
import { localDocument } from './localDocument'
import { enrichNote, localSettings, saveLocalSettings } from './onDeviceAI'
import { createNotionSyncAdapter, getProjects, getThoughts } from './notionStorage'
import { getNotionRoot, hasSecret } from './deviceConfig'
import { getApiUrl, request, serverApi, type AIConfig, type Thought } from './api'

export const localRepository = createLocalRepository(localDocument, () => Crypto.randomUUID())
type SyncStatus = {
    online: boolean
    syncing: boolean
    error: string
    lastSync: number | null
    aiConfigured: boolean
    notionConfigured: boolean
}
let status: SyncStatus = {
    online: true,
    syncing: false,
    error: '',
    lastSync: null,
    aiConfigured: false,
    notionConfigured: false
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
        if (aiConfigured)
            adapters.enrich = async (thought, projects) => {
                const settings = await localSettings()
                if (hasAI)
                    return enrichNote(
                        thought.rawText,
                        projects,
                        thought.projectLocked ? thought.projectId : null,
                        settings
                    )
                return request<Partial<Thought>>('/enrich', {
                    method: 'POST',
                    body: JSON.stringify({
                        rawText: thought.rawText,
                        projectId: thought.projectLocked ? thought.projectId : null,
                        projects,
                        settings
                    })
                })
            }
        if (notionConfigured) {
            try {
                const root = getNotionRoot()
                const [projects, thoughts] = await Promise.all([getProjects(), getThoughts()])
                await localRepository.importRemote(projects, thoughts, root)
                adapters.notion = await createNotionSyncAdapter({ projects, thoughts })
            } catch (error) {
                publish({ error: error instanceof Error ? error.message : String(error) })
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
export const localApi = {
    projects: localRepository.projects,
    thoughts: localRepository.thoughts,
    createProject: queue(localRepository.createProject),
    updateProject: queue(localRepository.updateProject),
    deleteProject: queue(localRepository.deleteProject),
    createThought: queue(localRepository.createThought),
    updateThought: queue(localRepository.updateThought),
    deleteThought: queue(localRepository.deleteThought),
    processThought: queue(localRepository.processThought),
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
