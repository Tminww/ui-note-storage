# Expo AI agent integration for Thoughts

**Expo MCP (official):** https://mcp.expo.dev/mcp (Streamable HTTP, OAuth sign-in).

These repo files prepare the project for AI coding agents; installing a plugin in an agent's own environment still requires user action and an Expo OAuth login.

## Codex (recommended)
```bash
codex plugin add expo@openai-curated
codex mcp login expo
```

Alternative without the plugin:
```bash
codex mcp add expo --url https://mcp.expo.dev/mcp
codex mcp login expo
```

## Claude Code
```bash
claude plugin install expo@claude-plugins-official
```
Then run `/mcp` inside Claude Code, select Expo, and complete OAuth in the browser. `.claude/settings.json` enables this plugin for project contributors once installed locally.

## Cursor or other agents
Add an HTTP / Streamable HTTP MCP server pointing at `https://mcp.expo.dev/mcp`, authenticate with Expo OAuth. Official skills for compatible agents:
```bash
npx skills add expo/skills
```

## EAS updates
Do not paste `EXPO_TOKEN` into code or chat. Expo project setup and GitHub Actions secret creation require authorized account access. The preview EAS workflow is at repository root `.github/workflows/publish-thoughts-eas-update.yml`.

References: https://docs.expo.dev/mcp/ , https://docs.expo.dev/agents/ , https://docs.expo.dev/skills/
