# DSH Luogu 工具插件 — 设计说明

交付形态：独立、可安装的 DSH(Cordis) 工具插件源码包，位于 `E:\dsh-luogu`。
功能对齐 vscode-luogu 的「刷题闭环」子集，去掉「注销账号」，登录改为「用户配置 cookie」。

## 与 vscode-luogu 的对齐与差异

| vscode-luogu 功能 | 本插件 | 说明 |
|---|---|---|
| 查看题目 | `luogu_problem` | 按 pid 查看题目详情（题面 Markdown 渲染、数据范围、样例） |
| 题库浏览/搜索 | `luogu_problem_list` | 洛谷题库分页浏览 + 关键词搜索 |
| 随机跳题（按难度/来源） | `luogu_problem_random` | 按难度与来源抽取随机题目 |
| 题目离线查看 | `luogu_problem` 的缓存层 | 把拉取的题目详情缓存在本机，弱网/离线可复用 |
| 提交代码 | `luogu_submit` | 提交一段代码到指定题目 |
| 查看自己评测 | `luogu_submission_list` | 拉取当前用户提交记录 |
| 查看最近一次评测 | `luogu_submission` | 按 submitId 查看单次评测结果（状态/得分/详情） |
| 登录账号 | 配置 `cookie` | 不实现账号密码登录；用户在配置/环境变量里放登录后的 Cookie |
| 注销账号 | ❌ 刻意移除 | 按需求不提供 |

其余（打卡、犇犇、题解、比赛、讨论、随机题解点赞踩）不在核心范围内；API 客户端与工具
注册抽象成可扩展结构，便于日后补足。

## 鉴权模型（用户配置，无注销）

插件不为洛谷账号提供登录/注销。工具只读取运行环境提供的认证凭据：

1. 插件配置 `settings` 命名空间 `luogu`：`cookie`(可选, secret) 等字段。
2. 环境变量回退：`LUOGU_COOKIE`（完整 Cookie 串）、`LUOGU_UID`/`LUOGU_CLIENT_ID` 等。
3. 未配置或凭据失效时，工具抛出带指引的错误，绝不引导登录网页。

把 cookie 写进本地用户设置文档，由 DSH settings 文件 provider 持久化（与
`web-search-deepseek` 用同一 `settings.installSection` 机制）。

## 工具集（模型可见 schema 概要）

见 src/index.ts 与 README 的 Tool 列表。

## 依赖洛谷未公开接口的风险

洛谷私有接口（`www.luogu.com.cn/...`）可能随时变动、可能要求特定请求头、可能封禁异常访问。
本插件将这些端点收敛到 `src/luogu/endpoints.ts` 一处，便于升级维护。
