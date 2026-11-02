export type Category = 'idea' | 'task' | 'bug' | 'research' | 'note';
export type ThoughtStatus = 'pending' | 'processing' | 'ready' | 'needs_review';
export type Project = {
  id: string; name: string; description: string; color: string;
  createdAt: string; updatedAt: string; thoughtCount?: number;
};
export type Thought = {
  id: string; rawText: string; title: string; summary: string;
  tags: string[]; projectId: string | null; projectLocked: boolean;
  category: Category; status: ThoughtStatus; confidence: number | null;
  errorMessage: string | null; generatorModel: string | null;
  decisionModel: string | null; createdAt: string; updatedAt: string;
};
export type Settings = {
  generatorProvider: string; generatorModel: string;
  decisionProvider: string; decisionModel: string;
  confidenceThreshold: number;
};
export type ProviderOption = {id:string; label:string; configured:boolean};
export type AIConfig = { generators:ProviderOption[]; decisions:ProviderOption[] };

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

export async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${endpoint}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers }
    });
  } catch {
    throw new Error(`Нет связи с API (${API_URL}). Проверь адрес сервера и сеть.`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка API: ${response.status}`);
  return data as T;
}
export const api = {
  projects: () => request<Project[]>('/projects'),
  createProject: (body: { name:string; description:string; color:string }) => request<Project>('/projects', {method:'POST',body:JSON.stringify(body)}),
  updateProject: (id:string, body: Partial<Project>) => request<Project>(`/projects/${id}`, {method:'PATCH',body:JSON.stringify(body)}),
  deleteProject: (id:string) => request<{ok:boolean}>(`/projects/${id}`, {method:'DELETE'}),
  thoughts: () => request<Thought[]>('/thoughts'),
  createThought: (rawText:string,projectId:string|null) => request<Thought>('/thoughts', {method:'POST',body:JSON.stringify({rawText,projectId})}),
  processThought: (id:string) => request<Thought>(`/thoughts/${id}/process`, {method:'POST'}),
  updateThought: (id:string,body:Partial<Thought>) => request<Thought>(`/thoughts/${id}`, {method:'PATCH',body:JSON.stringify(body)}),
  deleteThought: (id:string) => request<{ok:boolean}>(`/thoughts/${id}`, {method:'DELETE'}),
  settings: () => request<Settings>('/settings'),
  config: () => request<AIConfig>('/config'),
  saveSettings: (body:Settings) => request<Settings>('/settings', {method:'PATCH',body:JSON.stringify(body)})
};
