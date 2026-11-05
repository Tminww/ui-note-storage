# Thoughts — разработка

Мобильное приложение Android / iOS / Web на Expo SDK 58, React Native и gluestack-ui v5. Описание возможностей и установка APK — в [основном README](../README.md).

## Запуск интерфейса

Из корня репозитория:

```bash
cd thoughts-mvp
npm ci
npm run web
```

Expo покажет адрес веб-приложения. Для локального ввода и просмотра заметок API не нужен. ИИ на телефоне можно подключить ключом OpenRouter в настройках. Веб-версия использует настроенный Thoughts API для обработки.

## Необязательный API

```bash
cp apps/api/.env.example apps/api/.env
npm run api
```

API доступен на `http://localhost:4000/api/health`. В `.env` укажи нужные ключи провайдеров; SQLite создаётся в `apps/api/data/thoughts.sqlite`. В настройках приложения выбери адрес API. Для Android Emulator адрес компьютера — `http://10.0.2.2:4000`; для физического телефона используй адрес компьютера в локальной сети и `HOST=0.0.0.0` в настройках API.

API рассчитан на одного пользователя в доверенной сети и не содержит авторизации для публичного хостинга. Отдельный OAuth-сервис Notion можно публиковать через HTTPS независимо от API: [инструкция](docs/notion-oauth.md).

## Нативное приложение

Диктовке нужен нативный build с `expo-speech-recognition`.

```bash
cd apps/mobile
npx expo run:android
```

Для iOS на Mac с Xcode: `npx expo run:ios`. Android APK также собирает [GitHub Actions](https://github.com/Tminww/ui-note-storage/actions/workflows/build-thoughts-apk.yml). Обычный Expo Go не содержит нужного голосового модуля.

## Переменные окружения

| Переменная | Где используется | Назначение |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | `apps/api/.env` | Генерация и классификация через сервер |
| `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | `apps/api/.env` | Дополнительные провайдеры |
| `CUSTOM_AI_BASE_URL`, `CUSTOM_AI_API_KEY` | `apps/api/.env` | Совместимый Chat Completions API |
| `EXPO_PUBLIC_API_URL` | `apps/mobile/.env` | Необязательный исходный адрес API |
| `EXPO_PUBLIC_NOTION_OAUTH_URL` | `apps/mobile/.env` | Публичный адрес OAuth-сервиса |
| `EXPO_EAS_PROJECT_ID` | Сборка | Проект Expo Update |

Примеры находятся в `apps/api/.env.example` и `apps/mobile/.env.example`. `EXPO_PUBLIC_*` встраиваются в приложение: секретам там не место. На телефоне пользовательские ключи сохраняются через SecureStore.

## Проверки

Из `thoughts-mvp/`:

```bash
npm run check:mobile
npm run lint
npm test
cd apps/mobile
npx expo export --platform web --output-dir dist-web
```

Тесты проверяют SQLite / HTTP API, ответы ИИ, локальную очередь, классификацию, конфликты Notion, потерянные ответы синхронизации, списки и жизненный цикл диктовки. В GitHub Actions APK дополнительно запускается в Android-эмуляторе с тестовым речевым сервисом. Реальные провайдеры, системный распознаватель конкретного телефона и iOS требуют проверки на устройстве.

## Основные файлы

| Файл | Назначение |
| --- | --- |
| `apps/mobile/App.tsx` | Экраны и навигация приложения |
| `apps/mobile/src/localCore.ts` | Локальные данные, миграция и очередь |
| `apps/mobile/src/localService.ts` | Координация обработки и синхронизации |
| `apps/mobile/src/notionStorage.ts` | Прямой доступ к Notion, страницы проектов и заметки-toggle |
| `apps/mobile/src/notionOAuth.ts` | Авторизация и обновление токенов |
| `apps/mobile/src/voiceSession.ts` | Состояния диктовки и остановка по тишине |
| `apps/mobile/src/onDeviceAI.ts` | Вызовы ИИ с пользовательским ключом |
| `shared/ai-response.mjs` | Нормализация ответов генератора |
| `apps/api/src/notionOAuthServer.mjs` | Отдельный OAuth-сервис |

Навигация пока реализована в `App.tsx`, без Expo Router. Общие UI-компоненты — `apps/mobile/components/ui/`, семантические цвета — `apps/mobile/global.css`. Правила разработки: [AGENTS.md](AGENTS.md) и [инструкции мобильного приложения](apps/mobile/AGENTS.md).

## Данные и Notion

Исходный текст сохраняется на устройстве до вызова ИИ. Новые заметки в Notion записываются как сворачиваемые блоки с заголовками; старые страницы заметок продолжают читаться и обновляться. Общая страница задаётся в настройках, отдельная страница проекта — при его редактировании.

Если пользователь добавил собственные блоки внутрь заметки в Notion, приложение приостанавливает её перенос между страницами: перенеси блок в самом Notion, чтобы сохранить дополнения. Одновременные правки на устройстве и в Notion разрешаются через выбор версии в приложении.

Голос обрабатывает системный сервис. `recordingOptions.persist=false`: приложение хранит текст, аудио на Thoughts API не отправляется. Для распознавания без облака нужен установленный языковой пакет и переключатель «Только на устройстве».

[Подробнее о хранении](docs/local-first.md) · [OAuth / Docker / Nginx](docs/notion-oauth.md) · [Выпуск APK и OTA](README-PUBLISH.md)
