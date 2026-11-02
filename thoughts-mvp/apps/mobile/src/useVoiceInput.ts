/**
 * Speech is captured by the OS / browser speech recognizer, never by the API.
 * We only receive string transcripts. Never create an audio file and never
 * upload audio. The recognizer itself MAY use its vendor's cloud service.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

export type VoiceState = 'idle' | 'starting' | 'listening' | 'stopping';

export function useVoiceInput(onText: (nextText: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState('');
  const [onDeviceOnly, setOnDeviceOnly] = useState(false);
  const initialText = useRef('');
  const handler = useRef(onText);
  const attempted = useRef(false);
  const voiceState = useRef<VoiceState>('idle');
  useEffect(() => { handler.current = onText; }, [onText]);
  const changeState = (value:VoiceState) => { voiceState.current = value; setState(value); };

  useSpeechRecognitionEvent('start', () => changeState('listening'));
  useSpeechRecognitionEvent('end', () => changeState('idle'));
  useSpeechRecognitionEvent('result', (event) => {
    // Results represent the current utterance. Interim text is replaced by
    // the final transcript, so interim fragments are not duplicated.
    const transcript = event.results.map(result => result.transcript).filter(Boolean).join(' ').trim();
    if (!transcript) return;
    handler.current(initialText.current ? `${initialText.current}\n${transcript}` : transcript);
  });
  useSpeechRecognitionEvent('error', (event) => {
    changeState('idle');
    if (event.error !== 'aborted') setError(`Не удалось распознать речь: ${event.message || event.error}. Можно ввести текст вручную.`);
  });
  useEffect(() => () => {
    // Leave no active microphone when this screen is unmounted.
    if (attempted.current) {
      try { ExpoSpeechRecognitionModule.abort(); } catch { /* already stopped */ }
    }
  }, []);

  const start = useCallback(async (existingText: string) => {
    if (voiceState.current !== 'idle') return;
    setError('');
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError('Распознавание речи недоступно в этом браузере или на устройстве. Попробуй Chrome, Safari либо мобильную сборку.');
      return;
    }
    try {
      changeState('starting');
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        changeState('idle');
        setError('Доступ к микрофону не предоставлен. Разреши его в настройках и попробуй ещё раз.');
        return;
      }
      initialText.current = existingText.trimEnd();
      attempted.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: 'ru-RU',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
        ...(Platform.OS !== 'web' ? { requiresOnDeviceRecognition: onDeviceOnly } : {}),
        // Explicitly prevent persisting audio even locally.
        recordingOptions: { persist: false }
      });
    } catch (e) {
      changeState('idle');
      setError(`Не удалось запустить микрофон: ${(e as Error).message}`);
    }
  }, [onDeviceOnly]);

  const stop = useCallback(() => {
    if (voiceState.current !== 'starting' && voiceState.current !== 'listening') return;
    changeState('stopping');
    try { ExpoSpeechRecognitionModule.stop(); }
    catch (e) { changeState('idle'); setError((e as Error).message); }
  }, []);

  const active = state !== 'idle';
  return { state, active, error, start, stop, onDeviceOnly, setOnDeviceOnly };
}
