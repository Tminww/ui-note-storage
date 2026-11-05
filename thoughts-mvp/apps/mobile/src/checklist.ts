const itemPattern = /^\s*[-*•]\s+\[([ xX])\]\s+(.+)$/
const listPattern = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/

export function checklistItem(line: string) {
    const match = line.match(itemPattern)
    return match ? { checked: match[1] !== ' ', text: match[2] } : null
}

export function checklistFromList(summary: string) {
    return summary.split(/\r?\n/).map((line) => {
        const item = line.match(listPattern)
        return item && !checklistItem(line) ? `- [ ] ${item[1]}` : line
    }).join('\n')
}

export function toggleChecklistItem(summary: string, index: number) {
    const lines = summary.split(/\r?\n/)
    const item = checklistItem(lines[index] ?? '')
    if (!item) return summary
    lines[index] = `- [${item.checked ? ' ' : 'x'}] ${item.text}`
    return lines.join('\n')
}
