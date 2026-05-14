# wuAPI Agent Rules

## 项目定位

`E:\SoftWare\Project\wuAPI-worktree` 是 `wuAPI` 的 Git 工作副本，用于在最新上游代码基础上承接本地二改、验证、提交和后续同步。

`E:\SoftWare\Project\wuAPI` 是旧的实际二改软件目录，只作为迁移本地修改的来源读取。除非用户明确要求，不在旧目录内继续开展新修改。

`E:\SoftWare\Project\API-Switch` 是本地 Git 仓库/上游参照来源，不是实际二改软件目录。不得把它当作最终修改目标。

涉及多个相似目录时，先确认目录职责、Git 状态和远端地址，再执行任何修改、同步或提交操作。

## 约束先行

进入新的工作目录或新增一级功能目录前，必须先确认是否已有项目级规范。没有规范时，先创建或补全 `AGENTS.md`，再开展代码、文档、同步、重构或排障任务。

已有规范时严格遵守。需要调整实践时，先改规范文档，再按新规范执行。规范文档只记录长期有效的边界、目录职责、命令、红线和协作流程，不记录一次性历史流水账。

## 沟通与判断

- 默认使用中文沟通，代码、命令、变量名使用英文。
- 结论先行，再给理由。
- 用户描述与代码、Git 历史、目录结构或运行结果冲突时，必须直接指出冲突，并优先相信可验证证据。
- 如果继续执行会建立在错误前提上，必须停止并反驳，不要顺着错误指示推进。
- 遇到模糊需求，先给最合理方案；只有无法安全推断时才提问。

## 红线

以下操作必须先得到用户明确确认：

- 删除文件、目录或 Git 历史。
- 修改 `.env`、密钥、token、证书、私有配置。
- 修改 CI/CD、发布、部署或系统级配置。
- 数据库 schema 变更或数据迁移。
- `git push`、`git rebase`、`git reset --hard`、强制推送。
- 安装新的全局依赖或修改系统环境。
- 公开发布，包括 npm publish、正式部署、对外发版。

## 技术栈

- 桌面框架：Tauri v2。
- 前端：React 19、TypeScript、Vite、Tailwind CSS v4、Radix UI、lucide-react。
- 后端：Rust、Axum、SQLite、rusqlite、reqwest。
- 包管理：`corepack pnpm`。
- 默认 shell：当前会话为 PowerShell 时，使用 PowerShell 兼容命令和路径写法。

## 目录职责

- `src/`：前端应用代码。
- `src/pages/`：页面级视图。
- `src/components/`：可复用组件；`src/components/ui/` 为基础 UI 组件。
- `src/lib/`：前端工具函数、模型目录、API 调用封装等。
- `src/i18n/`：中英文界面文案与国际化入口。
- `src-tauri/src/`：Tauri/Rust 后端代码。
- `src-tauri/src/commands/`：暴露给前端的 Tauri commands。
- `src-tauri/src/database/`：SQLite 连接、schema、DAO。
- `src-tauri/src/proxy/`：本地代理服务、路由、转发、熔断、认证。
- `src-tauri/src/proxy/protocol/`：OpenAI、Claude、Gemini、Azure、Custom 等协议适配器。
- `public/`：静态资源。
- `scripts/`：项目脚本。
- `models.json`：模型元数据目录。
- `dist/`、`node_modules/`、`src-tauri/target/`：构建或依赖产物，正常开发不手动编辑。
- `!exe/`、`temp_run_logs/`、`.agent_logs/`、`*.log`：运行、构建或调试产物。除非用户明确要求整理，否则不要迁移或删除。

新增目录前先明确职责、命名和清理规则。不要把临时脚本、日志、实验文件散落到根目录。

## 外部更新同步流程

处理上游或外部项目更新时，先做只读审计：

1. 确认实际软件目录、本地 Git 仓库目录、远端仓库、分支、提交历史和工作区状态。
2. 判断是否同源仓库；不是同源时禁止直接 merge、cherry-pick 或整目录覆盖。
3. 列出外部项目新增变化，区分通用功能、协议变化、调用约定变化和无关项目能力。
4. 列出本地二改变化，区分必须迁移、可选迁移和不应迁移。
5. 动手前给出迁移清单：同步项、不同步项、原因、目标文件。

迁移时禁止盲目复制以下内容：

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `!exe/`
- `temp_run_logs/`
- `.agent_logs/`
- `*.log`
- 旧版本中已被上游架构替换的模块，除非明确需要恢复对应行为。

只有当上游更新或旧二改影响 `wuAPI` 的 API 转发、模型分组、模型启用过滤、排序、请求头、Base URL、认证方式、协议兼容或用户界面工作流时，才考虑同步到本项目。

## 开发规则

- 优先遵循现有架构和命名，不做无关重构。
- 前端状态、组件和样式沿用当前 React + Radix + Tailwind 组织方式。
- 后端新增业务能力优先放在对应 `commands/`、`database/`、`proxy/` 子模块中，不把跨层逻辑堆到 `lib.rs`。
- 协议适配相关改动优先限定在 `src-tauri/src/proxy/protocol/` 和调用边界。
- 数据库字段、表结构和迁移属于红线，必须先确认。
- 用户关闭的模型、渠道、分组不能被系统自动重新启用，除非用户明确操作。
- API key、token、密码不得写入代码、日志、文档示例或提交。
- 日志只能记录排障必要信息，避免输出完整请求头、密钥、用户私有内容。

## 验证命令

常规前端验证：

```powershell
corepack pnpm typecheck
corepack pnpm build:renderer
```

完整桌面构建：

```powershell
corepack pnpm build
```

Rust 后端检查：

```powershell
Set-Location .\src-tauri
cargo check
```

开发运行：

```powershell
corepack pnpm dev
```

如果当前 PowerShell 找不到 Rust 工具链，可临时补充本机已知路径后再验证：

```powershell
$env:PATH = "E:\SoftWare\Project\Rust\cargo\bin;E:\SoftWare\Project\Rust\rustup\toolchains\stable-x86_64-pc-windows-msvc\bin;C:\Users\NerdWu\.cargo\bin;C:\Users\NerdWu\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin;" + $env:PATH
cargo --version
rustc --version
```

改动后必须主动运行与改动范围匹配的验证命令。不能只改不验。若验证失败，先定位根因，不得通过注释错误、跳过检查或临时绕过来制造通过。

## Git 规则

- 执行 Git 操作前，先确认仓库路径，再查看 `git status --short --branch`。
- 工作区可能已有用户改动，不能 revert、覆盖或格式化无关文件。
- 新分支默认使用 `codex/` 前缀。
- 未经确认不执行 `git push`、`git rebase`、`git reset --hard`。
- 提交前说明实际改动、验证结果和未处理风险。

## 文档规则

- 面向用户的文档默认中文优先。
- README、GUIDE、CHANGELOG 只写对使用者或维护者有价值的信息。
- `AGENTS.md` 只写长期规则，不写“某天做了某事”的历史记录。
- 同步外部项目或新增重要行为时，代码和文档要一起评估；但不要为了记录过程而膨胀文档。
