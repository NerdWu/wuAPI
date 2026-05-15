# wuAPI

> Personal AI API management and forwarding hub

Manage multiple AI API providers through a single local endpoint with automatic failover, group-based routing, and a portable desktop workflow.

---

## Features

| Feature | Description |
|---|---|
| Multi-provider routing | Use one endpoint for multiple upstream AI providers. |
| Auto failover | Skip cooled-down entries and continue routing to the next available provider. |
| API pool groups | Route by `auto`, exact group name, or exact model name. |
| One-click latency test | Test entries in sequence and record the latest response result. |
| Circuit breaker | Cool down failed entries, auto-recover on success, and auto-disable unrecoverable statuses. |
| Portable desktop app | Runs as a local Tauri app with data stored next to the executable. |
| Web admin | Includes a browser-based admin surface in current upstream architecture. |
| Bilingual UI | Chinese and English guides and interface text are both available. |

---

## Quick Start

1. Download a Windows build from [Releases](https://github.com/NerdWu/wuAPI/releases).
2. Run `wuAPI.exe`. The local database is created automatically next to the executable.
3. In **Channel Management**, add providers and fetch models.
4. In **API Management**, enable the entries you want to route through.
5. Point your client to `http://127.0.0.1:9090/v1`.

### Client Setup

```text
API Base URL: http://127.0.0.1:9090/v1
API Key: anything (unless access key enforcement is enabled)
Model: auto
```

### Routing Rules

| Request model | Behavior |
|---|---|
| `auto` | Select from enabled, non-cooled AUTO-group entries by priority. |
| `<group-name>` | Try exact group match first, then fall back according to current routing rules. |
| `<model-name>` | Try exact model/display name matching before fallback. |

---

## Supported Providers

| Type | Auth method | Notes |
|---|---|---|
| OpenAI | Bearer token | Standard OpenAI-compatible flow |
| Anthropic | `x-api-key` | Claude protocol adaptation |
| Google Gemini | Query parameter | Gemini adaptation |
| Azure OpenAI | `api-key` header | Deployment-based routing |
| Custom | Bearer token | OpenAI-compatible relay or third-party endpoint |

---

## Fault Tolerance

- Upstream failures trigger cooldown and temporary routing exclusion.
- Successful requests clear cooldown automatically.
- `enabled` stays user-controlled; the system does not silently re-enable disabled entries.
- The default cooldown recovery time is `300` seconds and can be adjusted in **Settings -> Circuit Breaker**.

---

## Build Output

```text
wuAPI.exe               # Main executable
api-switch.db           # Local database created at runtime
release\wuAPI_<version>_<timestamp>.exe
```

The runtime executable built by Tauri is:

```text
src-tauri\target\release\wuAPI.exe
```

`api-switch.exe` in the same release directory is a legacy leftover and is not the current release target.

---

## Development Workspace

The maintained Git workspace is:

```text
E:\SoftWare\Project\wuAPI-worktree
```

Related directories:

- `E:\SoftWare\Project\wuAPI-worktree`: active development and release workspace
- `E:\SoftWare\Project\wuAPI`: historical local source reference
- `E:\SoftWare\Project\API-Switch`: upstream/reference repository source

### Local Build Commands

```powershell
corepack pnpm typecheck
corepack pnpm build:renderer
corepack pnpm build
.\build.ps1
```

`.\build.ps1` runs the versioned local release flow and copies a timestamped executable into `release/`.

Detailed development and release notes live in [docs/DEVELOPMENT_RELEASE.md](docs/DEVELOPMENT_RELEASE.md).

---

## Guides

- [English Guide](GUIDE.md)
- [中文指南](GUIDE_CN.md)

---

## License

[MIT License](LICENSE)
