export const builtinCategories = {
    idea: 'Идея', task: 'Задача', bug: 'Ошибка', research: 'Исследование', note: 'Заметка'
}
export type Category = keyof typeof builtinCategories | `custom:${string}`
export type ThoughtType = { id: Category; name: string; description: string }
export type NamedSuggestion = { name: string; description: string }
export type ClassificationProposal = {
    project?: NamedSuggestion
    category?: NamedSuggestion
    reason: string
    model: string
    unresolved?: { project: boolean; category: boolean }
}
export const allTypes = (custom: ThoughtType[] = []): ThoughtType[] => [
    ...Object.entries(builtinCategories).map(([id, name]) => ({ id: id as Category, name, description: ({ idea: 'Предложение, возможность или улучшение', task: 'Конкретное действие или напоминание', bug: 'Ошибка или неисправность', research: 'Вопрос, гипотеза или исследование', note: 'Наблюдение, факт или размышление без конкретного действия' } as Record<string, string>)[id] })),
    ...custom
]
export const normalizedName = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU')
export function namedSuggestion(raw: unknown): NamedSuggestion | undefined {
    if (!raw || typeof raw !== 'object') return undefined
    const item = raw as Record<string, unknown>
    if (typeof item.name !== 'string' || !item.name.trim()) return undefined
    return { name: item.name.trim().slice(0, 80), description: typeof item.description === 'string' ? item.description.trim().slice(0, 400) : '' }
}
