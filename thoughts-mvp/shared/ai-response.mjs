/** Accept common structured-output shapes while retaining the original as a safe fallback. */
export function normalizeAIResponse(content, original) {
    const text = Array.isArray(content) ? content.map((part) => part?.text ?? '').join('') : content
    let parsed
    try {
        parsed = typeof text === 'string'
            ? JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
            : text
    } catch {
        throw new Error('ИИ вернул неполный ответ. Повтори обработку.')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('ИИ вернул неподдерживаемый формат ответа.')
    const result = [parsed, parsed.result, parsed.note, parsed.data].find((value) =>
        value && typeof value === 'object' && ('title' in value || 'summary' in value)
    )
    if (!result) throw new Error('ИИ вернул неподдерживаемый формат ответа.')
    let summary = typeof result.summary === 'string' ? result.summary.trim() : ''
    if (Array.isArray(result.summary)) {
        summary = result.summary.map((item) => {
            if (typeof item === 'string' && item.trim()) return /^\s*[-*•\d]/.test(item) ? item : `- ${item}`
            if (item && typeof item.text === 'string' && item.text.trim())
                return `- [${item.completed === true ? 'x' : ' '}] ${item.text.trim()}`
            return ''
        }).filter(Boolean).join('\n')
    }
    const title = typeof result.title === 'string' ? result.title.trim() : ''
    if (!title && !summary) throw new Error('ИИ вернул пустой ответ. Повтори обработку.')
    const fallbackTitle = (summary || original).split(/\r?\n/)[0].replace(/^\s*[-*•]\s*(?:\[[ xX]\]\s*)?/, '')
    return {
        title: (title || fallbackTitle).slice(0, 90),
        summary: (summary || original.trim()).slice(0, 800),
        tags: Array.isArray(result.tags)
            ? [...new Set(result.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim().slice(0, 28)).filter(Boolean))].slice(0, 4)
            : []
    }
}
