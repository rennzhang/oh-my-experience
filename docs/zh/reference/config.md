---
title: 配置参考
status: active
---

# 配置参考


## 格式

可写配置使用 JSON。

默认路径：

```text
<dataDir>/config.json
```

## 建议结构

```json
{
  "dataDir": "/Users/example/.oh-my-experience",
  "privacy": {
    "saveRawPrompt": false
  },
  "retrieval": {
    "maxCards": 4,
    "minScore": 40,
    "additionalContextMaxChars": 6000,
    "hookTimeoutMs": 4000
  },
  "hooks": {
    "providers": {
      "codex": {
        "enabled": false
      },
      "claude": {
        "enabled": false
      }
    }
  },
  "sessions": {
    "store": "pointer",
    "retainDays": 30,
    "keepAppliedEvidence": true
  }
}
```

`sessions.store` 控制已扫描来源 session 的保留姿态：

- `pointer`：优先保留来源引用和轻量索引。
- `recent`：为 source-aware workflow 预留的保留姿态。
- `full`：为明确的离线迁移 workflow 预留的保留姿态。

修改 store mode 不会创建 transcript cache。普通用户不需要单独的存储维护命令；
诊断经验库健康时使用 `ome doctor`。

## 编辑规则

用户应优先使用：

```bash
ome config preview <key> <value>
ome config set <key> <value>
```

修改 `dataDir` 应该先走 `ome config preview`，再应用新值。这可以避免一次误操作就在没有
可见 diff 的情况下移动可写库位置。

语言不写入配置。CLI 人类输出固定英文；中文文档通过 `/zh/` 这类文档路径提供。

## 全局存储与项目存储

`dataDir` 是全局 OME 经验库和运行状态位置。它控制全局 active 卡、复盘、来源索引、
配置和 hook events。

项目经验库不在这里配置。它根据当前工作目录，从
`<project-root>/.oh-my-experience/` 发现。这样全局存储可以保持可迁移，同时仓库也可以
在明确需要时携带自己的 active 卡。
