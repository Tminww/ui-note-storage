/** Audio is handled by the system recognizer; Thoughts stores only its transcript. */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppState, Platform } from 'react-native'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent, type ExpoSpeechRecognitionOptions } from 'expo-speech-recognition'
import { createVoiceSession } from './voiceSession'

export function useVoiceInput(onText: (nextText: string) => void, onDeviceOnly = false) {
    const [{ session, configure }] = useState(() => {
        let options: ExpoSpeechRecognitionOptions
        let handleText = (_text: string) => {}
        let deviceOnly = false
        const session = createVoiceSession({
            async prepare() {
                if (!ExpoSpeechRecognitionModule.isRecognitionAvailable())
                    throw new Error('На устройстве недоступна служба распознавания речи. Включи системный голосовой ввод в настройках.')
                const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
                if (!permission.granted)
                    throw new Error('Нет доступа к микрофону. Разреши его для Thoughts в настройках устройства.')
                if (AppState.currentState && AppState.currentState !== 'active')
                    throw new Error('Вернись в Thoughts и повтори запуск микрофона.')
                if (deviceOnly && Platform.OS !== 'web' && !ExpoSpeechRecognitionModule.supportsOnDeviceRecognition())
                    throw new Error('Распознавание на устройстве недоступно. Выключи «Только на устройстве» в настройках голоса или установи русский офлайн-пакет.')
                options = {
                    lang: 'ru-RU',
                    interimResults: true,
                    // Use the standard Android microphone path across vendors and
                    // OS versions; restart after each phrase's native end callback.
                    continuous: Platform.OS !== 'android',
                    maxAlternatives: 1,
                    // Android punctuation is reliably supported only on-device.
                    addsPunctuation: Platform.OS === 'ios' || deviceOnly,
                    ...(Platform.OS !== 'web' ? { requiresOnDeviceRecognition: deviceOnly } : {}),
                    volumeChangeEventOptions: { enabled: true, intervalMillis: 150 },
                    recordingOptions: { persist: false }
                }
            },
            start: () => ExpoSpeechRecognitionModule.start(options),
            stop: () => ExpoSpeechRecognitionModule.stop(),
            abort: () => { try { ExpoSpeechRecognitionModule.abort() } catch { /* already ended */ } }
        }, (text) => handleText(text))
        return { session, configure(handler: (text: string) => void, onDevice: boolean) { handleText = handler; deviceOnly = onDevice } }
    })
    useEffect(() => { configure(onText, onDeviceOnly) }, [configure, onText, onDeviceOnly])
    const snapshot = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot)
    useSpeechRecognitionEvent('start', session.onStart)
    useSpeechRecognitionEvent('end', session.onEnd)
    useSpeechRecognitionEvent('audioend', session.onAudioEnd)
    useSpeechRecognitionEvent('result', session.onResult)
    useSpeechRecognitionEvent('volumechange', ({ value }) => session.onVolume(value))
    useSpeechRecognitionEvent('error', (event) => {
        const message = event.error === 'not-allowed'
            ? 'Доступ к микрофону запрещён. Разреши его для Thoughts в настройках устройства.'
            : event.error === 'language-not-supported'
              ? 'Русский язык недоступен в выбранной службе. Установи русский пакет или выключи «Только на устройстве».'
              : event.error === 'network'
                ? 'Служба распознавания не подключилась к сети. Проверь интернет или используй установленный русский офлайн-пакет.'
                : event.error === 'no-speech' || event.error === 'speech-timeout'
                  ? 'Речь не распознана. Попробуй ещё раз и проверь, что микрофон слышит голос.'
                  : `Системное распознавание: ${event.message || event.error}`
        session.onError(message, event.error === 'aborted')
    })
    useEffect(() => {
        const timer = setInterval(session.tick, 150)
        return () => { clearInterval(timer); session.dispose() }
    }, [session])
    return {
        ...snapshot,
        active: ['starting', 'listening', 'pausing', 'finishing'].includes(snapshot.phase),
        recording: snapshot.phase === 'listening',
        start: session.start, resume: session.resume, pause: session.pause,
        finish: session.finish, cancel: session.cancel
    }
}
