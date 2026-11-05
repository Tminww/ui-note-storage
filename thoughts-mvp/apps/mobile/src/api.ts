import AsyncStorage from '@react-native-async-storage/async-storage'
import { localApi } from './localService'
import type { Category, ClassificationProposal, ThoughtType } from './taxonomy'
export type { Category } from './taxonomy'
export type ThoughtStatus = 'pending' | 'processing' | 'ready' | 'needs_review'
export type Project = {
    localId?: string
    localRevision?: number
    id: string
    name: string
    description: string
    color: string
    createdAt: string
    updatedAt: string
    thoughtCount?: number
    notionPageId?: string | null
    notionPageRoot?: string | null
    notionPageTitle?: string | null
}
export type Thought = {
    localId?: string
    localRevision?: number
    notionParentId?: string
    notionObject?: 'page' | 'toggle'
    notionReplacesVersion?: string
    notionReplacesId?: string
    notionVersion?: string
    id: string
    rawText: string
    title: string
    summary: string
    tags: string[]
    projectId: string | null
    projectLocked: boolean
    category: Category
    categoryLocked?: boolean
    categoryDefinition?: ThoughtType
    classificationProposal?: ClassificationProposal | null
    status: ThoughtStatus
    confidence: number | null
    errorMessage: string | null
    generatorModel: string | null
    decisionModel: string | null
    createdAt: string
    updatedAt: string
}
export type Settings = {
    generatorProvider: string
    generatorModel: string
    decisionProvider: string
    decisionModel: string
    confidenceThreshold: number
}
export type ProviderOption = { id: string; label: string; configured: boolean }
export type AIConfig = { generators: ProviderOption[]; decisions: ProviderOption[] }

const DEFAULT_API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000').replace(
    /\/+$/,
    ''
)
const API_URL_STORAGE_KEY = 'thoughts:api-url'
let API_URL = DEFAULT_API_URL

export function getApiUrl(): string {
    return API_URL
}
export async function loadApiUrl(): Promise<string> {
    try {
        const saved = await AsyncStorage.getItem(API_URL_STORAGE_KEY)
        if (saved && /^https?:\/\//.test(saved)) API_URL = saved.replace(/\/+$/, '')
    } catch {
        /* Keep the default URL if device storage is unavailable. */
    }
    return API_URL
}
export async function saveApiUrl(url: string): Promise<string> {
    const normalized = url.trim().replace(/\/+$/, '')
    if (!/^https?:\/\/[^\s/]+(?::\d+)?(?:\/[^\s]*)?$/.test(normalized)) {
        throw new Error('Укажи полный URL API, например http://192.168.1.25:4000')
    }
    await AsyncStorage.setItem(API_URL_STORAGE_KEY, normalized)
    API_URL = normalized
    return API_URL
}

export async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
    let response: Response
    try {
        response = await fetch(`${API_URL}/api${endpoint}`, {
            ...init,
            signal: init?.signal ?? AbortSignal.timeout(45000),
            headers: { 'Content-Type': 'application/json', ...init?.headers }
        })
    } catch {
        throw new Error(`Нет связи с API (${API_URL}). Проверь адрес сервера и сеть.`)
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `Ошибка API: ${response.status}`)
    return data as T
}
export const serverApi = {
    projects: () => request<Project[]>('/projects'),
    createProject: (body: Pick<Project, 'name' | 'description' | 'color' | 'notionPageId'>) =>
        request<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
    updateProject: (id: string, body: Partial<Project>) =>
        request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteProject: (id: string) =>
        request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
    thoughts: () => request<Thought[]>('/thoughts'),
    createThought: (rawText: string, projectId: string | null) =>
        request<Thought>('/thoughts', {
            method: 'POST',
            body: JSON.stringify({ rawText, projectId })
        }),
    processThought: (id: string) => request<Thought>(`/thoughts/${id}/process`, { method: 'POST' }),
    updateThought: (id: string, body: Partial<Thought>) =>
        request<Thought>(`/thoughts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteThought: (id: string) =>
        request<{ ok: boolean }>(`/thoughts/${id}`, { method: 'DELETE' }),
    settings: () => request<Settings>('/settings'),
    config: () => request<AIConfig>('/config'),
    saveSettings: (body: Settings) =>
        request<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(body) })
}

// Screens always read and write locally. Network work is performed by the durable queue.
export const api = localApi satisfies typeof serverApi
