# wuAPI

> 个人 AI API 管理与转发中心

通过一个本地统一入口管理多个 AI API 渠道，支持自动故障转移、分组路由和绿色便携使用。

---

## 核心功能

| 功能 | 说明 |
|---|---|
| 多渠道统一转发 | 通过一个本地地址接入多个上游 AI 服务 |
| 自动故障转移 | 失败模型自动冷却，继续尝试下一个可用条目 |
| API 池分组 | 支持 `auto`、分组名和模型名三类路由入口 |
| 一键测速 | 批量测试条目延迟并记录最近结果 |
| 熔断机制 | 失败冷却、成功恢复、不可恢复状态自动禁用 |
| 桌面便携版 | 作为 Tauri 本地桌面应用运行，数据跟随 exe 存储 |
| Web 管理界面 | 支持当前架构下的浏览器管理入口 |

---

## 快速开始

1. 从 [Releases](https://github.com/NerdWu/wuAPI/releases) 下载 Windows 版本。
2. 运行 `wuAPI.exe`，数据库会自动创建在 exe 同目录下。
3. 在 **渠道管理** 中添加上游渠道并拉取模型。
4. 在 **API 管理** 中启用需要参与路由的条目。
5. 将客户端 API 地址指向 `http://127.0.0.1:9090/v1`。

### 客户端配置

```text
API Base URL: http://127.0.0.1:9090/v1
API Key: 任意（未开启访问密钥校验时）
Model: auto
```

### 路由规则

| 请求模型 | 行为 |
|---|---|
| `auto` | 从已启用且未冷却的 AUTO 组条目中按优先级选择 |
| `<分组名>` | 先尝试精确分组匹配，再按当前路由规则回退 |
| `<模型名>` | 先尝试模型名或显示名精确匹配，再执行回退 |

---

## 支持的上游类型

| 类型 | 认证方式 | 说明 |
|---|---|---|
| OpenAI | Bearer Token | 标准 OpenAI 兼容协议 |
| Anthropic | `x-api-key` | Claude 协议适配 |
| Google Gemini | Query Parameter | Gemini 协议适配 |
| Azure OpenAI | `api-key` Header | 基于 deployment 的路由 |
| Custom | Bearer Token | 任意 OpenAI-compatible 中转或第三方服务 |

---

## 容错与恢复

- 上游失败会触发冷却，并临时退出路由。
- 请求成功后会自动清除冷却状态。
- `enabled` 只由用户控制，系统不会自动重新启用已关闭条目。
- 默认冷却恢复时间为 `300` 秒，可在 **设置 -> 熔断** 中调整。

---

## 构建产物

```text
wuAPI.exe               # 主程序
api-switch.db           # 运行时生成的本地数据库
release\wuAPI_<version>_<timestamp>.exe
```

Tauri 实际构建出的运行文件位于：

```text
src-tauri\target\release\wuAPI.exe
```

同目录下的 `api-switch.exe` 属于历史残留，不是当前发布目标。

---

## 标准开发目录

当前维护中的 Git 工作目录是：

```text
E:\SoftWare\Project\wuAPI-worktree
```

相关目录职责：

- `E:\SoftWare\Project\wuAPI-worktree`：当前标准开发与发布目录
- `E:\SoftWare\Project\wuAPI`：旧二改目录，仅作历史参考
- `E:\SoftWare\Project\API-Switch`：上游/参考仓库来源

### 本地构建命令

```powershell
corepack pnpm typecheck
corepack pnpm build:renderer
corepack pnpm build
.\build.ps1
```

`.\build.ps1` 会执行本地版本化打包，并把带时间戳的 exe 复制到 `release/`。

开发与发布流程说明见 [docs/DEVELOPMENT_RELEASE.md](docs/DEVELOPMENT_RELEASE.md)。

---

## 使用指南

- [中文指南](GUIDE_CN.md)

---

## 许可证

[MIT License](LICENSE)
