# dsh-tool-luogu — DSH（DeepSeek Harness / Cordis）洛谷刷题工具插件

让 DeepSeek Harness 的 Agent 具备在 [洛谷 Luogu](https://www.luogu.com.cn) 刷题的能力，以**模型可调用工具**
的形式暴露给 Agent。功能对齐 [vscode-luogu（github.com/yltx/vscode-luogu）](https://github.com/yltx/vscode-luogu)
的核心刷题闭环，但按你的要求做了两处刻意差异：

- **不包含「注销账号」** —— 无登录/登出流程，也没有任何账号生命周期。
- **「登录账号」改为用户配置** —— 插件只读取你在配置（`luogu` settings namespace）或环境变量
  （`LUOGU_COOKIE`）中放置的登录 Cookie；从不引导登录、从不注销。
- 仅提供 **Agent 工具集**，不含 UI。

## Agent 工具（6 个）

| 工具 | 对应 vscode-luogu 功能 | 需登录 |
|---|---|---|
| `luogu_problem_list` | 题库浏览 / 搜索 | 否 |
| `luogu_problem` | 查看题目（含离线缓存） | 否 |
| `luogu_problem_random` | 按难度 / 来源随机跳题 | 否 |
| `luogu_submit` | 提交代码 | 是 |
| `luogu_record_list` | 查看自己测评 | 是 |
| `luogu_record` | 查看最近 / 单次评测 | 否(公开记录) |

## 仓库结构（插件即仓库根）

```
├─ package.json / tsconfig.json / tsdown.config.ts   包配置（drop-in 到 harness 的 workspace 包）
├─ src/index.ts           插件入口（Config + settings namespace + 注册工具；无 default 导出）
├─ src/luogu-types.ts     领域类型
├─ src/luogu/constants.ts 洛谷端点 / 语言 / 评测状态 / 难度（单一维护点）
├─ src/luogu/http.ts      fetch + cookie + CSRF + 双响应格式(legacy/Lentille)解析
├─ src/luogu/auth.ts      凭据解析（settings/config/env cookie；无注销）
├─ src/luogu/api.ts       类型化洛谷操作 + 多层容器容错解码
├─ src/luogu/cache.ts     题目离线文件缓存
├─ config.example.yml     配置示例
├─ DESIGN.md              设计说明（对齐差异、鉴权模型、接口风险）
├─ INSTALL-harness.md     面向你这台机器/这套部署的精确安装指南
└─ README.md / README-plugin.md
```

## 如何安装到 deepseek-harness

**推荐：用户级 profile 运行时装配，不触碰官方 monorepo `packages/*` 树。**
详细、面向你实际环境的步骤见 **[`INSTALL-harness.md`](INSTALL-harness.md)**。要点：

1. 把插件装进你的 web profile 的 node_modules（`<DSH_HOME>\profiles\web` 下 `pnpm add file:<本仓库>` 或发布后的包）；
2. 在该 profile 的 `cordis.patch.yml` 末尾 `insert` 一行 `tool-luogu`；
3. 在 `<DSH_HOME>\settings.yaml` 加顶层 `luogu.cookie`；
4. 重启 `start.bat` → 刷新 http://127.0.0.1:3080。

> 若要以官方仓库标准流程装配：把本目录复制进 `packages/<group>/dsh-tool-luogu` 后
> `pnpm install && pnpm run constraints && pnpm run typecheck && pnpm run build`。

## 状态与诚实说明

- **GitHub**：源码已推送至私有仓库
  [`github.com/Niobium-41-nb/dsh-tool-luogu`](https://github.com/Niobium-41-nb/dsh-tool-luogu)。
- **npm**：按用户决定**不发布到 npm**。原因：本插件是 harness 内部型 workspace 插件，代码按
  harness 的 `@deepseek-ai/*` API（`0.1.2-alpha.5`）编写；公开 registry 仅提供这些依赖的
  `0.0.1-rc.1`，类型面不同（如缺少 `settings.installSection`），独立发布将无法通过 typecheck，
  会交付损坏代码。故以 GitHub 源码 + 安装文档收尾。
- **类型健全性**：源码已通过基于 harness `exactOptionalPropertyTypes`/`noUnusedLocals` 的
  语义 typecheck 修正（去除了重复函数、错误导入、null 收窄、可选字段等 genuine bug）。但**未在
  harness 内实跑 `pnpm run typecheck/build`**（你选择了“只出文档、不碰代码树”）；首次真正装配时
  应以仓库标准流程复验。

> ⚠️ 洛谷接口为其私有接口，可能变动/有限流；端点与字段集中到 `constants.ts`/`api.ts`，便于随上游维护。
> 请以合理频率使用。
