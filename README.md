# dsh-tool-luogu — DSH（DeepSeek Harness / Cordis）洛谷刷题工具插件

[![license](https://img.shields.io/github/license/Niobium-41-nb/dsh-tool-luogu)](https://github.com/Niobium-41-nb/dsh-tool-luogu/blob/master/LICENSE)

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

- **GitHub**：源码在公开仓库（**没有 CI**：它的 `workspace:^` 依赖只有在 harness 仓库内部才装得上，见下文）
  [`github.com/Niobium-41-nb/dsh-tool-luogu`](https://github.com/Niobium-41-nb/dsh-tool-luogu)
  （2026-09-14 由私有转为公开，MIT）。
- **npm**：**不发布到 npm**，有意如此，但理由已经换了：
  - 旧理由（已作废）：源码用 `workspace:^` 指向 harness 内部包，公开 registry 上没有这些版本。
    **这条已经解决** —— 本仓库的 `.stage-npm/` 就是把依赖改写成真实 semver 后的可发布 manifest；
    已在本机验证：在干净的临时目录里按公开 registry 的版本装齐 peer 依赖后，
    `import('…/.stage-npm/lib/index.js')` 正常导出 `name/inject/Config/apply`（`inject: ['tools']`）。
  - **现存的真实理由**：manifest **没有 `dsh` 字段**，所以 `dsh plugin add` 不会自动挂载它 ——
    装到 npm 上，使用者拿到的会是一个"没有任何东西会加载"的包，必须自己照
    [`INSTALL-harness.md`](INSTALL-harness.md) 往 profile 的 `cordis.patch.yml` 里手写 insert。
    真要发 npm，应该先补 `dsh.bundle.patch`（照同工作区的 `dsh-ping`/`dsh-restart` 的样子），
    **并且同时把 profile 里手写的那行 insert 删掉** —— 否则同一个行 id 会被挂载两次，可能直接
    让整棵树 fatal。本机那个 web profile 正装着它，所以这件事要单独一轮做，别顺手改。
  - 另外 `@dsh-luogu` 这个 scope 在 npm 上没有对应的账号/组织，只能改用账号 scope 别名
    （`@vanadium-23/dsh-tool-luogu`）；而 `npm publish` **只认 manifest 里的 `name`**。
    （最后一步永远需要人在真终端里过一次浏览器 2FA，见工作区 `../AGENTS.md` 硬规则 22。）

> ⚠️ 洛谷接口为其私有接口，可能变动/有限流；端点与字段集中到 `constants.ts`/`api.ts`，便于随上游维护。
> 请以合理频率使用。
