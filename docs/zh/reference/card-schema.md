---
title: 经验卡片结构
status: active
---

# 经验卡片结构


## 卡片形态

```yaml
schema: ome-card
id: browser-validation
status: active
title: Browser Validation
category: 测试验收
summary: 当 UI 可见改动会影响用户路径时，常见误判是停在静态检查或内部调用；应在真实浏览器验证用户路径，并排除纯后端任务。
criteria:
  use_when:
    - UI 或浏览器验收
    - 可见前端改动
  ignore_when:
    - 纯后端 migration
    - UI 词只是在文档示例里出现
engine_hints:
  positive:
    - ui_surface
  negative:
    - ui_surface_noise
recall:
  policy: must
  risk: high
  confidence: medium
  triggers:
    - browser validation
    - UI verification
  topics:
    - frontend
    - test
scope:
  level: project
  project_key: github.com/example/app
  module_path: apps/web
language: zh
```

````markdown
## 这张卡解决什么问题

当 UI 可见改动会影响用户路径时，常见误判是停在静态检查或内部调用；应在真实浏览器验证用户路径，并排除纯后端任务。

## 使用标准

使用：
- UI 或浏览器验收
- 可见前端改动

不要使用：
- 纯后端 migration
- UI 词只是在文档示例里出现

召回策略：must。
风险级别：high。

## 完整规则

```text
打开真实 UI，按用户可见路径操作，检查视口和浏览器控制台，然后才能把 UI 可见改动视为完成。
```
````

## 正文区块

Active 卡是 Markdown 经验卡。frontmatter 是轻量机器索引；正文是给人看的卡片，也是完整可复用规则的来源。

正文固定三段：

- `这张卡解决什么问题`：通俗说明这张卡的场景。
- `使用标准`：短 Key-Value 行，便于人工 review。
- `完整规则`：复盘沉淀出的完整规则，放在 fenced text 代码块里。

`ome experience show CARD_ID --section rule` 会从卡片里读取完整规则。
Hook 上下文不会注入完整规则，只注入轻量候选索引，并要求 Agent 只有在卡片适用时再读取完整规则。
轻量索引包含 title、id、summary、scope、使用标准、命中原因、规则读取命令和最终报告链接。

`summary` 应该写成一个完整句子，包含三类信息：什么时候适用、常见错误走向、正确动作或排除边界。它要足够短，适合进入 hook 上下文；也要足够完整，能帮助模型判断。

## 语言

卡片字段使用创建或审批这张卡时选择的语言。OME 目前只支持英文和中文作为已审批卡片内容
和用户可见 recall 输出语言。包裹它们的固定 hook frame 使用英文，但用户创建的卡片内容不会
在热路径被翻译。Prompt frame 可以要求 Agent 在用户回复语言为英文或中文时，用该语言输出
可见的 recall reminder 和 used-card disclosure。直接来源证据可以在 retrospective audit 中
保留原语言。跨语言召回应通过 triggers、aliases 和保留的技术 token 处理，而不是在 hook 热路径翻译。

卡片语言本身也是召回信号。优先选择用户未来最可能再次描述同类工作流时会使用的语言。
如果来源证据和用户话术主要是中文，中文 `summary`、`criteria` 和 triggers 通常能保留最有用
的召回锚点。

`auto` 和 `mixed` 是兼容或内部检测状态。新审批卡片应该使用 `en` 或 `zh` 内容。

## 召回字段

召回字段应该描述“什么情况下这条经验真的有用”，而不是只记录经验里出现过哪些名词。

- `criteria.use_when`：短的工作流入口短语。好的条目应该接近用户真正需要这条经验时会说的话，例如 `commit 前检查 git status` 或 `浏览器验证 UI`。
- `criteria.ignore_when`：常见误触发场景。适合写文档示例、仅解释、业务含义里的
  同名词，或用户明确说这类词只是噪声的情况。Prompt 包含完整 normalized phrase 时是 hard
  exclusion；模糊重合只作为 negative evidence。
- `recall.triggers`：matcher 使用的紧凑触发锚点。
- `recall.topics`：宽泛分类，例如 `git`、`frontend`、`runtime`。Topics 可以辅助召回，但不应该成为精确卡片命中的唯一理由。
- `scope.level`：卡片适用级别，可选 `global`、`project`、`project-family`。
- `scope.project_key`：项目匹配用的项目标识，例如仓库 key。
- `scope.module_path`：项目内可选路径，例如 `apps/web`。
- `engine_hints.positive`：已注册的内部召回提示，只写 OME 能稳定识别的任务形态。
  这是 required-any group：列出多个 id 时，至少需要一个 positive signal。
  `ui_surface`、`goal_execute`、`worktree_diff_operation` 这类路由 hint
  既是正向 evidence，也是 gate：prompt 没有这个任务形态时，不能靠“真实”“验证”
  这类泛词召回卡片。
- `engine_hints.required_all`：可选的严格 conjunction。列表里的每个 registered signal
  都必须存在。只有所有任务形态都确实必要时才使用，过度使用会制造 false negative。
