# wuAPI Development and Release Notes

## Standard Workspace

- Active development workspace: `E:\SoftWare\Project\wuAPI-worktree`
- `origin`: `https://github.com/NerdWu/wuAPI`
- `upstream`: `https://github.com/wang1970/API-Switch`
- Historical reference only: `E:\SoftWare\Project\wuAPI`

Do not continue feature work in `E:\SoftWare\Project\API-Switch` or the old `wuAPI` directory.

## Daily Development Flow

1. Run `git status --short --branch` in `wuAPI-worktree` before editing.
2. Keep user-facing behavior changes in `src/` and Rust proxy/database changes in `src-tauri/src/`.
3. Verify with:

```powershell
corepack pnpm typecheck
corepack pnpm build:renderer
corepack pnpm build
```

4. Use `git push origin <branch>` only after explicit confirmation.

## Upstream Sync Flow

1. Fetch upstream changes in `wuAPI-worktree`:

```powershell
git fetch --prune upstream
```

2. Audit upstream diffs before merging or porting behavior.
3. Port only confirmed changes that affect wuAPI's actual product surface:
   - proxy behavior
   - protocol compatibility
   - pool/group routing
   - settings and user workflows

Do not copy build artifacts, logs, databases, or obsolete architecture from older local directories.

## Local Release Build

Primary command:

```powershell
.\build.ps1
```

Equivalent manual flow:

```powershell
corepack pnpm build:versioned
```

This produces:

- runtime executable: `src-tauri\target\release\wuAPI.exe`
- versioned copy for handoff: `release\wuAPI_<version>_<timestamp>.exe`

`api-switch.exe` under `src-tauri\target\release\` is a legacy leftover and is not the release target.

## Release Checklist

1. `git status` is clean or only contains intentionally tracked release-related edits.
2. Version is aligned across:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
3. `corepack pnpm typecheck` passes.
4. `corepack pnpm build` passes.
5. Verify the executable name is `wuAPI.exe`.
6. Smoke-test the built app with the current settings and API pool data.
