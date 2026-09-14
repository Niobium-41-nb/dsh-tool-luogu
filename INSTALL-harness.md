# 在你的 deepseek-harness 中安装 dsh-tool-luogu

本文件是针对**你这台机器/这个 harness 部署**的精确安装指南（只读文档，未改动任何代码树）。
所有操作都发生在**用户级 profile**（`<DSH_HOME>\profiles\web`）里，**不触碰**
`<HARNESS>` 官方 monorepo 的 `packages/*` 树。

---

## 0. 你的环境（本指南据此编写）

| 项 | 值 |
|---|---|
| 运行 GUI 的 harness | `<HARNESS>`（`@deepseek-ai/deepseek-harness` 0.1.2-alpha.5） |
| GUI 启动方式 | `<HARNESS>\start.bat` → 最终执行 `pnpm dsh web`（Web profile，端口 3080） |
| DSH 用户目录 `$DSH_HOME` | `<DSH_HOME>` |
| 该 GUI 实际使用的 **用户 profile** | `<DSH_HOME>\profiles\web` |
| profile 补丁文件（装载插件的入口） | `<DSH_HOME>\profiles\web\cordis.patch.yml` |
| profile 依赖清单 | `<DSH_HOME>\profiles\web\package.json` + `pnpm-workspace.yaml` |
| 用户设置文档（cookie 放这里） | `<DSH_HOME>\settings.yaml`（按 namespace 分节） |

插件源码 / 公开仓库：`https://github.com/Niobium-41-nb/dsh-tool-luogu`

---

## 1. 原理：dsh 插件是如何“装上”的

dsh 不是靠把源码硬塞进官方 `packages/` 来装插件，而是**运行时装配**：

1. 每个 profile 有一个 `cordis.patch.yml`，是一份“补丁覆盖层”，在 bundle 层之后套上去。
2. 在 patch 里用 `insert` 列出要装载的插件行，行的 `name` 必须是该 profile 的
   node_modules 里**能解析到的包名**（`@dsh-luogu/dsh-tool-luogu`）。
3. 所以插件要作为依赖安装进 **profile 自己的** node_modules，然后在 patch 里 insert。
4. 登录凭据走用户设置文档 `settings.yaml` 的 `luogu` 命名空间（或环境变量 `LUOGU_COOKIE`）。

`dsh-tool-luogu` 通过 `ctx.tools.register` 注册工具。base bundle 已提供 `tools` 服务，
因此只要把它作为一行插件 insert 进 profile，6 个 `luogu_*` 工具就会进入 agent 可用工具列表。

> 注意：官方仓库的 `tools` 行本身不限制工具白名单，schema 会自动进入系统提示。装完重载 profile
> 即可看到工具。

---

## 2. npm 发布（**当前不走这条路**，见 README「状态与诚实说明」）

本插件的 manifest 没有 `dsh` 字段，发到 npm 也只能手动 insert 挂载；因此当前决定是
**GitHub-only**（`.stage-npm/` 保留为"依赖已改写、随时可发"的现成 manifest）。
真要发布时，先补 `dsh.bundle.patch` 并删掉 profile 里手写的 insert，再照下面做。

需要你先在自己环境登录：

```bash
npm login          # 在你自己终端里完成
# 或 npm config set //registry.npmjs.org/:_authToken=<你的token>
```

登录成功后告诉我，我再执行发布（`npm publish --access public` 到 `@dsh-luogu` scope）。
在你登录并发布成功之前，第 3 步用“本地链接”方式即可让插件可装载。

---

## 3. 把插件装进你的 web profile

### 方式 A：发布到 npm 后（推荐，最干净）

在 profile 目录里把它加为依赖并链接进 profile 的 node_modules：

```powershell
Set-Location <DSH_HOME>\profiles\web
pnpm add @dsh-luogu/dsh-tool-luogu
```

然后在 `cordis.patch.yml` 末尾追加一行 insert：

```yaml
# 洛谷刷题工具插件（见 @dsh-luogu/dsh-tool-luogu）
- insert:
    - id: tool-luogu
      name: '@dsh-luogu/dsh-tool-luogu'
```

### 方式 B：尚未发布时，用本地路径链接

```powershell
Set-Location <DSH_HOME>\profiles\web
pnpm add file:E:\dsh-luogu   # 指向本仓库根（插件即仓库根）
```

再把上面那段 insert 加进 `cordis.patch.yml`。

> 若方式 B 因本插件 peer 依赖（`@deepseek-ai/dsh-tools` 等 `workspace:^`）无法解析而安装失败，
> 请改用**方式 A**（等 npm 发布后按已发布版本安装），或把本插件也放进官方仓库作为 workspace 包
> （不推荐，见第 6 节）。

---

## 4. 配置登录凭据（cookie）

在 `<DSH_HOME>\settings.yaml` 顶部加一个顶层节（与 `llm-deepseek:` 等平级，
**无缩进**），插件读取 `luogu` 命名空间：

```yaml
luogu:
  cookie: "__client_id=xxxxxxxx; _uid=12345678; uid=12345678; cliend_id=xxxxxxxx"
```

> cookie 获取：浏览器登录 https://www.luogu.com.cn 后，从任一请求的 Cookie 头复制。
> 失效后更新此节即可。**插件无登录/登出流程**，无注销功能。
>
> 也可用环境变量 `LUOGU_COOKIE` 兜底（secret 不落盘更安全）。设置里 `cookie` 优先级最高。

---

## 5. 重载 / 重启使生效

该 profile 的 patch 是 `live`（可热重载）的，但**新 npm 依赖**通常需要重启进程才进入
loader 的解析范围：

1. 若只是改 `cordis.patch.yml` / `settings.yaml`：多数场景保存即热重载；不确定就重启。
2. 新装依赖（方式 A/B 加了包）后建议重启整个 Web 服务：
   - 关闭当前 `start.bat` 的窗口（或 Ctrl+C），重新运行 `<HARNESS>\start.bat`。
   - 刷新浏览器 http://127.0.0.1:3080。

重启后在会话里让 agent 执行，例如 `luogu_problem_list { page: 1 }`、`luogu_problem { pid: "P1001" }`，
应能正常返回。

---

## 6. 为什么不建议把插件混进官方 monorepo

`<HARNESS>` 是 `@deepseek-ai/deepseek-harness` 官方仓库（remote 指向上游），有严格
的 first-party 包规范（约束脚本、README Model-Experience 格式、版本锁定、publint、完整 host
`tsc -b` 重建）。把一个第三方 `@dsh-luogu/*` 源码塞进 `packages/*` 作为 first-party 包：
- 大概率触发仓库门禁失败；且
- 即便构建成功也**不会自动让工具可用**——仍必须在 profile/运行时补丁里 insert 并重启。

因此正确姿势就是第 3 步的“用户 profile 运行时装配”，不碰官方代码树。这也是你在第 1 步选择
“只出安装文档，不碰代码树”的对应做法。

---

## 7. 验证清单

- [ ] npm 已 `npm login`（若选发布路线）
- [ ] `@dsh-luogu/dsh-tool-luogu` 出现在 `<DSH_HOME>\profiles\web\node_modules`
- [ ] `cordis.patch.yml` 含 `tool-luogu` 的 insert
- [ ] `settings.yaml` 含 `luogu.cookie`
- [ ] 重启 `start.bat` 后，会话中 `luogu_*` 工具可调用
