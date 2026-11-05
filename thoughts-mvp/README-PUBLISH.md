# Выпуск Thoughts

Единственная постоянная ветка — **`master`**. Все автоматические сборки и публикации привязаны к ней. Рабочие ветки удаляются после объединения; постоянных `main` и `develop` нет.

## GitHub Actions

| Workflow | Результат |
| --- | --- |
| `thoughts-ci.yml` | TypeScript, lint, тесты API / мобильной логики, Expo web export |
| `build-thoughts-apk.yml` | Подписанный APK и native smoke в Android-эмуляторе |
| `publish-thoughts-eas-update.yml` | Обновление Android в Expo-канале `preview` |
| `thoughts-oauth-container.yml` | Проверенный OAuth-образ в GHCR |

Все workflows можно запустить вручную на `master` через Actions → Run workflow. OAuth-образ и OTA автоматически публикуются при изменении соответствующих путей; APK собирается на каждом push в `master`.

## APK и GitHub Release

1. Обнови `apps/mobile/app.json`: `version` и возрастающий `android.versionCode`. Обнови отображаемую версию в `src/SettingsScreen.tsx`.
2. Проверь изменения, объедини рабочую ветку в `master` и отправь её в GitHub.
3. Дождись успешных **Thoughts checks** и обеих jobs в **Build Thoughts Android APK**: `build-apk` и `android-smoke`.
4. Скачай артефакт **`thoughts-android-apk-ota-enabled`** из этого запуска. Внутри — `app-release.apk`.
5. Создай GitHub Release `vX.Y.Z`, укажи проверенный commit из `master`, приложи APK и опубликуй. Лучше подготовить draft заранее и публиковать после проверки APK. Если APK уже приложен, release-trigger не собирает его повторно.

APK содержит JS-бандл и не требует Metro. Он подписывается тестовым Android-ключом; для магазина нужен отдельный release keystore и соответствующая настройка CI. Ключ подписи нельзя менять без учёта обновления установленных приложений.

## Expo Update

Проект: `@tminwws-team/thoughts-ai-inbox`, канал: **`preview`**, текущий native runtime: **`0.3.1`**. Установленный APK должен поддерживать этот runtime и быть связан с тем же EAS-проектом.

Настройки GitHub → Settings → Secrets and variables → Actions:

| Тип | Имя | Значение |
| --- | --- | --- |
| Secret | `EXPO_TOKEN` | Expo access token с доступом к проекту |
| Variable | `EXPO_EAS_PROJECT_ID` | UUID проекта Expo |
| Variable | `NOTION_OAUTH_URL` | `https://notion-auth.shafranov.tech` |

Workflow синхронизирует публичный OAuth URL со средой EAS `preview`, затем публикует совместимый Android update. Пользователь проверяет и применяет обновление в **Настройки → Обновления**. Нативные плагины, разрешения и несовместимый runtime требуют нового APK; одной OTA недостаточно.

При настройке собственного Expo-проекта используй `npx eas-cli@latest login`, `init` и `update:configure` из `apps/mobile`, сохраняя динамический `app.config.js`. Секрет Expo хранится в GitHub Secrets, а не в `EXPO_PUBLIC_*`.

## OAuth-контейнер и VPS

Реестр: **`ghcr.io/tminww/thoughts-notion-oauth`**. Workflow из `master` проверяет OAuth, старт / остановку контейнера и публикует теги `sha-<commit>` и `latest`.

Публикация образа **не перезапускает VPS автоматически**. Для установки укажи проверенный SHA-тег или digest в `.env` отдельного Compose-проекта `/opt/thoughts-notion-oauth`, затем выполни:

```bash
docker compose config --quiet
docker compose pull oauth
docker compose up -d --wait oauth
curl --fail http://127.0.0.1:4010/health
```

Не трогай соседние Compose-проекты и сайты. Секрет Notion находится в `oauth.env`, необязательный исходящий прокси — в `proxy.env`; права файлов `600`. Для отката верни прежний digest и повтори `pull` / `up`.

Полная настройка домена, HTTPS, Nginx и OAuth: [docs/notion-oauth.md](docs/notion-oauth.md).
