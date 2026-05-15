# wuAPI 开发与发布说明

## 标准工作目录

- 当前标准开发目录：`E:\SoftWare\Project\wuAPI-worktree`
- `origin`：`https://github.com/NerdWu/wuAPI`
- `upstream`：`https://github.com/wang1970/API-Switch`
- 历史参考目录：`E:\SoftWare\Project\wuAPI`

不要继续在 `E:\SoftWare\Project\API-Switch` 或旧 `wuAPI` 目录里直接做功能开发。

## 日常开发流程

1. 开始编辑前先执行：

```powershell
git status --short --branch
```

2. 前端用户行为改动优先落在 `src/`，Rust 代理和数据库改动优先落在 `src-tauri/src/`。
3. 修改后至少验证：

```powershell
corepack pnpm typecheck
corepack pnpm build:renderer
corepack pnpm build
```

4. 未经确认，不执行 `git push`。

## 同步上游流程

1. 获取上游更新：

```powershell
git fetch --prune upstream
```

2. 先审计差异，再决定是否迁移。
3. 只迁移会影响 `wuAPI` 实际产品面的内容：
   - 代理行为
   - 协议兼容
   - API 池 / 分组路由
   - 设置与用户工作流

不要把旧目录中的构建产物、日志、数据库文件或过时架构直接拷贝进来。

## 本地发布构建

推荐命令：

```powershell
.\build.ps1
```

等价手动流程：

```powershell
corepack pnpm build:versioned
```

构建结果：

- 运行文件：`src-tauri\target\release\wuAPI.exe`
- 版本化发布副本：`release\wuAPI_<version>_<timestamp>.exe`

`src-tauri\target\release\api-switch.exe` 属于历史残留，不作为当前发布目标。

## 发布前检查

1. `git status` 干净，或只包含明确要发布的跟踪改动。
2. 版本号保持一致：
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
3. `corepack pnpm typecheck` 通过。
4. `corepack pnpm build` 通过。
5. 确认最终运行文件名是 `wuAPI.exe`。
6. 用当前本地设置和 API 池数据做一次基本冒烟验证。
