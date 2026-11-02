import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

// A release build downloads compatible EAS updates quietly. Never interrupt an
// unsaved thought by automatically reloading JavaScript while the app is open.
const MINIMUM_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function useAutomaticUpdates() {
  const [status, setStatus] = useState('');
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const lastCheckAt = useRef(0);
  const enabled = Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;

  const check = useCallback(async (manual = false) => {
    if (!enabled) {
      if (manual) {
        setStatus('Автообновления недоступны в этой сборке. После привязки Expo нужен один новый APK.');
      }
      return;
    }
    if (inFlight.current || ready) return;
    const now = Date.now();
    if (!manual && now - lastCheckAt.current < MINIMUM_CHECK_INTERVAL_MS) return;
    lastCheckAt.current = now;
    inFlight.current = true;
    if (manual) setStatus('Проверяем обновления…');
    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        if (manual) setStatus('У тебя уже последняя версия интерфейса.');
        return;
      }
      setStatus('Скачиваем новую версию…');
      await Updates.fetchUpdateAsync();
      setReady(true);
      setStatus('Новая версия скачана. Можно применить её сейчас или при следующем запуске.');
    } catch (error) {
      if (manual) {
        setStatus('Не удалось проверить обновления: ' + (error instanceof Error ? error.message : String(error)));
      } else {
        // Offline use remains fully functional. Allow retry on next foreground.
        lastCheckAt.current = 0;
        setStatus('');
      }
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, [enabled, ready]);

  const apply = useCallback(async () => {
    if (!enabled || !ready) return;
    try {
      setStatus('Применяем обновление…');
      await Updates.reloadAsync();
    } catch (error) {
      setStatus('Не удалось перезапустить приложение: ' + (error instanceof Error ? error.message : String(error)));
    }
  }, [enabled, ready]);

  useEffect(() => {
    if (!enabled) return;
    void check();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [enabled, check]);

  return { enabled, status, ready, checking, check, apply };
}
