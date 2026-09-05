# DSH Luogu — 交付物

本仓库交付一个 **deepseek-harness（Cordis）工具插件源码包**：让 DeepSeek Harness 的 Agent 具备在
[洛谷 Luogu](https://www.luogu.com.cn) 刷题的能力。功能对齐
[vscode-luogu（github.com/yltx/vscode-luogu）](https://github.com/yltx/vscode-luogu) 的核心刷题闭环，
但按你的要求：

- **不含「注销账号」** —— 无登录/登出，也没有任何账号生命周期。
- **「登录账号」改为用户配置** —— 插件只读取你在配置（`luogu` settings namespace）或环境变量
  （`LUOGU_COOKIE`）中放置的登录 Cookie；从不引导登录、从不注销。
- 仅提供 **Agent 模型可调用工具**（工具集），不包含 UI。

## 内容

```
E:\dsh-luogu
├─ README.md                    本文件
├─ DESIGN.md                    设计说明（与 vscode-luogu 对齐差异、鉴权模型、接口风险）
└─ packages/luogu/dsh-tool-luogu   主交付：Cordis 工具插件源码包
   ├─ package.json / tsconfig.json / tsdown.config.ts
   ├─ src/index.ts              插件入口（Config + settings namespace + 注册工具）
   ├─ src/luogu-types.ts        领域类型
   ├─ src/luogu/constants.ts    洛谷端点/语言/评测状态/难度
   ├─ src/luogu/http.ts         fetch + cookie + CSRF + 双响应格式解析
   ├─ src/luogu/auth.ts         凭据解析（settings/config/env，无注销）
   ├─ src/luogu/api.ts          类型化洛谷操作 + 容错解码
   ├─ src/luogu/cache.ts        题目离线缓存
   └─ README.md                 插件安装/配置/工具/限制说明
```

## Agent 工具（6 个）

`luogu_problem_list`、`luogu_problem`（含离线缓存）、`luogu_problem_random`（按难度/来源随机跳题）、
`luogu_submit`、`luogu_record_list`（查看自己评测）、`luogu_record`（查看最近/单次评测）。

## 如何安装到你的 deepseek-harness

1. 把 `packages/luogu/dsh-tool-luogu` 复制进 harness 仓库的 `packages/<group>/dsh-tool-luogu`；
2. `pnpm install && pnpm run constraints && pnpm run typecheck && pnpm run build`；
3. 在装配文件的 settings 里配置你的洛谷 Cookie（详见插件 `README.md`）。

> ⚠️ 洛谷接口为其私有接口，可能变动/有限流；本插件已把端点与字段集中到 `constants.ts`/`api.ts`，
> 便于随上游维护。请合理频率使用。
