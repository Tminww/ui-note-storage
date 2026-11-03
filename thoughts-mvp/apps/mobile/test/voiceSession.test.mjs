import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceSession } from '../src/voiceSession.ts'

function fixture(prepare = async () => {}) {
    let time = 0
    const calls = { start: 0, stop: 0, abort: 0 }
    const texts = []
    const voice = createVoiceSession({ prepare, start() { calls.start++ }, stop() { calls.stop++ }, abort() { calls.abort++ } }, (text) => texts.push(text), () => time)
    return { voice, calls, texts, advance(ms) { time += ms; voice.tick() }, result(text, isFinal = false) { voice.onResult({ isFinal, results: [{ transcript: text }] }) } }
}
async function listening(f) { await f.voice.start(''); f.voice.onStart() }

test('pause at 30 seconds freezes immediately while Android still returns the final phrase', async () => {
    const f = fixture(); await listening(f); f.result('Первая фраза')
    f.advance(30_000)
    assert.equal(f.voice.snapshot().seconds, 30)
    f.voice.pause(); f.advance(1500)
    assert.equal(f.voice.snapshot().seconds, 30)
    f.result('Первая фраза.', true); f.voice.onEnd()
    f.advance(60_000)
    assert.equal(f.voice.snapshot().seconds, 30)
    await f.voice.resume(); f.voice.onStart(); f.result('Вторая фраза')
    f.advance(7000)
    assert.equal(f.voice.snapshot().seconds, 37)
    assert.equal(f.voice.snapshot().text, 'Первая фраза.\nВторая фраза')
})

test('done resets to zero immediately and retains words delivered after stop', async () => {
    const f = fixture(); await listening(f); f.result('Черновой'); f.advance(3100)
    const done = f.voice.finish()
    assert.equal(f.voice.snapshot().seconds, 0)
    f.advance(1200)
    assert.equal(f.voice.snapshot().seconds, 0)
    f.voice.onStart() // a late callback must not restart the clock
    f.result('Последние слова.', true); f.voice.onEnd()
    assert.equal(await done, 'Последние слова.')
    f.advance(40_000)
    assert.equal(f.voice.snapshot().seconds, 0)
    assert.equal(f.voice.snapshot().phase, 'idle')
})

test('a new dictation starts at zero instead of inheriting the previous interval', async () => {
    const f = fixture(); await listening(f); f.result('Текст'); f.advance(38_000)
    const done = f.voice.finish(); f.voice.onEnd(); await done
    await f.voice.start('Текст'); assert.equal(f.voice.snapshot().seconds, 0)
    f.voice.onStart(); f.advance(2100)
    assert.equal(f.voice.snapshot().seconds, 2)
})

test('permission waiting is not recording time and cancellation invalidates its continuation', async () => {
    let grant; const f = fixture(() => new Promise((resolve) => { grant = resolve }))
    const starting = f.voice.start('Исходный текст')
    f.advance(31_000)
    assert.equal(f.voice.snapshot().seconds, 0)
    f.voice.cancel(); grant(); await starting
    f.voice.onStart(); f.result('Поздний результат')
    assert.equal(f.calls.start, 0)
    assert.equal(f.voice.snapshot().phase, 'idle')
    assert.equal(f.voice.snapshot().text, 'Исходный текст')
})

test('cancel ignores late native events and restores the original draft', async () => {
    const f = fixture(); await f.voice.start('До записи'); f.voice.onStart(); f.result('Добавленная речь')
    f.voice.cancel(); f.result('Поздняя речь', true); f.voice.onStart(); f.advance(3000)
    assert.equal(f.voice.snapshot().text, 'До записи')
    assert.equal(f.voice.snapshot().seconds, 0)
    await f.voice.start('Нельзя до native end')
    assert.equal(f.calls.start, 1)
    f.voice.onEnd(); await f.voice.start('Новая'); f.voice.onStart()
    assert.equal(f.voice.snapshot().phase, 'listening')
})

test('alternatives and partial revisions do not duplicate the transcript', async () => {
    const f = fixture(); await f.voice.start('Печатный текст'); f.voice.onStart()
    f.voice.onResult({ isFinal: false, results: [{ transcript: 'Мысль' }, { transcript: 'Альтернатива' }] })
    f.result('Мысль о проекте'); f.result('Мысль о проекте.', true); f.result('Следующая')
    assert.equal(f.voice.snapshot().text, 'Печатный текст\nМысль о проекте.\nСледующая')
})

test('legacy phrase completion restarts only after native end and excludes the gap', async () => {
    const f = fixture(); await listening(f); f.result('Первая.', true); f.advance(2200)
    f.voice.onAudioEnd(); f.voice.onEnd(); f.advance(300)
    await Promise.resolve()
    assert.equal(f.calls.start, 2)
    assert.equal(f.voice.snapshot().seconds, 2)
    f.voice.onStart(); f.result('Вторая.', true); f.advance(1100)
    assert.equal(f.voice.snapshot().seconds, 3)
    assert.equal(f.voice.snapshot().text, 'Первая.\nВторая.')
})

test('a recognizer that never becomes ready fails visibly without a fake running clock', async () => {
    const f = fixture(); await f.voice.start('')
    f.advance(8100)
    assert.equal(f.voice.snapshot().phase, 'error')
    assert.match(f.voice.snapshot().error, /не запустилось/)
    assert.equal(f.voice.snapshot().seconds, 0)
    assert.equal(f.calls.abort, 1)
})

test('sound without recognition produces feedback and a bounded failure', async () => {
    const f = fixture(); await listening(f); f.voice.onVolume(7)
    assert.equal(f.voice.snapshot().level, 0.7)
    f.advance(12_000); assert.match(f.voice.snapshot().hint, /Звук поступает/)
    f.advance(13_000); assert.equal(f.voice.snapshot().phase, 'pausing')
    assert.match(f.voice.snapshot().error, /не вернул текст/)
    const frozen = f.voice.snapshot().seconds; f.advance(60_000)
    assert.equal(f.voice.snapshot().seconds, frozen)
})

test('missing final callback cannot keep done waiting or overwrite retained partial text', async () => {
    const f = fixture(); await listening(f); f.result('Уже распознано')
    const done = f.voice.finish(); f.advance(4001)
    assert.equal(await done, 'Уже распознано')
    f.result('Очень поздний ответ', true); f.voice.onEnd(); f.advance(10_000)
    assert.equal(f.voice.snapshot().text, 'Уже распознано')
    assert.equal(f.voice.snapshot().seconds, 0)
})

test('permission or provider failure is visible and never says listening', async () => {
    const f = fixture(async () => { throw new Error('Нет доступа к микрофону') })
    await f.voice.start('Черновик')
    assert.equal(f.voice.snapshot().phase, 'error')
    assert.equal(f.voice.snapshot().text, 'Черновик')
    assert.equal(f.calls.start, 0)
})

test('repeated done waits for the same final result instead of returning a stale partial', async () => {
    const f = fixture(); await listening(f); f.result('Частичный')
    const first = f.voice.finish(); const second = f.voice.finish()
    assert.equal(first, second)
    f.result('Полный ответ', true); f.voice.onEnd()
    assert.equal(await second, 'Полный ответ')
})

test('a final-only provider can flush its transcript after the no-result timeout', async () => {
    const f = fixture(); await listening(f); f.advance(25_000)
    assert.equal(f.calls.stop, 1)
    f.result('Ответ после остановки', true); f.voice.onEnd()
    assert.equal(f.voice.snapshot().text, 'Ответ после остановки')
    assert.equal(f.voice.snapshot().error, '')
    assert.equal(f.voice.snapshot().phase, 'paused')
})
