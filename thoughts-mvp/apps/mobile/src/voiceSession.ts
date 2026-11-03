export type VoicePhase = 'idle' | 'starting' | 'listening' | 'pausing' | 'paused' | 'finishing' | 'error'
export type VoiceSnapshot = {
    phase: VoicePhase
    seconds: number
    level: number
    text: string
    error: string
    hint: string
    nativeBusy: boolean
}
type SpeechPort = {
    prepare: () => Promise<void>
    start: () => void
    stop: () => void
    abort: () => void
}

/** Owns the user session independently of delayed OS recognizer callbacks. */
export function createVoiceSession(speech: SpeechPort, onText: (text: string) => void, now = () => performance.now()) {
    let state: VoiceSnapshot = { phase: 'idle', seconds: 0, level: 0, text: '', error: '', hint: '', nativeBusy: false }
    const listeners = new Set<() => void>()
    let generation = 0
    let original = ''
    let committed = ''
    let interim = ''
    let total = 0
    let runningSince: number | null = null
    let nativeStartAt: number | null = null
    let listeningAt = 0
    let stopDeadline = 0
    let restartAt: number | null = null
    let accepting = false
    let wantsRecording = false
    let runHasText = false
    let heardSound = false
    let disposed = false
    let finishResolve: ((text: string) => void) | undefined
    let finishPromise: Promise<string> | undefined
    const emit = (patch: Partial<VoiceSnapshot>) => {
        if (disposed) return
        const next = { ...state, ...patch }
        if (Object.keys(next).every((key) => next[key as keyof VoiceSnapshot] === state[key as keyof VoiceSnapshot])) return
        state = next
        listeners.forEach((listener) => listener())
    }
    const elapsed = () => total + (runningSince === null ? 0 : Math.max(0, now() - runningSince))
    const freeze = () => {
        total = elapsed()
        runningSince = null
        emit({ seconds: Math.floor(total / 1000), level: 0 })
    }
    const publishText = () => {
        const text = [committed, interim].filter(Boolean).join('\n')
        emit({ text })
        onText(text)
    }
    const retainInterim = () => {
        committed = state.text
        interim = ''
    }
    const complete = () => {
        total = 0
        runningSince = null
        emit({ phase: 'idle', seconds: 0, level: 0, hint: '' })
        const resolve = finishResolve
        finishResolve = undefined
        finishPromise = undefined
        resolve?.(state.text)
    }
    const fail = (message: string) => {
        wantsRecording = false
        restartAt = null
        nativeStartAt = null
        accepting = false
        freeze()
        emit({ error: message, hint: '', phase: finishResolve ? 'finishing' : 'error' })
        if (finishResolve) complete()
    }
    const begin = async () => {
        const request = ++generation
        emit({ phase: 'starting', error: '', hint: 'Запускаем микрофон…', level: 0 })
        try {
            await speech.prepare()
            if (disposed || request !== generation || !wantsRecording) return
            accepting = true
            runHasText = false
            heardSound = false
            nativeStartAt = now()
            emit({ nativeBusy: true })
            speech.start()
        } catch (error) {
            if (disposed || request !== generation) return
            fail(error instanceof Error ? error.message : String(error))
            if (state.nativeBusy) speech.abort()
        }
    }
    return {
        snapshot: () => state,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
        start(text: string) {
            if (state.nativeBusy || state.phase === 'starting') return
            original = text
            committed = text.trimEnd()
            interim = ''
            total = 0
            runningSince = null
            restartAt = null
            wantsRecording = true
            emit({ seconds: 0, text, error: '', hint: '' })
            return begin()
        },
        resume() {
            if (state.nativeBusy || state.phase === 'starting') return
            retainInterim()
            wantsRecording = true
            return begin()
        },
        pause() {
            wantsRecording = false
            restartAt = null
            generation++
            freeze()
            nativeStartAt = null
            if (!state.nativeBusy) { emit({ phase: 'paused', hint: '' }); return }
            if (state.phase === 'pausing' || state.phase === 'finishing') return
            emit({ phase: 'pausing', hint: 'Завершаем последнюю фразу…' })
            stopDeadline = now() + 4000
            try { speech.stop() } catch (error) { fail(String(error)); speech.abort() }
        },
        finish(): Promise<string> {
            if (finishPromise) return finishPromise
            wantsRecording = false
            restartAt = null
            generation++
            nativeStartAt = null
            freeze()
            total = 0
            const wasPausing = state.phase === 'pausing'
            emit({ seconds: 0, phase: 'finishing', hint: 'Получаем последние слова…' })
            const pending = new Promise<string>((resolve) => { finishResolve = resolve })
            finishPromise = pending
            if (!state.nativeBusy) complete()
            else {
                stopDeadline = now() + 4000
                if (!wasPausing) {
                    try { speech.stop() } catch { accepting = false; speech.abort(); complete() }
                }
            }
            return pending
        },
        cancel() {
            wantsRecording = false
            accepting = false
            generation++
            restartAt = nativeStartAt = null
            runningSince = null
            total = 0
            committed = original
            interim = ''
            emit({ phase: 'idle', text: original, seconds: 0, level: 0, error: '', hint: '' })
            onText(original)
            if (state.nativeBusy) { try { speech.abort() } catch { /* native end will clear busy */ } }
            if (finishResolve) complete()
        },
        onStart() {
            if (!accepting || !wantsRecording || state.phase !== 'starting') return
            nativeStartAt = null
            listeningAt = now()
            runningSince = now()
            emit({ phase: 'listening', hint: '' })
        },
        onAudioEnd() {
            if (!accepting) return
            freeze()
        },
        onResult(event: { isFinal: boolean; results: { transcript: string }[] }) {
            if (!accepting) return
            // Entries are alternative hypotheses, not consecutive phrases.
            const text = event.results[0]?.transcript.trim()
            if (!text) return
            runHasText = true
            interim = text
            publishText()
            if (event.isFinal) retainInterim()
            emit({ hint: '', error: '' })
        },
        onVolume(value: number) {
            if (state.phase !== 'listening') return
            if (value > 0) heardSound = true
            emit({ level: Math.round(Math.min(1, Math.max(0, value / 10)) * 10) / 10 })
        },
        onError(message: string, aborted = false) {
            if (!accepting || aborted) return
            fail(message)
        },
        onEnd() {
            if (!state.nativeBusy) return
            const wasAccepting = accepting
            accepting = false
            nativeStartAt = null
            freeze()
            retainInterim()
            emit({ nativeBusy: false })
            if (finishResolve) { complete(); return }
            if (!wasAccepting) return
            if (wantsRecording && runHasText) {
                // Legacy Android recognizers end after every phrase. Restart only
                // after their end callback, with no recording time counted in the gap.
                restartAt = now() + 300
                emit({ phase: 'starting', hint: 'Продолжаем диктовку…' })
            } else {
                wantsRecording = false
                emit({ phase: 'paused', hint: runHasText ? '' : 'Текст не получен. Можно повторить диктовку.' })
            }
        },
        tick() {
            if (restartAt !== null && now() >= restartAt) { restartAt = null; void begin() }
            if (nativeStartAt !== null && now() - nativeStartAt >= 8000) {
                fail('Системное распознавание не запустилось. Проверь службу голосового ввода и доступ к микрофону в настройках Android.')
                speech.abort()
            }
            if (state.phase === 'listening') {
                emit({ seconds: Math.floor(elapsed() / 1000) })
                if (!runHasText && now() - listeningAt >= 12000)
                    emit({ hint: heardSound ? 'Звук поступает, но распознаватель пока не вернул текст.' : 'Распознаватель пока не слышит речь. Проверь микрофон.' })
                if (!runHasText && now() - listeningAt >= 25000) {
                    wantsRecording = false
                    freeze()
                    stopDeadline = now() + 4000
                    emit({ phase: 'pausing', error: 'Распознаватель пока не вернул текст. Проверяем последние слова; если текста нет, проверь интернет, русский язык и службу распознавания речи.', hint: '' })
                    // Some providers only return a final transcript after stop.
                    // Give that result a bounded chance instead of discarding it.
                    try { speech.stop() } catch (error) { fail(String(error)); speech.abort() }
                }
            }
            if ((state.phase === 'pausing' || state.phase === 'finishing') && now() >= stopDeadline) {
                const finishing = state.phase === 'finishing'
                accepting = false
                speech.abort()
                emit({ hint: 'Последний распознанный текст сохранён.', phase: finishing ? 'finishing' : 'paused' })
                if (finishing) complete()
            }
        },
        dispose() {
            generation++
            disposed = true
            listeners.clear()
            if (state.nativeBusy) speech.abort()
        }
    }
}
