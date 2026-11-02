This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- This existing project has a single `App.tsx` with internal page state, not Expo Router. Do not assume file-based routes or migrate navigation without an explicit task.
- If navigation complexity grows, propose Expo Router as a separate migration.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Thoughts-specific context

- Workspace root is `thoughts-mvp/`, mobile package is `apps/mobile/`, and API is `apps/api/`.
- Expo uses SDK 58 and React Native. Voice input is via `expo-speech-recognition` and requires a native build, not Expo Go.
- gluestack-ui v5 is the UI design library. Read the bundled `thoughts-mvp/.agents/skills/gluestack-ui-v5/SKILL.md` before modifying UI.
- Separate Notion direct-storage mode from optional SQLite API mode. Never commit user API tokens.
- EAS Update requires the user's Expo OAuth authorization, Expo project ID and an authenticated GitHub Actions secret. Do not claim activation before these are configured.

## Locally installed official Expo skills

- Before any Expo SDK or EAS task, select the relevant original skill under `thoughts-mvp/.agents/skills/<skill-name>/SKILL.md` (23 official skills are vendored).
- The current full skill inventory and upstream version are in `thoughts-mvp/.agents/skills/EXPO-SKILLS.md`.
- Preserve and consult the bundled `references/`, `scripts/`, and `agents/` files. These are copied from upstream, not stub templates.
- Expo skills are instructions, not an authenticated Expo MCP connection. EAS account actions still require OAuth / appropriate EAS credentials.
