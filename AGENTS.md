# wuAPI Agent Rules

## 项目定位

`E:\SoftWare\Project\wuAPI-worktree` 是 `wuAPI` 的标准 Git 工作目录，用于承接本地二改、同步上游、验证构建和准备发布。

目录职责固定如下：

- `E:\SoftWare\Project\wuAPI-worktree`：当前标准开发与发布目录
- `E:\SoftWare\Project\wuAPI`：历史本地二改目录，只作对照参考
- `E:\SoftWare\Project\API-Switch`：上游/参考仓库来源，不作为当前最终修改目录

涉及多个相似目录时，先确认目录职责、Git 状态和远端地址，再进行任何修改、同步或提交操作。

## 约束先行

进入新目录或新增一级功能目录前，先确认是否已有项目规范；没有则先补 `AGENTS.md`，再做代码、文档、同步、排障或重构。

规范文档只写长期有效规则，不写一次性事故记录和流水账。

## 沟通与判断

- 默认中文沟通，代码、命令、变量名使用英文。
- 结论先行，再给理由。
- 用户描述与代码、Git 历史、目录结构或运行结果冲突时，优先相信可验证证据，并直接指出冲突。
- 如果继续执行会建立在错误前提上，必须停下来纠正，不顺着错误前提推进。

## 红线

以下操作必须先得到用户明确确认：

- 删除文件、目录或 Git 历史
- 修改 `.env`、密钥、token、证书或私有配置
- 修改 CI/CD、部署或系统级配置
- 数据库 schema 变更或数据迁移
- `git push`、`git rebase`、`git reset --hard`、强制推送
- 安装新的全局依赖或修改系统环境
- 对外正式发布

## 技术栈

- Desktop: Tauri v2
- Frontend: React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI
- Backend: Rust, Axum, SQLite, `rusqlite`, `reqwest`
- Package manager: `corepack pnpm`
- Shell: 当前会话是 PowerShell 时，使用 PowerShell 兼容命令和路径写法

## 目录职责

- `src/`：前端应用代码
- `src/features/`：按功能组织的前端模块
- `src/pages/`：页面级视图
- `src/components/`：可复用组件，`src/components/ui/` 为基础 UI 组件
- `src/lib/`：前端工具、模型目录、API 封装、事件桥接
- `src/i18n/`：现有界面文案资源；当前项目默认以中文主线维护
- `src-tauri/src/`：Tauri/Rust 后端代码
- `src-tauri/src/commands/`：暴露给前端的 Tauri commands
- `src-tauri/src/database/`：数据库连接、schema、DAO
- `src-tauri/src/proxy/`：本地代理服务、路由、转发、熔断、认证
- `src-tauri/src/proxy/protocol/`：各类上游协议适配器
- `public/`：静态资源
- `scripts/`：项目脚本
- `docs/`：受版本控制的开发、同步、发布说明
- `models.json`：模型元数据目录
- `dist/`、`dist-web-admin/`、`node_modules/`、`src-tauri/target/`：构建或依赖产物，不手动编辑
- `release/`：本地版本化发布产物目录，可生成，可清理，不作为源码目录编辑
- `*.log`、`.agent_logs/`、`temp_run_logs/`、`!exe/`：日志与临时产物，除非用户明确要求，否则不迁移、不删除

## 外部更新同步流程

处理上游或外部项目更新时，先做只读审计：

1. 确认实际软件目录、本地 Git 仓库目录、远端仓库、分支、提交历史和工作区状态。
2. 判断是否同源仓库；不是同源时，不直接 merge、cherry-pick 或整目录覆盖。
3. 列出外部项目变化，区分协议变化、路由变化、UI 工作流变化和无关能力。
4. 列出本地二改变化，区分必须保留、可选迁移和不应迁移。
5. 动手前明确同步清单、目标文件和不迁移原因。

禁止盲目复制以下内容：

- `node_modules/`
- `dist/`
- `dist-web-admin/`
- `src-tauri/target/`
- `release/`
- `*.log`
- 数据库文件
- 旧目录中的过时架构或仅用于临时排障的文件

## 开发规则

- 优先沿用现有架构和命名，不做无关重构。
- 前端状态、组件和样式沿用当前 React + Radix + Tailwind 组织方式。
- 后端新增逻辑优先落在对应的 `commands/`、`database/`、`proxy/` 子模块，不把跨层逻辑堆进入口文件。
- 协议适配变更优先限定在 `src-tauri/src/proxy/protocol/` 及调用边界。
- 数据库字段、表结构和迁移属于红线，必须先确认。
- 用户关闭的模型、渠道、分组不能被系统自动重新启用，除非用户明确操作。
- API key、token、密码不写入代码、日志、文档示例或提交记录。

## 验证命令

常规验证：

```powershell
corepack pnpm typecheck
corepack pnpm build:renderer
corepack pnpm build
```

Rust 检查：

```powershell
Set-Location .\src-tauri
cargo check
```

开发运行：

```powershell
corepack pnpm dev
```

本地版本化发布：

```powershell
.\build.ps1
```

改动后必须主动运行与改动范围匹配的验证命令，不能只改不验。

## Git 规则

- 操作前先确认仓库路径，再看 `git status --short --branch`
- 允许工作区存在用户改动，不得擅自 revert 或覆盖无关文件
- 新分支默认使用 `codex/` 前缀
- 未经确认不执行 `git push`、`git rebase`、`git reset --hard`
- 提交前说明改动内容、验证结果和剩余风险

## 文档规则

- 面向用户的文档默认以中文为主，英文内容不再作为主维护目标
- README、GUIDE、CHANGELOG 只写对使用者和维护者有价值的信息
- `AGENTS.md` 只写长期规则，不写历史叙事
- 涉及开发流程、同步流程、发布流程的稳定说明写入 `docs/`
