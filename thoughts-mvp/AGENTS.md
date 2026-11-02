# Thoughts — AI agent guidance

This monorepo's Android/iOS/web app lives in `apps/mobile`; backend in `apps/api`.

## Skills installed in this repository

- Official Expo & EAS: `.agents/skills/expo-*/SKILL.md` and `.agents/skills/eas-*/SKILL.md`
- Gluestack UI v5: `.agents/skills/gluestack-ui-v5/SKILL.md`

Always read the applicable SKILL.md and its reference files before implementing Expo/EAS/UI tasks. Avoid assuming that a skill installation grants network connectivity, Expo OAuth authorization, or GitHub Actions secrets permissions.

The mobile app does **not** currently use Expo Router; do not refactor navigation just because a routing skill is available. Voice recording requires a native development build. Preserve Android native integration and Notion's local token storage.

For complete project-level rules see `apps/mobile/AGENTS.md`.
For official skill provenance and the current inventory see `.agents/skills/EXPO-SKILLS.md`.
