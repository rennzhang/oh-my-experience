---
title: Provider Adapter
status: active
---

# Provider Adapter


## 目的

Provider adapters 隔离 Codex 和 Claude 的 hook 差异，避免这些差异进入 core
retrieval engine。

## 目标接口

```ts
interface ProviderAdapter {
  provider: string;
  normalizeHookInput(input: unknown): NormalizedHookEvent;
  renderHookOutput(result: RetrievalResult): unknown;
  installHook?(options: HookInstallOptions): HookInstallResult;
  hookStatus?(options: HookStatusOptions): HookStatusResult;
}
```

## Adapter 职责

- 在 provider 支持时安装并检查 hook config；
- 暴露 provider-specific hook config paths 和 trust/status notes；
- 把 provider-specific install options 映射到共享 hook runtime command；
- 永远不要实现 retrieval scoring。

## Core 职责

- 规范化进入 `ome hook run` 的 hook payloads；
- 匹配 cards；
- 解释 scores；
- 控制 context budget；
- 写 logs；
- 计算 stats。

## 当前形态

Codex 和 Claude 都使用共享 hook runtime，并通过 provider-specific hook output 注入
additional context。Adapter code 位于 `packages/adapters/agents/<provider>/`，
负责 install/status/uninstall。
