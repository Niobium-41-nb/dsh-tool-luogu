---
description: "Luogu (洛谷) problem-solving tools for DeepSeek Harness agents: browse/search the problem set, read a problem with an offline cache, pick a random problem by source/difficulty, submit code, and inspect submissions. Login is user-configured (cookie), with deliberately no logout."
kind: "package-reference"
---

# @dsh-luogu/dsh-tool-luogu

在 DeepSeek Harness 中让 Agent 具备洛谷（Luogu）刷题能力的一个工具插件（模型可调用工具集）。功能对齐
[vscode-luogu](https://github.com/yltx/vscode-luogu)，但：

- **不包含「注销账号」**；
- **「登录账号」改为用户配置**——本插件不实现账号密码登录/登出，只读取你在配置或环境变量里放置的登录
  Cookie（`luogu` settings namespace 或 `LUOGU_COOKIE`）。

## Summary

`dsh-tool-luogu` 把 vscode-luogu 的「刷题闭环」以模型工具的形式暴露给 Agent：

| 工具 | 对应 vscode-luogu 功能 | 需登录? |
|---|---|---|
| `luogu_problem_list` | 题库浏览 / 搜索 | 否 |
| `luogu_problem` | 查看题目（含离线缓存） | 否 |
| `luogu_problem_random` | 按难度与来源随机跳题 | 否 |
| `luogu_submit` | 提交代码 | 是 |
| `luogu_record_list` | 查看自己测评 | 是 |
| `luogu_record` | 查看最近一次 / 单次评测 | 否(公开记录) |

## Table of Contents

- [安装与装配](#安装与装配)
- [配置登录凭据](#配置登录凭据)
- [Agent 工具](#agent-工具)
- [离线缓存](#离线缓存)
- [实现](#实现)
- [模型体验](#模型体验)
- [已知限制](#已知限制)

---

## 安装与装配

这是一个独立的 Cordis 工具插件源码包（导出 `name`/`inject`/`apply`/`Config`，**无 default 导出**）。
把它加入你使用的 harness（DeepSeek Harness）作为 workspace 包：

```bash
# 把本目录作为包放入 harness 仓库（group 目录随意，例如 luogu）
cp -r <本目录> <HARNESS>\packages\<group>\dsh-tool-luogu

# 在 harness 仓库安装并构建（仓库内包的标准流程）
pnpm install
pnpm run constraints && pnpm run typecheck && pnpm run build
```

> 装配进具体 profile / cordis.yml 的方式取决于你所用 harness 发行版如何挂载包。安装后，上述 6 个
> `luogu_*` 工具会在模型的可用工具列表中出现。

## 配置登录凭据

**只由用户配置，插件不做登录网页引导，也没有注销。** 解析顺序（优先级从高到低）：

1. `luogu` settings 命名空间（DSH `settings.installSection` 机制，与 web-search-deepseek 相同），在用户设置文档中：

```yaml
luogu:
  cookie: "__client_id=...; _uid=123456; uid=123456; cliend_id=..."
```

2. 插件组合 `Config` 的字面量 `cookie`。
3. `cookieEnv` 指定的环境变量（默认 `LUOGU_COOKIE`），避免把秘密写进配置文档：

```bash
export LUOGU_COOKIE="__client_id=...; _uid=123456"
```

获取方式：浏览器登录洛谷后，从任意请求的 Cookie 头复制该串。Cookie 会失效；失效时在配置里更新即可，
插件不做自动重登。

可选的额外偏好字段：`origin`（站点源，默认 `https://www.luogu.com.cn`）、`userAgent`、`uid`、
`clientId`（当只提供 `uid`+`clientId` 时按 `_uid`/`__client_id` 拼 Cookie）、`cacheEnabled`、
`cacheDir`。详见 `src/index.ts` 的 `Config`。

## Agent 工具

- `luogu_problem_list { page?, keyword?, type?, difficulty?, tag?, orderBy?, order? }`
  → `{ count, perPage, problems: [{ pid, type, name, difficulty?, difficultyName, tags, totalSubmit, totalAccepted }] }`
- `luogu_problem { pid, refresh? }` → 题目详情（题面/输入输出格式/样例/限制/难度/接受语言），
  `fromCache` 标记是否命中离线缓存。
- `luogu_problem_random { type?, difficulty?, keyword? }` → 从满足条件的池中均匀抽样一个题。
- `luogu_submit { pid, code, lang, enableO2? }` → `{ rid }`。`lang` 常见 id：
  `7` Python3，`12` C++17，`28` C++14(GCC9)，`27` C++20，`25` PyPy3。
- `luogu_record_list { page? }` → 当前用户提交记录列表。
- `luogu_record { rid }` → 单次评测结果（评测状态/得分/时间/内存/编译信息等）。

未配置登录凭据而调用需要登录的工具时，返回带指引的错误；公共浏览/读题可匿名进行。

## 离线缓存

`luogu_problem` 成功后把题目详情写入本机缓存目录（默认 OS 用户缓存目录下的 `dsh-luogu`，可用
`luogu.cacheDir` 指定）。再次读取（`refresh` 缺省为 `false`）时命中缓存直接返回，弱网/离线也能读题。

## 实现

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 插件入口：`Config` schema、settings namespace、注册 6 个工具 |
| `src/luogu/constants.ts` | 端点、语言 id、评测状态码、难度表（单一维护点） |
| `src/luogu/http.ts` | fetch 客户端：cookie、CSRF、双响应格式（legacy/Lentille）解析 |
| `src/luogu/auth.ts` | 凭据解析：settings/config/env cookie，无注销 |
| `src/luogu/api.ts` | 类型化洛谷操作 + 多容器容错解码 |
| `src/luogu/cache.ts` | 题目离线文件缓存 |
| `src/luogu-types.ts` | 领域类型 |

洛谷接口为私有接口、可能变动；端点与状态码集中在 `src/luogu/constants.ts`，便于随上游调整。

## 模型体验

### 请求上下文与条件

#### 模型所见

模型通过 6 个 `luogu_*` 工具获得能力；各工具的输入 schema 与返回值见上文。未配置 cookie 时，
读题/题库/随机可用；提交与看自己评测会收到「需要配置 luogu cookie」的错误指引。

#### Token 影响

固定 schema 成本；题库列表与题目详情返回值随数据规模增长。

#### KV Cache 影响

定义与可见性不变时前缀稳定；插件重装或作用域限制可能失效。

## 已知限制

- **依赖洛谷未公开私有接口**——字段与端点可能随上游变化，代码集中在 `constants.ts`/`api.ts`。
- **登录凭据是用户配置的 cookie**——有时效，失效需用户更新；无自动登录、无注销。
- 洛谷对非浏览器客户端可能有限流/风控；请以合理频率使用。
- 需在具备 `@deepseek-ai/*` 依赖的 harness 环境内构建。
