import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { Uniwind } from 'uniwind'
import type { Preferences } from './localCore'

export const accents = [
    { id: 'indigo', name: 'Индиго', light: '91 79 224', dark: '138 128 255' },
    { id: 'blue', name: 'Синий', light: '47 111 237', dark: '111 160 255' },
    { id: 'emerald', name: 'Изумруд', light: '11 122 108', dark: '63 205 184' },
    { id: 'coral', name: 'Коралл', light: '217 72 59', dark: '255 138 125' },
    { id: 'graphite', name: 'Графит', light: '43 45 66', dark: '189 191 219' }
] as const

export function useAppearance(preferences: Preferences) {
    const system = useColorScheme()
    const dark =
        preferences.theme === 'dark' || (preferences.theme === 'system' && system === 'dark')
    useEffect(() => {
        const accent = accents.find((a) => a.id === preferences.accent) || accents[0]
        Uniwind.updateCSSVariables('light', { '--primary': accent.light })
        Uniwind.updateCSSVariables('dark', { '--primary': accent.dark })
        Uniwind.setTheme(preferences.theme)
    }, [preferences.theme, preferences.accent])
    return { dark }
}
