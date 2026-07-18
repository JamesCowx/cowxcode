# CowxCode

> The open source coding agent. Black, grey & red. Built for developers who like their tools sharp.

CowxCode is a provider-agnostic AI coding agent. It runs locally on your machine, talks to
any LLM provider (OpenAI, Anthropic, Google, Ollama, and more), and helps you write, edit
and understand code through a polished desktop app for Windows.

This is an independent community project inspired by the open source `opencode` project.
It is **not** affiliated with, endorsed by, or built by the OpenCode team.

## Packages

| Package | Description |
| ------- | ----------- |
| `packages/core` | The CowxCode agent engine: provider-agnostic chat, tools, sessions |
| `packages/desktop` | Windows desktop app built with Electron + custom black/grey/red UI |
| `packages/web` | Marketing & documentation website (static, deploy anywhere) |

## Quick start

```bash
npm install
npm run build
npm run start:desktop
```

## License

MIT