- `engine_hints.negative`：内部召回提示。用于压住常见误召回；负向 signal 只压制其
  registry definition 明确声明的正向 targets。

Engine hints 不是给人或模型判断的真相，只是启发式。Hook 上下文展示自然语言使用标准和自然语言命中原因，不展示内部 hint id。

Signal id 来自共享 registry，不再来自 scorer 内部 whitelist。每条 registry definition
声明 polarity、routing behavior、matching patterns、negative targets 和 ownership
metadata：

- `source: generic` 表示适合开源 core 的通用任务形态；
- `source: pack` 和非空 `pack` 表示 bundled 领域或产品包。

这样可以把产品专用话术留在 pack，同时保持开源 contract 通用。Registry 编译进
package，当前没有 runtime 第三方 signal registration API。卡片文件只保存 signal ids；
未知 id 应由 card validation 报告，不能静默当作有效 routing hint。

内置 signals 示例：

| Signal | Source | Pack | 用途 |
|---|---|---|---|
| `ui_surface` | generic | - | 真实 UI、浏览器、视口或前端验证场景。 |
| `ui_surface_noise` | generic | - | UI wording 是噪声；只针对 `ui_surface`。 |
| `worktree_diff_operation` | generic | - | 脏 worktree、diff、stage 或提交范围操作。 |
| `provider_adapter_boundary` | generic | - | provider hook/runtime 边界工作。 |
| `dispatch_runtime_development` | pack | `ai-dispatch` | 开发 ai-dispatch 的 provider、路由、resume 或 stream runtime；普通派发不触发。 |
| `control_plane_worker_divergence` | pack | `agent-ops` | 控制面容量、租约或排队状态与真实 worker 证据分裂。 |
| `control_plane_divergence_ruled_out` | pack | `agent-ops` | 容量、租约或 worker 分裂已被明确排除；抑制分裂类召回。 |
| `runtime_reference_context` | generic | - | Runtime 词只出现在文档、fixture、模拟、UI 文案、假设或禁止语境中；抑制 runtime 开发与分裂类召回。 |
| `dispatch_tool_use_context` | pack | `ai-dispatch` | ai-dispatch 只是被当作工具调用去处理其他目标；抑制 runtime 开发召回。 |
| `external_model_review` | generic | - | 带真源锚点和裁决边界的外部/多模型审查。 |
| `goal_execute` | pack | `agent-goal` | Agent goal 或完整闭环执行。 |
| `goal_example_discussion` | pack | `agent-goal` | goal wording 只在文档、案例或解释中出现。 |
| `ome_review_surface` | pack | `ome` | OME draft approval 或经验库治理。 |
| `historical_session_lookup` | pack | `spool` | 历史 session 或 conversation evidence 查询。 |

Registry 才是 authoritative list；上表只是示例，consumer 不应复制成第二个 whitelist。

持久化 frontmatter 使用这些 groups：

```yaml
engine_hints:
  positive: [ui_surface, design_source_alignment] # 至少一个
  required_all: [explicit_execute, real_validation] # 每一项都必须有
  negative: [ui_surface_noise]
```

例子：

- 脏工作区安全卡不要只写 `git` 作为 trigger，应写清自然语言使用标准；必要时再加类似 `worktree_diff_operation` 的 engine hint。
- 目标执行卡不要只靠 `/goal` 命中，应同时阻断 `goal_example_discussion`，避免文档示例误召回。
- Spool 会话交接卡不要只靠 `Spool` 命中，应要求
  `historical_session_lookup`。

## 生命周期

Reflect candidates 还不是卡片。只有 `active` 卡片可以被召回。

```text
candidate -> draft -> active -> archived
```

Markdown frontmatter 的嵌套字段名应使用 snake_case。Runtime APIs 内部可以使用 camelCase，但 reference docs 应展示持久化 frontmatter 形式。

## 分类

`category` 是一等 metadata，不是 `sources` 约定。Reflect candidates 生成时应该包含 category；如果缺失，CLI 会根据 title、topics、triggers 和 lesson text 推断。用户可以在应用 reflect run 前覆盖候选分类；新的分类名称会直接保存在 candidate 和 card 上。

## 来源信息

Active 卡片保持卡面克制。日期、原始来源、`origin`、`source_refs` 等审计信息保留在 retrospective run、operation log、备份和必要的生成索引里，不作为 active 卡片 Markdown 的主要内容。

## Topics 与 Scope

`topics` 描述卡片内容，例如 `frontend`、`git`、`runtime` 或 `review`。它们用于匹配和筛选。

`scope` 描述卡片可以在哪里被召回：

- `global`：任何项目都可使用。
- `project`：只有当前 project key 匹配时召回。
- `project-family`：项目族匹配时召回，例如同一个 GitHub owner。

Hook 会在提示词阶段使用这些信息，让通用卡片保持通用，让范围明确的卡片只在
合适场景出现。
