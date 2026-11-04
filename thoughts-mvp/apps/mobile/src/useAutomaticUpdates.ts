import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import * as Updates from 'expo-updates'
import AsyncStorage from '@react-native-async-storage/async-storage'

// A release build downloads compatible EAS updates quietly. Never interrupt an
// unsaved thought by automatically reloading JavaScript while the app is open.
const MINIMUM_CHECK_INTERVAL_MS = 5 * 60 * 1000

export function useAutomaticUpdates() {
    const [status, setStatus] = useState('')
    const [downloaded, setReady] = useState(false)
    const { isUpdatePending } = Updates.useUpdates()
    const ready = downloaded || isUpdatePending
    const [firstLaunchedAt, setFirstLaunchedAt] = useState<string | null>(null)
    const [checking, setChecking] = useState(false)
    const inFlight = useRef(false)
    const lastCheckAt = useRef(0)
    const enabled = Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled
    useEffect(() => {
        if (!enabled || !Updates.updateId) return
        let mounted = true
        void (async () => {
            const key = 'thoughts:running-update'
            const saved = await AsyncStorage.getItem(key)
            let previous: { id?: string; firstLaunchedAt?: string } = {}
            try { previous = JSON.parse(saved || '{}') } catch { /* replace invalid metadata only */ }
            const firstLaunchedAt = previous.id === Updates.updateId && previous.firstLaunchedAt
                ? previous.firstLaunchedAt : new Date().toISOString()
            if (mounted) setFirstLaunchedAt(firstLaunchedAt)
            await AsyncStorage.setItem(key, JSON.stringify({ id: Updates.updateId, firstLaunchedAt }))
        })().catch(() => {})
        return () => { mounted = false }
    }, [enabled])

    const check = useCallback(
        async (manual = false) => {
            if (!enabled) {
                if (manual) {
                    setStatus(
                        'Автообновления недоступны в этой сборке. После привязки Expo нужен один новый APK.'
                    )
                }
                return
            }
            if (inFlight.current || ready) return
            const now = Date.now()
            if (!manual && now - lastCheckAt.current < MINIMUM_CHECK_INTERVAL_MS) return
            lastCheckAt.current = now
            inFlight.current = true
            if (manual) setStatus('Проверяем обновления…')
            setChecking(true)
            try {
                const result = await Updates.checkForUpdateAsync()
                if (!result.isAvailable) {
                    if (manual) setStatus('У тебя уже последняя версия интерфейса.')
                    return
                }
                setStatus('Скачиваем новую версию…')
                await Updates.fetchUpdateAsync()
                setReady(true)
                setStatus(
                    'Новая версия скачана. Можно применить её сейчас или при следующем запуске.'
                )
            } catch (error) {
                if (manual) {
                    setStatus(
                        'Не удалось проверить обновления: ' +
                            (error instanceof Error ? error.message : String(error))
                    )
                } else {
                    // Offline use remains fully functional. Allow retry on next foreground.
                    lastCheckAt.current = 0
                    setStatus('Автообновление отложено: ' + (error instanceof Error ? error.message : String(error)))
                }
            } finally {
                inFlight.current = false
                setChecking(false)
            }
        },
        [enabled, ready]
    )

    const apply = useCallback(async () => {
        if (!enabled || !ready) return
        try {
            setStatus('Применяем обновление…')
            await Updates.reloadAsync()
        } catch (error) {
            setStatus(
                'Не удалось перезапустить приложение: ' +
                    (error instanceof Error ? error.message : String(error))
            )
        }
    }, [enabled, ready])

    useEffect(() => {
        if (!enabled) return
        const timer = setTimeout(() => void check(), 0)
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') void check()
        })
        return () => {
            clearTimeout(timer)
            subscription.remove()
        }
    }, [enabled, check])

    return { enabled, status, ready, checking, check, apply, firstLaunchedAt,
        publishedAt: Updates.createdAt?.toISOString() ?? null,
        updateId: Updates.updateId, embedded: Updates.isEmbeddedLaunch }
}
