# Expo & EAS Skills installed for Thoughts

Source: https://github.com/expo/skills/tree/main/plugins/expo/skills
Upstream tree SHA at installation: `a9e5bd3fa00b4e61f632e43f85da73aee1942582`
Installed: 23 official skills with all accompanying references, agents and scripts, copied to `thoughts-mvp/.agents/skills/<name>/`.

### Skills

- [eas-app-stores](./eas-app-stores/SKILL.md)
- [eas-hosting](./eas-hosting/SKILL.md)
- [eas-observe](./eas-observe/SKILL.md)
- [eas-simulator](./eas-simulator/SKILL.md)
- [eas-update](./eas-update/SKILL.md)
- [eas-update-insights](./eas-update-insights/SKILL.md)
- [eas-workflows](./eas-workflows/SKILL.md)
- [expo-animation](./expo-animation/SKILL.md)
- [expo-app-clip](./expo-app-clip/SKILL.md)
- [expo-brownfield](./expo-brownfield/SKILL.md)
- [expo-data-fetching](./expo-data-fetching/SKILL.md)
- [expo-design-system](./expo-design-system/SKILL.md)
- [expo-dev-client](./expo-dev-client/SKILL.md)
- [expo-dom](./expo-dom/SKILL.md)
- [expo-examples](./expo-examples/SKILL.md)
- [expo-module](./expo-module/SKILL.md)
- [expo-native-ui](./expo-native-ui/SKILL.md)
- [expo-overview](./expo-overview/SKILL.md)
- [expo-project-structure](./expo-project-structure/SKILL.md)
- [expo-router](./expo-router/SKILL.md)
- [expo-ui](./expo-ui/SKILL.md)
- [expo-upgrade](./expo-upgrade/SKILL.md)
- [expo-web-to-native](./expo-web-to-native/SKILL.md)

All copied skill files are stored in this repository for local agent discovery. To update them with network access, run from the project's root:
```bash
npx skills add expo/skills --yes
```

**Notes:** The public docs page currently includes `expo-tailwind-setup` and `expo-skill-feedback`, but they were removed upstream (their removal is recorded in the source repository history). We intentionally do not reinstate obsolete skills. `expo-animation`, `expo-design-system`, `expo-overview`, and `eas-update` are included because they are present in current upstream.

This is a **project-local skill installation**, not an installation into ChatGPT's global runtime or a connected Expo account. Expo MCP separately requires `https://mcp.expo.dev/mcp` and OAuth sign-in.
