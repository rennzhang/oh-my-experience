export interface SemanticAtomDefinition {
  id: string;
  patterns: readonly RegExp[];
}

export interface SemanticSignalComposition {
  signalId: string;
  /** Every atom must be present; an atom owns its synonym patterns. */
  allOf: readonly string[];
  /** Keeps unrelated clauses in long prompts from accidentally composing. */
  maxSpan: number;
  /** Atom evidence must stay in the same or adjacent sentence-like segment. */
  maxSegmentGap: number;
  /** False only for signals that still have deliberately sharp direct anchors. */
  replaceDirectPatterns: boolean;
}

export interface SemanticCompositionMatch {
  signalId: string;
  atomIds: string[];
  span: { start: number; end: number };
  segmentRange: { start: number; end: number };
}

type AtomInput = Omit<SemanticAtomDefinition, "patterns"> & { patterns: readonly RegExp[] };
type CompositionInput = Omit<SemanticSignalComposition, "maxSpan" | "maxSegmentGap" | "replaceDirectPatterns"> & {
  maxSpan?: number;
  maxSegmentGap?: number;
  replaceDirectPatterns?: boolean;
};

function atom(input: AtomInput): Readonly<SemanticAtomDefinition> {
  return Object.freeze({ ...input, patterns: Object.freeze([...input.patterns]) });
}

function composition(input: CompositionInput): Readonly<SemanticSignalComposition> {
  if (input.allOf.length < 2 || input.allOf.length > 4) {
    throw new Error(`semantic signal composition ${input.signalId} must contain 2-4 atoms`);
  }
  return Object.freeze({
    ...input,
    allOf: Object.freeze([...input.allOf]),
    maxSpan: input.maxSpan ?? 420,
    maxSegmentGap: input.maxSegmentGap ?? 1,
    replaceDirectPatterns: input.replaceDirectPatterns ?? true,
  });
}

const DISPATCH_ENTITY = String.raw`ai[-\s]?dispatch`;
const DISPATCH_SUBSYSTEM = String.raw`(?:provider\s*(?:adapter|适配器)|(?:model|provider)\s*(?:registry|注册表)|model\s*alias(?:es)?|模型别名|model\s*resolver|模型解析器|route\s*resolver|路由解析器|(?:routing|route)\s*table|路由表|fallback\s*(?:chain|routing|链|路由)|resume\s*(?:runtime|运行时)|stream(?:ing)?\s*(?:runtime|运行时))`;
const DISPATCH_ACTION_EN = String.raw`(?:add|apply|build|implement|develop|modify|change|fix|debug|investigate|diagnose|repair|refactor|migrate|integrate|wire|upgrade|support)`;
const DISPATCH_PARTICIPLE_EN = String.raw`(?:added|built|implemented|developed|modified|changed|fixed|debugged|refactored|migrated|integrated|wired|upgraded)`;
const DISPATCH_ACTION_ZH = String.raw`(?:新增|增加|加上?|实现|实施|应用|落地|开发|修改|改一下|改造|修一下|修复|修好|调试|排障|定位|重构|迁移|接入|支持|升级)`;
const DISPATCH_FAILURE_EN = String.raw`(?:broken|buggy|failing|misrout(?:e|es|ed|ing)|falls?\s+through|resolves?.{0,18}\bwrong\b)`;
const DISPATCH_REMEDIATION_EN = String.raw`(?:fix|debug|investigate|diagnose|repair|refactor|change|update|migrate)`;
const DISPATCH_FAILURE_ZH = String.raw`(?:有\s*(?:bug|问题)|映射错误|总失败|一直失败)`;
const DISPATCH_REMEDIATION_ZH = String.raw`(?:修一下|修复|修好|调试|排障|定位|修改|改造|重构|迁移)`;

function dispatchPattern(source: string): RegExp {
  return new RegExp(source, "i");
}

export const SEMANTIC_ATOMS: readonly Readonly<SemanticAtomDefinition>[] = Object.freeze([
  atom({
    id: "legacy_fact_path",
    patterns: [
      /\b(?:legacy|compatibility|backward[-\s]?compat(?:ibility)?|shadow\s+writer|alias\s+(?:route|endpoint|entry)|old\s+(?:format|directory|path|route|endpoint|field|reader|writer|entry))\b/i,
      /旧(?:格式|目录|路径|字段|读(?:取)?器?|写(?:入)?器?|入口|版本)|老(?:格式|目录|路径|接口|字段|读(?:取)?器?|写(?:入)?器?|入口)|影子(?:\s*writer|写入|读取)|别名(?:入口|读接口|写接口)|兼容(?:层|路径|逻辑|入口|fallback)|双读|双写/i,
    ],
  }),
  atom({
    id: "migration_complete",
    patterns: [
      /\b(?:migration|cutover)\b.{0,36}\b(?:finished|completed|complete|done|ended|successful|succeeded)\b|\b(?:finished|completed|successful)\b.{0,24}\b(?:migration|cutover)\b|\ball\b.{0,24}\b(?:readers?|writers?|clients?|callers?)\b.{0,24}\b(?:migrated|switched|moved)\b/i,
      /迁移.{0,28}(?:已(?:经)?完成|完成了|结束了|已经.{0,12}(?:天|周|月|季度|年)了)|(?:已经|全部|都)迁到.{0,28}(?:新|当前)|切换到.{0,20}(?:新|当前).{0,16}(?:已完成|已有.{0,8}(?:天|周|月|季度|年))/i,
    ],
  }),
  atom({
    id: "no_dependent_consumer",
    patterns: [
      /\bno\b.{0,20}\b(?:external|active|current|real)?\s*(?:consumers?|callers?|clients?|dependents?)\b.{0,32}\b(?:depend|rely|use|need|remain|left)\b|\bwithout\b.{0,20}\b(?:external|active|current|real)\s+(?:consumers?|callers?|clients?|dependents?)\b/i,
      /没有.{0,16}(?:外部|真实|当前)?(?:消费者|调用方|客户端|依赖方)|(?:外部|真实|当前)?(?:消费者|调用方|客户端|依赖方).{0,20}(?:已经)?(?:没有|不存在|不再依赖|都迁完)|确认.{0,16}(?:没人|没有调用方).{0,12}依赖/i,
    ],
  }),
  atom({
    id: "retire_or_converge",
    patterns: [
      /\b(?:remove|drop|retire|decommission|delete|converge|unify|collapse|strip\s+out|rip\s+out)\b/i,
      /收掉|清掉|删除|删掉|移除|清理|下线|收敛|统一|不再保留|停止兼容/i,
    ],
  }),
  atom({
    id: "single_authority",
    patterns: [
      /\b(?:one|single)\s+(?:authoritative|canonical|real|current)?\s*(?:path|route|endpoint|entry|entrypoint|source)|\b(?:authoritative|canonical)\s+(?:path|route|endpoint)\b|\bcurrent\s+authoritative\s+endpoint\b|\bonly\b.{0,20}\b(?:authoritative|canonical|real|current)?\s*(?:path|route|endpoint|entry|entrypoint|source)\b.{0,32}\b(?:determin|decid)|\bonly\s+one\b.{0,32}\b(?:determin|decid)|\btwo\b.{0,32}\b(?:determin|decid)/i,
      /(?:只|仅)保留.{0,24}(?:一个|一条|当前|真实|权威)|(?:唯一|单一)(?:当前|真实|权威)?(?:入口|路径|真源|事实源)|(?:只|仅|只有)有?一个(?:当前|真实|权威)?(?:入口|路径|真源|事实源)|一条.{0,24}(?:决定|确定)(?:结果|行为)|不要再留.{0,16}两条.{0,24}(?:决定|确定)(?:结果|行为)|两(?:边|条).{0,24}(?:各自|都能)?.{0,16}(?:决定|确定)(?:最终)?(?:结果|行为|值)/i,
      /所有(?:读写|读取|写入).{0,20}(?:都)?(?:已)?(?:切到|迁到|改用|走)|\ball\s+(?:reads?|writes?|readers?|writers?)\b.{0,30}\b(?:use|moved?|switched?|point)\b.{0,24}\b(?:canonical|current|new)\b/i,
    ],
  }),
  atom({
    id: "agent_goal_container",
    patterns: [
      /\/goal\b|\b(?:Codex|agent|execution)\s+goal\b|\bgoal\b.{0,24}\b(?:agent|Codex|acceptance\s+items?)\b/i,
      /(?:创建|建立|启动|使用).{0,12}(?:执行)?目标|(?:Codex|Agent).{0,12}目标|持续执行.{0,16}目标/i,
    ],
  }),
  atom({
    id: "direct_execution",
    patterns: [
      /\b(?:start\s+working|start\s+now|run|execute|implement|directly\s+(?:start|work|execute)|get\s+to\s+work|(?:keep\s+)?driv(?:e|ing))\b/i,
      /直接(?:开工|开干|开始|执行|实现|做)|开工|开干|立即执行|持续执行|持续推进|一路推进/i,
    ],
  }),
  atom({
    id: "closure_evidence",
    patterns: [
      /\b(?:keep\s+going|continue)\b.{0,40}\b(?:until|evidence|complete)|\buntil\b.{0,50}\b(?:acceptance|verified|evidence|complete)|\bfresh\s+evidence\b|\bdo\s+not\s+stop\b/i,
      /直到.{0,40}(?:验收|完成|证据)|不要.{0,24}(?:停|中断)|完整闭环|完成.{0,24}(?:验证|验收).{0,24}交付|(?:验收|完成)项.{0,24}(?:新|最新|真实)证据/i,
    ],
  }),
  atom({
    id: "user_output_surface",
    patterns: [
      /\b(?:report|console|dashboard|status\s+page|operator\s+view|runbook|CLI)\b/i,
      /日报|报告|报表|运营后台|控制台|仪表盘|状态页|值班|面向用户|用户可见|接班人/i,
    ],
  }),
  atom({
    id: "decision_first",
    patterns: [
      /\b(?:go[-\s]?or[-\s]?stop|verdict|decision)\b|\b(?:put|show|answer).{0,24}\bfirst\b|\b(?:impact|consequence).{0,30}\bnext\s+action\b/i,
      /第一眼|先看到|优先展示|是否(?:要|需要)?(?:介入|干预|行动)|要不要(?:介入|干预|行动)|结论.{0,24}(?:影响|后果)|(?:状态|结论).{0,24}(?:影响|后果).{0,24}(?:下一步|动作)|(?:是否|当前).{0,12}健康.{0,32}影响.{0,32}下一步|(?:做|完成).{0,12}(?:一次)?状态判断/i,
    ],
  }),
  atom({
    id: "defer_diagnostics",
    patterns: [
      /\b(?:diagnostic|implementation|internal|raw)\b.{0,24}\b(?:history|fields?|enums?|details?)\b|\b(?:trace|diagnostic)\s+history\b|\b(?:behind|under|in)\b.{0,24}\b(?:details?|expand(?:able)?|drill[-\s]?down)\b|\bexpandable\s+details?\b/i,
      /底层字段|内部字段|原始枚举|诊断历史|需要时再展开|放到详情|下沉到详情|详情(?:页|视图|里)/i,
    ],
  }),
  atom({
    id: "hierarchy_overload",
    patterns: [
      /\b(?:nested|buried)\b.{0,24}\b(?:cards?|panels?|levels?|layers?)\b|\b(?:cards?|panels?|metrics?)\b.{0,28}\b(?:equal|same)\s+(?:visual\s+)?weight\b|\b(?:cannot|can't|hard\s+to)\b.{0,32}\b(?:find|tell|spot|identify)\b.{0,28}\b(?:key|critical|urgent|immediate|action)\b|\btoo\s+many\b.{0,16}\b(?:cards?|panels?|metrics?|levels?)\b/i,
      /(?:卡片|面板|信息).{0,20}(?:嵌套|套了|堆了).{0,12}(?:层|级)|(?:嵌套|套了|堆了).{0,16}(?:卡片|面板|信息)|(?:指标|卡片|面板).{0,20}(?:等权|权重一样|同样醒目)|找不到.{0,20}(?:关键|核心|重要|需立即处理)|看不出.{0,20}(?:轻重|优先级|是否要行动)|信息层级.{0,12}(?:太多|过深|混乱)/i,
    ],
  }),
  atom({
    id: "ui_product_surface",
    patterns: [
      /\b(?:UI|frontend|front-end|screen|page|dashboard|console|form|list(?:ing)?)\b/i,
      /前端|页面|界面|屏幕|控制台|仪表盘|表单|库存页|设置页|列表页|列表/i,
    ],
  }),
  atom({
    id: "real_service_data",
    patterns: [
      /\b(?:real|live)\s+(?:service|API|data|backend)|\b(?:real|live)\s+(?:[a-z0-9_-]+\s+){1,3}(?:service|API|data|backend)\b|\b(?:database|schema)\b.{0,40}\b(?:API|response|screen|page)\b/i,
      /真实(?:服务|接口|API|数据|后端)|实时数据|数据库字段.{0,40}(?:接口|响应|页面)|运行时事件.{0,24}(?:接入|接到)/i,
    ],
  }),
  atom({
    id: "real_user_path_validation",
    patterns: [
      /\b(?:running\s+page|real\s+browser|user\s+(?:path|flow)|desktop\s+and\s+mobile|console\s+or\s+network|network\s+errors?|visible\s+result|after\s+submission)\b/i,
      /真实浏览器|用户(?:路径|流程)|实际点|实际操作|真实点击|浏览器.{0,32}(?:点击|请求|验证|走完|console|network)|移动端.{0,24}桌面端|桌面端.{0,24}移动端|请求.{0,24}副作用|控制台.{0,24}(?:网络|请求)|提交后.{0,24}(?:结果|反馈)/i,
    ],
  }),
  atom({
    id: "readiness_decision",
    patterns: [
      /\b(?:can|ready\s+to|should)\b.{0,24}\b(?:ship|merge|release|deploy)|\b(?:ship|merge|release)[-\s]?(?:ready|readiness)\b|\b(?:go|no[-\s]?go)\s+decision\b/i,
      /能不能.{0,16}(?:合并|发布|上线|交付|ship|merge|release)|是否(?:可以|能够)?.{0,16}(?:合并|发布|上线|交付|ship|merge|release)|(?:合并|发布|上线|交付)(?:门槛|就绪|判断)|明确结论/i,
    ],
  }),
  atom({
    id: "delivery_layers",
    patterns: [
      /\b(?:patch|fix)\s+(?:works|is\s+done)\b.{0,80}\b(?:release\s+gates?|user\s+(?:path|workflow))\b|\bseparate\b.{0,80}\b(?:release\s+gates?|user\s+(?:path|workflow))\b/i,
      /(?:bug|修复).{0,20}(?:修好|完成|done).{0,40}(?:合并|发布|上线)(?:门槛|就绪)|分别判断.{0,80}(?:发布|合并)(?:门槛|gate).{0,60}(?:用户路径|用户链路)|(?:功能|修复)(?:完成|可用).{0,40}(?:发布|合并).{0,40}(?:用户路径|真实链路)/i,
    ],
  }),
  atom({
    id: "fresh_delivery_evidence",
    patterns: [
      /\b(?:stale|outdated)\s+(?:evidence|screenshots?|smoke|results?)\b|\b(?:smoke|test|evidence|results?)\b.{0,24}\b(?:is|are|became)?\s*(?:stale|outdated)\b|\b(?:fresh|new|latest|current)\s+evidence\b|\bafter\b.{0,32}\b(?:last|latest|final)\s+(?:change|edit|fix)|\b(?:last|latest|final)\s+changes?\b|\bchanged\s+after\b.{0,24}\b(?:smoke|test|evidence)/i,
      /(?:证据|截图|测试|smoke).{0,20}(?:过时|失效|旧了)|(?:最后|最新).{0,20}(?:变更|修改|修复|改完|调整).{0,32}(?:之后|后).{0,32}(?:证据|重新|再跑|判断)|(?:这次|本次|最后一次)变更.{0,20}(?:之后|后)的?证据|(?:配置|代码).{0,24}(?:又|再次)改过|重新判断|重新验收/i,
    ],
  }),
  atom({
    id: "failure_observation",
    patterns: [
      /\b(?:fail(?:s|ed|ure)?|error|exception|401|403|unauthorized|not\s+connected|cannot\s+connect|doesn't\s+work|does\s+not\s+work)\b/i,
      /失败|报错|异常|未连接|连不上|无法连接|不生效|登录失败|认证失败|权限错误/i,
    ],
  }),
  atom({
    id: "tool_environment_boundary",
    patterns: [
      /\b(?:harness|browser\s+extension|extension|plugin|connector|provider|auth|session\s+permission|network|environment|tooling|curl|account)\b/i,
      /工具|接入|浏览器扩展|扩展程序|插件|连接器|认证|权限|运行环境|网络|浏览器\s*harness|账号|stderr|服务日志/i,
    ],
  }),
  atom({
    id: "triage_across_layers",
    patterns: [
      /\b(?:determine|separate|distinguish|isolate|triage)\b.{0,80}\b(?:application|product|extension|business|environment|tool|permission|connector|network)|\b(?:network|permission|extension|product)\b.{0,100}\b(?:network|permission|extension|product|bug)\b.{0,60}\b(?:triage|root\s+cause|before\s+(?:changing|suggesting))\b|\balternate\s+entry\b/i,
      /(?:分开|分别|区分|判断).{0,80}(?:业务|应用|环境|工具|权限|接入|网络)|分开取证|备用入口|替代入口|不要.{0,40}改核心代码/i,
    ],
  }),
  atom({
    id: "retrieval_symptom",
    patterns: [
      /\b(?:no\s+match|missed\s+recall|false\s+(?:positive|negative)|irrelevant\s+experiences?|leak(?:s|ing)?\s+into\s+unrelated|context\s+pollution)\b|\bexperiences?\b.{0,32}\bleak(?:s|ing)?\b.{0,24}\bcontext\b/i,
      /\brecall\s+eval\b.{0,32}\bregress(?:ed|ion)?\b|\bpositive\s+(?:fixtures?|cases?)\b.{0,32}\bmiss(?:es|ed)?\b|\bnear[-\s]?miss(?:es)?\b.{0,32}\bleak(?:s|ed|ing)?\b/i,
      /没命中|漏召回|误召回|串卡|召回评估.{0,24}退化|正例.{0,24}漏|近负例.{0,24}漏进|无关经验|上下文污染|跨仓库泄漏|作用域泄漏/i,
    ],
  }),
  atom({
    id: "retrieval_pipeline_stage",
    patterns: [
      /\b(?:retrieval\s+pipeline|intent\s+extract(?:ion)?|applicability|scope|ranking|context\s+assembly|signal|scor(?:e|ing)|filter(?:ing)?|render(?:ing)?)\b/i,
      /召回流水线|意图抽取|适用门槛|作用域|排序|评分|过滤|渲染|上下文拼装|信号识别/i,
    ],
  }),
  atom({
    id: "retrieval_stage_diagnosis",
    patterns: [
      /\b(?:trace|localize|determine|diagnose|reproduce)\b(?:.{0,80}\b(?:stage|responsible|input|pipeline|cause|applicability|scope|ranking|assembly))?|\bfix\s+one\s+responsible\s+stage\b/i,
      /(?:复现|定位|判断|追踪).{0,80}(?:环节|责任层|哪一层|出了问题|原始输入)|只修.{0,20}(?:责任层|一层)|别先调权重/i,
    ],
  }),
  atom({
    id: "source_reconciliation",
    patterns: [
      /\b(?:reconcile|cross[-\s]?check|compare|map)\b|\b(?:conflict|disagree)\b.{0,40}\b(?:precedence|wins?|override|expose)\b|\b(?:which|what)\b.{0,24}\b(?:source|artifact|version)\b.{0,24}\b(?:wins?|authoritative|trust)\b/i,
      /核对|对照|对齐|逐项对应|拉齐|比对|标出冲突|理清楚.{0,16}以哪个为准|该以哪个为准|哪边.{0,20}(?:该遵守|才是|为准)|冲突.{0,24}(?:谁覆盖谁|以谁为准|优先级)/i,
    ],
  }),
  atom({
    id: "requirement_design_source",
    patterns: [
      /\b(?:PRD|spec(?:ification)?|requirements?|acceptance\s+criteria|design\s+spec|Figma\s+flow|annotated\s+design)\b/i,
      /需求(?:说明|文档)?|验收标准|验收条件|设计稿|产品规范|用户原话/i,
    ],
  }),
  atom({
    id: "runtime_implementation_evidence",
    patterns: [
      /\b(?:current\s+(?:code|implementation)|code\s+(?:path|behavior|throws?|returns?)|deployed\s+(?:config|feature\s+flags?)|(?:current\s+)?request\s+traces?|runtime\s+(?:logs?|state)|production\s+(?:logs?|behavior)|database|API\s+response)\b/i,
      /当前(?:代码|实现)|实际实现|功能的实现|代码里|代码(?:直接)?(?:抛|返回|执行)|线上(?:的)?(?:配置|日志|行为)|部署配置|请求(?:日志|链路|trace)|运行时(?:日志|状态)|数据库|接口实际返回/i,
    ],
  }),
  atom({
    id: "trace_execution_path",
    patterns: [
      /\b(?:trace|map|diagram|follow)\b.{0,70}\b(?:path|flow|pipeline|state|request|adapter|persistence)|\bmap\b.{0,50}\bentry\s+points?\b.{0,50}\b(?:actual\s+)?outcomes?\b|\bstate\b.{0,50}\b(?:travels?|flows?)\b/i,
      /(?:画清楚|梳理|追踪|还原).{0,70}(?:路径|链路|流程|调用|状态流)|从.{0,40}(?:入参|适配器|入口).{0,50}(?:写库|持久化|核心)/i,
    ],
  }),
  atom({
    id: "consumer_deployment_facts",
    patterns: [
      /\b(?:actual|real|current)\s+(?:external\s+)?(?:consumers?|callers?)\b|\b(?:no|without)\s+(?:active\s+)?consumers?\b|\bdeployment\s+(?:facts?|state|status)\b|\bdeployed\s+(?:state|behavior)\b/i,
      /真实(?:调用者|消费方|使用方)|当前(?:调用者|消费者)|没有消费者|无消费者|上线状态|部署事实|生产使用情况/i,
    ],
  }),
  atom({
    id: "final_boundary_choice",
    patterns: [
      /\b(?:removal|remove)\s+(?:versus|vs\.?)\s+migration\b|\bdecide\b.{0,50}\b(?:remove|retire|migrate|keep)\b|\b(?:choose|decide)\b.{0,80}\b(?:final[-\s]?state|minimal\s+fix|migration\s+window)\b|\bfinal\s+(?:shape|boundary|state)\b/i,
      /决定.{0,50}(?:收掉|删除|移除|迁移|保留)|(?:选择|判断).{0,60}(?:最终态|最小修复|迁移窗口)|哪些.{0,30}(?:收掉|删除|移除).{0,30}哪些.{0,30}迁移|最终态(?:边界|形态|结构)/i,
    ],
  }),
  atom({
    id: "irreversible_operation",
    patterns: [
      /\b(?:push(?:ing)?\s+(?:the\s+)?(?:current|this|main|release|develop)?\s*branch|git\s+push|restart(?:ing)?\s+(?:the\s+)?production|deploy(?:ing)?\b.{0,48}\bto\s+production|(?:delete|truncate)\b.{0,32}\b(?:online|production|staging)?\s*(?:data|database|table)|(?:database|table)\b.{0,20}\btruncat(?:e|ed|ion)|chang(?:e|ing)\s+production\s+config|open\s+(?:a\s+)?PR|(?:spend|purchase|buy|top[-\s]?up)\b.{0,32}\b(?:credits?|quota|money|budget|dollars?)|\b(?:credits?|quota)\b.{0,20}\btop[-\s]?up)\b/i,
      /push.{0,8}(?:这个|当前|main|release|develop)\s*分支|推送(?:分支|代码)|git\s+push|重启(?:线上|生产)|部署到生产|(?:删(?:除)?|清空|清理).{0,16}(?:线上|生产)(?:镜像)?(?:数据|数据库|表|记录)|(?:修改|变更)生产配置|开\s*PR|(?:购买|付费|充值).{0,20}(?:额度|美元|预算)/i,
    ],
  }),
  atom({
    id: "user_imperative_authorization",
    patterns: [
      /\bplease\s+(?!do\s+not|don't|not\b)(?:now\s+)?(?:deploy|delete|remove|push|release|publish|restart|change\s+production|open\s+(?:a\s+)?PR)\b|\b(?:go\s+ahead\s+and|I\s+want\s+you\s+to)\s+(?:deploy|delete|remove|push|release|publish|restart|change\s+production|open\s+(?:a\s+)?PR)\b/i,
      /(?:请|帮我|现在就|直接)(?!不要|别|先别|暂不).{0,8}(?:部署到生产|删除(?:线上|生产)数据|推送(?:分支|代码)|git\s+push|发布生产|重启生产|修改生产配置|开\s*PR)/i,
    ],
  }),
  atom({
    id: "authorization_stop_boundary",
    patterns: [
      /\b(?:not\s+authorized|without\s+(?:explicit\s+)?(?:approval|authorization|permission)|until\s+(?:explicitly\s+)?(?:approved|authorized)|stop\s+there|wait\s+for\s+(?:approval|authorization|permission)|pause\s+for\s+explicit\s+(?:confirmation|approval)|wait\s+for\s+(?:my\s+)?go[-\s]?ahead|ask\s+(?:me\s+)?before)\b|\bask\b.{0,24}\b(?:approval|authorization|permission)\b.{0,24}\bbefore\b|\bbefore\b.{0,48}\bask\b.{0,24}\b(?:approval|authorization|permission)\b|\bbefore\b.{0,40}\b(?:act(?:ing)?|running|executing|proceeding)\b.{0,40}\b(?:list|map|assess|show)\b.{0,24}\b(?:impact|blast\s+radius|affected\s+(?:systems?|data|scope))\b/i,
      /未(?:获|经)授权|没有授权|未经批准|拿到授权再|获得批准再|先确认授权|先得到授权|(?:先)?(?:等|等待)(?:我确认)?授权|等我(?:明确)?(?:点头|确认)|等我确认后再执行|先别.{0,16}(?:直接)?(?:做|执行|动手)|先问我|到这里停|停在这里|不要执行|不得执行|前确认(?:授权|批准|影响范围)?|影响范围.{0,24}(?:等我确认|确认后再执行|再执行)|(?:动手|执行|操作)之前.{0,24}(?:列|梳理|说明|评估).{0,16}(?:影响范围|波及范围|风险范围)/i,
    ],
  }),
  atom({
    id: "specific_change_review",
    patterns: [
      /\b(?:audit|review|inspect)\b.{0,50}\b(?:diff|patch|fix|change|implementation|commit)|\b(?:tiny|small|five[-\s]?line)\s+(?:bug\s+)?fix\b/i,
      /\b(?:PR|commit|patch|fix|change)\b.{0,70}\b(?:audit|review|inspect)\b/i,
      /(?:审查|评审|检查|review).{0,50}(?:diff|补丁|修复|改动|实现|提交|小需求)|(?:PR|提交|补丁|小\s*bug).{0,70}(?:审查|评审|检查|review)|(?:五行|很小|小型|小)\s*(?:bug|需求)?\s*(?:修复|改动|实现)/i,
    ],
  }),
  atom({
    id: "structural_complexity",
    patterns: [
      /\b(?:registry|wrappers?|factor(?:y|ies)|factory\s+pattern|normalization\s+layer|rescue\s+path|fallback|abstraction\s+layers?|indirection|scope\s+creep)\b/i,
      /注册表|包装层|wrapper|factory|工厂模式|归一化层|兜底路径|fallback|抽象层|间接层|范围膨胀|预留扩展/i,
    ],
  }),
  atom({
    id: "present_justification",
    patterns: [
      /\b(?:present[-\s]?day|current|actual|real)\s+(?:consumer|caller|use\s+case)|\bthreat\s+model\b|\bschema\s+(?:forbids?|disallows?)\b|\b(?:which|what)\b.{0,36}\b(?:should\s+leave|is\s+needed|has\s+a\s+consumer)\b/i,
      /当前(?:消费者|消费方|调用方|用例)|真实(?:的)?(?:消费者|消费方|调用方|威胁模型)|威胁模型|schema\s*(?:禁止|不允许)|哪些.{0,30}(?:该删|该移除|应离开)|有没有(?:当前|真实)?(?:的)?(?:消费者|调用方)/i,
    ],
  }),
  atom({
    id: "substitute_implementation",
    patterns: [
      /\b(?:canned\s+response|in[-\s]?memory\s+(?:test\s+)?(?:array|store|repository)|test[-\s]?only\s+(?:store|repository|backend)|mock|fake\s+data|placeholder|prototype|stub|fallback)\b/i,
      /内存(?:数组|存储|仓库|\s*store)|假数据|预置响应|固定响应|mock|placeholder|fallback|原型|演示壳|接线壳/i,
    ],
  }),
  atom({
    id: "prototype_exit_boundary",
    patterns: [
      /\b(?:named\s+)?prototype\s+seam\b|\bexit\s+condition\b|\btemporary\s+seam\b|\b(?:replac(?:e|ed)|rip\s+out|remove|delete)\b.{0,40}\b(?:before|when|once)\b/i,
      /\bexplicit\s+(?:stage|prototype|temporary)\s+boundary\b|\b(?:mark|label)\b.{0,32}\bboundary\b.{0,24}\b(?:stage|prototype|temporary)\b/i,
      /显式阶段边界|阶段性?接线|只能用于接线|本轮演示|原型.{0,16}(?:验证完|完成后).{0,8}退出|替换条件|退出条件|临时接线点|保留.{0,24}(?:演示|接线)|(?:E2E|浏览器验收|验收|交付)前.{0,24}(?:必须|要)?.{0,8}(?:替换|接入|接|移除|删掉).{0,16}(?:真实\s*API|真实服务|真实持久化)?/i,
    ],
  }),
  atom({
    id: "real_proof_boundary",
    patterns: [
      /\b(?:cannot|must\s+not|does\s+not|do\s+not\s+treat|never\s+use)\b.{0,48}\b(?:count\s+as|be\s+treated\s+as|treat\s+as|prove|claim|completed?|evidence)\b.{0,48}\b(?:delivery|feature|complete|payments?|permissions?|persistence|production|user\s+journey)|\bbefore\s+calling\b.{0,20}\b(?:real|complete(?:d)?)\s+delivery\b|\bnot\s+(?:production\s+)?(?:proof|evidence)\b|\bdo\s+not\s+claim\b.{0,40}\bprov(?:e|es|ed|ing)\b.{0,40}\b(?:delivery|complete|payments?|permissions?|persistence|production)|\bmust\s+(?:be\s+)?replace(?:d)?\b.{0,40}\b(?:real|live)\s+(?:API|persistence|service)\b.{0,32}\bbefore\b.{0,20}\b(?:E2E|acceptance|delivery)\b/i,
      /\b(?:do\s+not|don't|cannot|must\s+not)\b.{0,24}\bpass\b.{0,12}\boff\b.{0,32}\b(?:end[-\s]?to[-\s]?end|E2E|delivery|complete|production)\b|\brather\s+than\s+claim(?:ing)?\b.{0,40}\b(?:fully\s+)?deliver(?:ed|y)\b|\bbefore\s+claim(?:ing)?\b.{0,32}\bdelivery\b/i,
      /不能.{0,40}(?:算作?|作为|声称|证明|冒充|当作?|当).{0,40}(?:交付|完成|真实|持久化|E2E)|冒充.{0,32}(?:E2E|交付|完成)|别把.{0,24}算(?:作)?交付|不算(?:完成|交付|真实证明)|隐藏未完成链路|无法证明.{0,30}(?:权限|持久化|支付|真实链路)|(?:正式)?验收.{0,24}(?:必须|要)?(?:回到|接入).{0,20}真实\s*API|(?:最终)?(?:E2E|浏览器验收|验收|交付)前.{0,24}(?:必须|要)?.{0,16}(?:替换|接入|接).{0,16}(?:真实\s*API|真实服务|真实持久化)|(?:准备)?真实交付.{0,32}(?:真实(?:的)?后端\s*API|真实\s*API).{0,24}(?:接入|闭环)|还没接.{0,12}真实\s*API.{0,20}不能算(?:完成|交付)/i,
    ],
  }),
  atom({
    id: "multiple_model_reviewers",
    patterns: [
      /\b(?:multiple|several|two)\s+(?:AI\s+)?models?\b|\b(?:Claude.{0,32}(?:Grok|Gemini|Codex)|Grok.{0,32}(?:Claude|Gemini|Codex)|Gemini.{0,32}(?:Claude|Grok|Codex)|Codex.{0,32}(?:Claude|Grok|Gemini))\b/i,
      /多模型|多个模型|两个模型|Claude.{0,24}(?:Grok|Gemini|Codex)|Grok.{0,24}(?:Claude|Gemini|Codex)/i,
    ],
  }),
  atom({
    id: "independent_model_review",
    patterns: [
      /\b(?:independent(?:ly)?|separately|each)\b.{0,36}\b(?:review|audit|inspect|challenge)|\bcross[-\s]?(?:review|check)\b/i,
      /各自.{0,20}(?:独立)?(?:审|评审|审查|review)|分别.{0,24}(?:审|找|检查|review)|独立(?:审查|评审|review)|交叉(?:审查|评审)/i,
    ],
  }),
  atom({
    id: "review_source_bundle",
    patterns: [
      /\b(?:spec|contract|diff|patch|logs?|current\s+code|test\s+evidence|architecture|design|implementation|plan)\b/i,
      /规范|契约|方案|改动|代码|测试证据|交付证据|日志|最小必要(?:上下文|材料)|只读材料/i,
    ],
  }),
  atom({
    id: "primary_adjudication",
    patterns: [
      /\b(?:main|primary)\s+(?:thread|session|agent)\b.{0,40}\b(?:adjudicat|decid|reconcile)|\b(?:adjudicat|reconcile)\b.{0,40}\b(?:against|current\s+code|source\s+of\s+truth)|\b(?:not|never)\b.{0,20}\b(?:vote|voting|majority)\b/i,
      /主(?:线程|会话|任务).{0,30}(?:裁决|判断|去重)|回到当前(?:代码|真源).{0,24}(?:裁决|判断)|按(?:代码|真源|证据).{0,20}裁决|不按(?:票数|投票|多数).{0,20}(?:决定|裁决)/i,
    ],
  }),
  atom({
    id: "agent_entry_rule_entity",
    patterns: [
      /\b(?:AGENTS\.md|CLAUDE\.md|agent\s+(?:instructions?|rules?)|repository\s+entry\s+(?:instructions?|rules?)|root\s+rules?|project\s+rules?|skill\s+rules?)\b/i,
      /代理(?:说明|规则)|智能体规则|仓库入口(?:说明|规则)?|入口规则|根规则|项目规则|能力流程|skill\s*规则/i,
    ],
  }),
  atom({
    id: "rule_governance_intent",
    patterns: [
      /\b(?:audit|review|govern|refactor|clean\s+up|reorganize)\b.{0,40}\b(?:rules?|instructions?)|\bgovernance\s+(?:review|advice|recommendations?)\b|\bdecide\b.{0,50}\b(?:belongs?|place|layer|where)\b/i,
      /(?:审查|评审|清理|治理|重构|归位).{0,36}(?:规则|说明|入口)|治理建议|规则清淤/i,
    ],
  }),
  atom({
    id: "rule_layer_problem",
    patterns: [
      /\b(?:duplicat(?:e|ed|ion)|overlap|conflict|wrong\s+layer|relocat(?:e|ed|ion)?|move\s+down|keep|remove|long\s+(?:manual|workflow))\b.{0,50}\b(?:root|project|skill|entry|rules?|instructions?)|\b(?:always[-\s]?on|repository\s+facts?)\b.{0,40}\b(?:workflow|skill|docs?)\b|\b(?:recommend|decide)\b.{0,36}\b(?:keep|remove|relocate)\b|\bbelongs?\b.{0,60}\b(?:root|repository|project|skill|OME|docs?)\b/i,
      /重复|重叠|冲突|该(?:删除|下沉|保留)|下沉到\s*skill|根规则.{0,30}项目规则|项目规则.{0,30}skill|长(?:操作)?手册.{0,24}入口|常驻事实.{0,24}(?:能力流程|长文档)/i,
    ],
  }),
  atom({
    id: "stated_non_understanding",
    patterns: [
      /\b(?:I\s+am\s+lost|still\s+(?:do\s+not|don't)\s+understand|did(?:\s+not|n't)\s+follow|does(?:\s+not|n't)\s+make\s+sense|too\s+(?:tangled|jargon[-\s]?heavy))\b/i,
      /没弄明白|没听懂|没看懂|没看明白|还是不明白|理解不了|没跟上|太绕|术语太多|讲得太复杂/i,
    ],
  }),
  atom({
    id: "explanation_repair_request",
    patterns: [
      /\b(?:ELI5|plain\s+language|simple\s+analogy|everyday\s+analogy|one\s+sentence|key\s+relationships?|key\s+points?)\b/i,
      /生活里的比喻|日常类比|换个比喻|讲人话|讲简单点|说简单点|简单一点|通俗一点|一句(?:话)?结论|重新讲|重讲|只留.{0,16}(?:关键|关系|重点)|五岁小孩|简单类比/i,
    ],
  }),
  atom({
    id: "governing_design_source",
    patterns: [
      /\b(?:annotated\s+(?:mock|mockup|design)|supplied\s+(?:mockup|screenshot)|governing\s+(?:design|mock|reference)|high[-\s]?fidelity\s+(?:design|mockup)|Figma\s+(?:spec|mock|design)|DESIGN\.md|existing\s+screenshot.{0,24}design\s+system|(?:Linear|Apple)\s+style)\b/i,
      /(?:标注|批注)(?:设计稿|mock|原型)|高保真设计稿|(?:这张|给定|提供的|现有)?设计稿|(?:根据|按照|按).{0,8}截图|本轮(?:设计)?基准|作为基准的(?:截图|设计稿)|项目设计系统|现有截图.{0,24}(?:设计系统|design\s+system)|(?:Linear|Apple)\s*风格|明确设计源|设计稿.{0,16}为准/i,
    ],
  }),
  atom({
    id: "design_compare_align",
    patterns: [
      /\b(?:compare|align|review|assess|evaluate|reproduce|match)\b.{0,60}\b(?:screen|page|UI|spacing|hierarchy|states?|interaction|mockup|design)|\b(?:screen|page|UI)\b.{0,50}\b(?:against|with)\b.{0,24}\b(?:mockup|design|reference)\b|\b(?:screenshot|design\s+system)\b.{0,60}\b(?:before\s+)?(?:chang(?:e|ing)|edit(?:ing)?|redesign(?:ing)?)\b.{0,16}\b(?:UX|UI|page|screen)\b|\b(?:Linear|Apple)\s+style\b.{0,20}\b(?:design|redesign|change)\b.{0,16}\b(?:page|screen|UI|UX)\b/i,
      /(?:评审|对照|比对|还原|判断).{0,60}(?:页面|界面|层级|密度|交互|状态|设计稿|信息架构)|(?:评审|对齐).{0,16}(?:UI|UX).{0,16}(?:布局|层级|密度|交互|状态|信息架构)|还原\s*(?:UI|UX)|(?:页面|界面).{0,40}(?:对齐|还原|按.{0,16}(?:设计稿|截图|基准))|按.{0,16}设计稿.{0,16}(?:实现|设计|修改|调整).{0,12}(?:页面|界面)|(?:Linear|Apple)\s*风格.{0,12}(?:设计|修改|调整).{0,12}(?:页面|界面)|(?:截图|设计系统|design\s+system).{0,36}(?:为准)?.{0,20}(?:改|修改|调整|还原)\s*(?:UI|UX|页面|界面)|(?:列表页|页面|界面).{0,24}体验(?:怎么|如何)?(?:改|调整)|先看.{0,36}(?:设计稿|现有截图|设计系统)/i,
    ],
  }),
  atom({
    id: "design_source_precedence",
    patterns: [
      /\b(?:governing\s+reference|as\s+(?:the\s+)?baseline|as\s+(?:the\s+)?source\s+of\s+truth|annotations?\s+(?:win|override)|supplied\s+mockup)\b|\b(?:win|override)\b.{0,24}\bconflict/i,
      /以.{0,24}(?:稿子|设计稿|截图|标注|基准).{0,12}为准|冲突时.{0,24}(?:标注|设计稿|基准).{0,12}优先|不要用个人偏好|不按个人审美|本轮基准/i,
    ],
  }),
  atom({
    id: "local_worktree_state",
    patterns: [
      /\b(?:git\s+(?:status|diff|stage|commit|push)|(?:current|this)\s+worktree|dirty\s+worktree|worktree\s+changes?|unrelated\s+changes?|existing\s+(?:user\s+)?edits?|in[-\s]?progress\s+edits?|previous\s+(?:user|my)\s+(?:edits?|changes?)|staged|unstaged|commit\s+scope|(?:this|current|main|release|develop)\s+branch|current[-\s]?task\s+(?:diff|scope)|touch\s+the\s+(?:worktree|tree))\b/i,
      /git\s*(?:stage|commit|push)|脏工作区|当前工作区|检查工作区|工作区改动|用户已有(?:改动|脏改)|我之前的改动|之前的用户改动|无关改动|本任务(?:范围|\s*diff)|提交范围|暂存区|(?:当前|这个|main|release|develop)\s*(?:git\s*)?分支/i,
    ],
  }),
  atom({
    id: "workspace_mutation_intent",
    patterns: [
      /\b(?:continue\s+(?:editing|implementing|changing|fixing)|keep\s+(?:editing|implementing|changing|fixing)|touch\s+the\s+(?:worktree|tree)|update\s+(?:the\s+)?(?:current|this)\s+worktree|before\s+(?:editing|staging|commit(?:ting)?)|stage\s+(?:only\s+)?(?:the\s+)?(?:task|target)?\s*(?:files?|diff)|stage\s+(?:its|this|the|current[-\s]?task)\s+diff|commit\s+(?:the\s+)?changes?|push\s+(?:(?:the|this|current|main|release|develop)\s+)?branch|restore|reset|checkout|switch|rebase|stash)\b|^(?:please\s+)?push\b.{0,48}\b(?:to\s+)?(?:the\s+)?[a-z0-9._/-]+\s+branch\b/i,
      /继续(?:改|修改|实现|编辑|修|修复)|只(?:改|修改|编辑)|准备暂存|只\s*stage|执行暂存|git\s*(?:stage|commit|push)|提交这些改动|push.{0,12}(?:main|release|develop|当前|这个).{0,6}分支|推送(?:main|release|develop|当前|这个)?分支|把.{0,24}分支.{0,16}合并到|回滚.{0,16}(?:worktree|工作区|本任务\s*diff)|切换分支|变基|贮藏/i,
    ],
  }),
  atom({
    id: "task_change_isolation",
    patterns: [
      /\b(?:isolate|separate|distinguish)\b.{0,50}\b(?:task|unrelated|user(?:'s)?\s+edits?|changes?|files?)|\b(?:only|touch)\b.{0,32}\b(?:this\s+task|this\s+fix|latter|target\s+files?)\b/i,
      /(?:隔离|分开|区分).{0,40}(?:本任务|用户改动|无关改动|文件|diff)|只处理.{0,24}(?:本任务|这次修复)|只\s*stage.{0,24}(?:这次|目标)文件/i,
    ],
  }),
  atom({
    id: "dispatch_runtime_entity",
    patterns: [
      /\b(?:ai[-\s]?dispatch|aidispatch)\b/i,
    ],
  }),
  atom({
    id: "dispatch_development_action",
    patterns: [
      /\b(?:add|apply|build|implement|develop|modify|change|fix|debug|investigate|diagnose|repair|refactor|migrate|integrate|wire|upgrade|support|use|refactoring|migration|integration)\b/i,
      /\b(?:added|built|implemented|developed|modified|changed|fixed|debugged|refactored|migrated|integrated|wired|upgraded)\b/i,
      /(?:新增|增加|加上?|实现|实施|应用|落地|开发|修改|改一下|改造|修一下|修复|修好|调试|排障|定位|重构|迁移|接入|支持|升级|有\s*(?:bug|问题)|映射错误)/i,
      /\b(?:pre[-\s]?release|release)\s+(?:acceptance|validation)\b|(?:发布前|上线前).{0,12}(?:验收|验证)/i,
    ],
  }),
  atom({
    id: "dispatch_owned_runtime_subsystem",
    patterns: [
      dispatchPattern(String.raw`\b${DISPATCH_ACTION_EN}\b\s+(?:(?:the|a|an|new)\s+){0,2}${DISPATCH_ENTITY}\s*(?:['’]s|[:：])?\s*(?:(?:the|a|an|new|actual|existing|approved)\s+){0,2}${DISPATCH_SUBSYSTEM}\b`),
      dispatchPattern(String.raw`\b${DISPATCH_ACTION_EN}\b\s+${DISPATCH_ENTITY}\s*[?.!]\s*(?:its|the)\s+${DISPATCH_SUBSYSTEM}\b`),
      dispatchPattern(String.raw`\b${DISPATCH_ENTITY}\b\s*[?.!]\s*${DISPATCH_ACTION_EN}\b\s+(?:its|the)\s+${DISPATCH_SUBSYSTEM}\b`),
      dispatchPattern(String.raw`\b${DISPATCH_ACTION_EN}\b\s+(?:(?:the|a|an|new|actual|existing|approved)\s+){0,2}${DISPATCH_SUBSYSTEM}\s+(?:in|inside|within)\s+(?:the\s+)?${DISPATCH_ENTITY}\b`),
      dispatchPattern(String.raw`\b(?:in|inside|within)\s+(?:the\s+)?${DISPATCH_ENTITY}\b\s*[,，:]?\s*(?:we\s+)?${DISPATCH_ACTION_EN}\b\s*(?:(?:the|a|an|new)\s+){0,2}${DISPATCH_SUBSYSTEM}\b`),
      dispatchPattern(String.raw`\b${DISPATCH_ENTITY}\b\s*[:：]\s*${DISPATCH_ACTION_EN}\b\s+(?:(?:the|a|an|new|stable)\s+){0,3}${DISPATCH_SUBSYSTEM}\b`),
      dispatchPattern(String.raw`\b(?:make|let)\b.{0,12}\b${DISPATCH_ENTITY}\b\s+(?:support|add|use)\s+(?:(?:its|the|a|an|new)\s+){0,2}${DISPATCH_SUBSYSTEM}\b(?!\s+(?:to|for)\b)`),
      dispatchPattern(String.raw`\b(?:add|wire|integrate)\b.{0,32}\b(?:to|into)\s+${DISPATCH_ENTITY}\b.{0,24}\bby\s+(?:adding|wiring|integrating)\s+(?:(?:the|a|an|new)\s+)?${DISPATCH_SUBSYSTEM}\b`),
      dispatchPattern(String.raw`\b(?:debug|fix|investigate|diagnose)\b\s+(?:why\s+)?${DISPATCH_ENTITY}\b\s+(?:falls?|routes?|resolves?)\s+(?:through|via|to)\s+(?:the\s+)?${DISPATCH_SUBSYSTEM}\b`),
      dispatchPattern(String.raw`\b${DISPATCH_ACTION_EN}\b\s+(?:(?:the|a|an|new|broken)\s+){0,3}${DISPATCH_SUBSYSTEM}\s*\(\s*(?:in|inside|within)\s+(?:the\s+)?${DISPATCH_ENTITY}\s*\)`),
      dispatchPattern(String.raw`\b${DISPATCH_SUBSYSTEM}\s*\(\s*(?:in|inside|within)\s+(?:the\s+)?${DISPATCH_ENTITY}\s*\)\s+(?:(?:is|looks?)\s+)?${DISPATCH_FAILURE_EN}\b[^.!?。！？\n]{0,56}\b${DISPATCH_REMEDIATION_EN}\b(?:\s+and\s+${DISPATCH_REMEDIATION_EN}\b)?\s+(?:it|that|this)\b`),
      dispatchPattern(String.raw`\b${DISPATCH_ENTITY}\b\s*(?:['’]s\s*)?${DISPATCH_SUBSYSTEM}\s+(?:(?:is|keeps?|has)\s+)?${DISPATCH_FAILURE_EN}\b[^.!?。！？\n]{0,56}\b${DISPATCH_REMEDIATION_EN}\b(?:\s+and\s+${DISPATCH_REMEDIATION_EN}\b)?\s+(?:it|that|this|the\s+${DISPATCH_SUBSYSTEM})\b`),
      dispatchPattern(String.raw`\b${DISPATCH_SUBSYSTEM}\s+(?:in|inside|within)\s+(?:the\s+)?${DISPATCH_ENTITY}\b\s+(?:(?:is|looks?)\s+)?${DISPATCH_FAILURE_EN}\b[^.!?。！？\n]{0,56}\b${DISPATCH_REMEDIATION_EN}\b(?:\s+and\s+${DISPATCH_REMEDIATION_EN}\b)?\s+(?:it|that|this|the\s+${DISPATCH_SUBSYSTEM})\b`),
      dispatchPattern(String.raw`\b${DISPATCH_ENTITY}\b\s*(?:['’]s\s*)?${DISPATCH_SUBSYSTEM}\s+(?:(?:is|keeps?|has)\s+)?${DISPATCH_FAILURE_EN}\b\s*[.!?]\s*(?:please\s+)?(?:${DISPATCH_REMEDIATION_EN})(?:\s+and\s+${DISPATCH_REMEDIATION_EN})?\s+(?:it|that|this)\b`),
      dispatchPattern(String.raw`\b${DISPATCH_SUBSYSTEM}\s+(?:in|inside|within)\s+(?:the\s+)?${DISPATCH_ENTITY}\b\s+(?:(?:is|looks?)\s+)?${DISPATCH_FAILURE_EN}\b\s*[.!?]\s*(?:please\s+)?(?:${DISPATCH_REMEDIATION_EN})(?:\s+and\s+${DISPATCH_REMEDIATION_EN})?\s+(?:it|that|this)\b`),
      dispatchPattern(String.raw`\b${DISPATCH_ENTITY}\b\s+(?:needs?|should|must|will)\s+(?:to\s+)?${DISPATCH_ACTION_EN}\b\s*(?:(?:its|the|a|an|new)\s+){0,2}${DISPATCH_SUBSYSTEM}\b`),
      dispatchPattern(String.raw`\b${DISPATCH_ENTITY}\b\s*(?:['’]s\s*)${DISPATCH_SUBSYSTEM}\s+(?:needs?|requires?)\s+(?:to\s+be\s+)?(?:fix(?:ing|ed)?|refactor(?:ing|ed)?|chang(?:ing|ed)|updat(?:ing|ed)|migrat(?:ing|ed))\b`),
      dispatchPattern(String.raw`\b${DISPATCH_SUBSYSTEM}\s+(?:in|inside|within)\s+(?:the\s+)?${DISPATCH_ENTITY}\b\s+(?:needs?|should|must)\s+(?:to\s+)?be\s+${DISPATCH_PARTICIPLE_EN}\b`),
      dispatchPattern(String.raw`\b(?:(?:the|a|an|new)\s+){0,2}${DISPATCH_SUBSYSTEM}\s+(?:needs?|should|must)\s+(?:to\s+)?be\s+${DISPATCH_PARTICIPLE_EN}\s+(?:in|into|to|inside|within)\s+(?:the\s+)?${DISPATCH_ENTITY}\b`),
      dispatchPattern(String.raw`\b(?:pre[-\s]?release|release)\s+(?:acceptance|validation)\b.{0,32}\b(?:of|for)\s+${DISPATCH_ENTITY}\b\s*(?:['’]s\s*)?${DISPATCH_SUBSYSTEM}\b`),
      dispatchPattern(String.raw`\b(?:review|assess|plan)\b[^.!?。！？\n]{0,64}(?:(?:(?:proposed|approved)\s+)?(?:repair|fix|change|migration|plan)\b[^.!?。！？\n]{0,40}\b(?:for|to|of)\s+(?:the\s+)?${DISPATCH_ENTITY}\b\s*(?:['’]s\s*)?${DISPATCH_SUBSYSTEM}\b|${DISPATCH_ENTITY}\b\s*(?:['’]s\s*)?${DISPATCH_SUBSYSTEM}\b[^.!?。！？\n]{0,32}(?:repair|fix|change|migration)(?:\s+(?:proposal|plan))?)[^.!?。！？\n]{0,80}\b(?:then|and\s+then)\s+(?:apply|implement|make)\s+(?:the\s+)?(?:approved|that|this)\s+(?:change|fix|repair|plan)\b`),
      dispatchPattern(String.raw`${DISPATCH_ACTION_ZH}\s*(?:一下|这个|一下这个)?\s*${DISPATCH_ENTITY}\s*(?:(?:的|里(?:的)?|中(?:的)?|内(?:的)?)|[:：])?\s*(?:这个|新的?|一个)?\s*${DISPATCH_SUBSYSTEM}`),
      dispatchPattern(String.raw`(?:给|让)\s*${DISPATCH_ENTITY}\s*${DISPATCH_ACTION_ZH}\s*(?:(?:一个|新的?)\s*){0,2}(?:(?:[a-z0-9._+-]+(?:-compatible)?)\s+){0,2}${DISPATCH_SUBSYSTEM}`),
      dispatchPattern(String.raw`在\s*${DISPATCH_ENTITY}\s*(?:中|里|内|里面)\s*[,，]?\s*(?:${DISPATCH_ACTION_ZH}\s*(?:(?:一个|新的?)\s*){0,2}${DISPATCH_SUBSYSTEM}|(?:把|将)\s*${DISPATCH_SUBSYSTEM}\s*${DISPATCH_ACTION_ZH})`),
      dispatchPattern(String.raw`${DISPATCH_ENTITY}\s*[。.!?！？]\s*(?:把|将)?\s*(?:它|其)(?:的)?\s*${DISPATCH_SUBSYSTEM}\s*${DISPATCH_ACTION_ZH}`),
      dispatchPattern(String.raw`(?:把|将)\s*${DISPATCH_ENTITY}\s*(?:(?:的|里(?:的)?|中(?:的)?|内(?:的)?)|[:：])?\s*${DISPATCH_SUBSYSTEM}\s*${DISPATCH_ACTION_ZH}`),
      dispatchPattern(String.raw`${DISPATCH_ENTITY}\s*(?:(?:的|里(?:的)?|中(?:的)?|内(?:的)?)|[:：])?\s*${DISPATCH_SUBSYSTEM}[^。.!?！？\n]{0,24}${DISPATCH_FAILURE_ZH}[^。.!?！？\n]{0,56}(?:(?:帮我|请)\s*${DISPATCH_REMEDIATION_ZH}(?:一下)?|${DISPATCH_REMEDIATION_ZH}(?:(?:并|再)\s*${DISPATCH_REMEDIATION_ZH})?\s*(?:它|这个(?:问题|模块|适配器|解析器|运行时)))`),
      dispatchPattern(String.raw`${DISPATCH_ENTITY}\s*(?:(?:的|里(?:的)?|中(?:的)?|内(?:的)?)|[:：])?\s*${DISPATCH_SUBSYSTEM}[^。.!?！？\n]{0,24}(?:需要|应该|要)\s*${DISPATCH_ACTION_ZH}`),
      dispatchPattern(String.raw`${DISPATCH_ENTITY}\s*(?:(?:的|里(?:的)?|中(?:的)?|内(?:的)?)|[:：])?\s*${DISPATCH_SUBSYSTEM}[^。.!?！？\n]{0,24}${DISPATCH_FAILURE_ZH}\s*[。.!]\s*(?:帮我|请)?\s*${DISPATCH_REMEDIATION_ZH}\s*(?:它|这个(?:问题|模块|适配器|解析器|运行时))`),
      dispatchPattern(String.raw`${DISPATCH_ENTITY}\s*(?:要|需要|将|应该)\s*${DISPATCH_ACTION_ZH}\s*(?:一个|新的?)?\s*${DISPATCH_SUBSYSTEM}`),
      dispatchPattern(String.raw`(?:改|修改)(?:的)?是\s*${DISPATCH_ENTITY}[^。.!?！？]{0,32}不是(?:调用|使用)[^。.!?！？]{0,24}${DISPATCH_SUBSYSTEM}[^。.!?！？]{0,20}(?:要|需要|应该)\s*${DISPATCH_ACTION_ZH}`),
      dispatchPattern(String.raw`(?:发布前|上线前).{0,12}(?:验收|验证).{0,24}${DISPATCH_ENTITY}\s*(?:(?:的|里(?:的)?|中(?:的)?|内(?:的)?)|[:：])?\s*${DISPATCH_SUBSYSTEM}`),
      dispatchPattern(String.raw`(?:评审|审查|规划).{0,64}${DISPATCH_ENTITY}\s*(?:(?:的|里(?:的)?|中(?:的)?|内(?:的)?)|[:：])?\s*${DISPATCH_SUBSYSTEM}[^。.!?！？\n]{0,32}(?:修复|修改|变更|迁移)(?:方案|计划)?[^。.!?！？\n]{0,80}(?:随后|然后|接着|再)[^。.!?！？\n]{0,20}(?:应用|实施|实现|落地|修改)\s*(?:该|这个|上述)(?:修改|修复|变更|方案)`),
      dispatchPattern(String.raw`(?:^|[\n;；{,]\s*)(?=[\s\S]{0,260}["']?target["']?\s*(?::|=|\bis\b)\s*["']?${DISPATCH_ENTITY}\b)(?=[\s\S]{0,260}["']?component["']?\s*(?::|=|\bis\b)\s*["']?${DISPATCH_SUBSYSTEM}\b)(?=[\s\S]{0,260}(?:["']?action["']?\s*(?::|=|\bis\b)\s*["']?${DISPATCH_ACTION_EN}\b|\b${DISPATCH_ACTION_EN}\b\s+(?:it|that|this)\b))[\s\S]{1,260}`),
      dispatchPattern(String.raw`(?:^|[\n;；])\s*target\s*[:=]\s*${DISPATCH_ENTITY}\b[^\n;；]{0,80}(?:[\n;；]\s*component\s*[:=]\s*${DISPATCH_SUBSYSTEM}\b)[\s\S]{0,120}(?:[\n;；]\s*action\s*[:=]\s*${DISPATCH_ACTION_EN}\b)`),
      dispatchPattern(String.raw`(?:^|\n)\s*target\s*[:=]\s*${DISPATCH_ENTITY}\b\s*(?:['’]s\s*)?${DISPATCH_SUBSYSTEM}\b[\s\S]{0,220}\b${DISPATCH_ACTION_EN}\b`),
    ],
  }),
]);

export const SEMANTIC_SIGNAL_COMPOSITIONS: readonly Readonly<SemanticSignalComposition>[] = Object.freeze([
  composition({ signalId: "single_truth_version", allOf: ["legacy_fact_path", "retire_or_converge", "single_authority"], replaceDirectPatterns: false }),
  composition({ signalId: "single_truth_version", allOf: ["legacy_fact_path", "retire_or_converge", "migration_complete", "no_dependent_consumer"], maxSegmentGap: 2, replaceDirectPatterns: false }),
  composition({ signalId: "goal_execute", allOf: ["agent_goal_container", "direct_execution", "closure_evidence"], replaceDirectPatterns: false }),
  composition({ signalId: "information_design", allOf: ["user_output_surface", "decision_first", "defer_diagnostics"], replaceDirectPatterns: false }),
  composition({ signalId: "information_design", allOf: ["user_output_surface", "decision_first", "hierarchy_overload"], maxSegmentGap: 2, replaceDirectPatterns: false }),
  composition({ signalId: "ui_delivery_work", allOf: ["ui_product_surface", "real_service_data", "real_user_path_validation"], replaceDirectPatterns: false }),
  composition({ signalId: "delivery_gate", allOf: ["readiness_decision", "delivery_layers", "fresh_delivery_evidence"], replaceDirectPatterns: false }),
  composition({ signalId: "delivery_gate", allOf: ["readiness_decision", "delivery_layers"], replaceDirectPatterns: false }),
  composition({ signalId: "delivery_gate", allOf: ["readiness_decision", "fresh_delivery_evidence"], replaceDirectPatterns: false }),
  composition({ signalId: "failure_triage", allOf: ["failure_observation", "tool_environment_boundary", "triage_across_layers"], replaceDirectPatterns: false }),
  composition({ signalId: "retrieval_engine_architecture", allOf: ["retrieval_symptom", "retrieval_pipeline_stage", "retrieval_stage_diagnosis"], replaceDirectPatterns: false }),
  composition({ signalId: "source_truth_chain", allOf: ["source_reconciliation", "requirement_design_source", "runtime_implementation_evidence"], replaceDirectPatterns: false }),
  composition({ signalId: "architecture_quality", allOf: ["trace_execution_path", "consumer_deployment_facts", "final_boundary_choice"], replaceDirectPatterns: false }),
  composition({ signalId: "architecture_quality", allOf: ["trace_execution_path", "final_boundary_choice"], replaceDirectPatterns: false }),
  composition({ signalId: "high_risk_action", allOf: ["irreversible_operation", "authorization_stop_boundary"] }),
  composition({ signalId: "high_risk_authorized", allOf: ["irreversible_operation", "user_imperative_authorization"], replaceDirectPatterns: false }),
  composition({ signalId: "overengineering_review", allOf: ["specific_change_review", "structural_complexity", "present_justification"], maxSegmentGap: 2, replaceDirectPatterns: false }),
  composition({ signalId: "temporary_mock_boundary", allOf: ["substitute_implementation", "prototype_exit_boundary", "real_proof_boundary"] }),
  composition({ signalId: "temporary_mock_boundary", allOf: ["substitute_implementation", "real_proof_boundary"] }),
  composition({
    signalId: "external_model_review",
    allOf: ["multiple_model_reviewers", "independent_model_review", "review_source_bundle", "primary_adjudication"],
    maxSegmentGap: 2,
    replaceDirectPatterns: false,
  }),
  composition({ signalId: "rule_governance", allOf: ["agent_entry_rule_entity", "rule_governance_intent", "rule_layer_problem"], replaceDirectPatterns: false }),
  composition({ signalId: "comprehension_failure", allOf: ["stated_non_understanding", "explanation_repair_request"], replaceDirectPatterns: false }),
  composition({ signalId: "design_source_alignment", allOf: ["governing_design_source", "design_compare_align", "design_source_precedence"] }),
  composition({ signalId: "design_source_alignment", allOf: ["governing_design_source", "design_compare_align"] }),
  composition({ signalId: "design_source_alignment", allOf: ["ui_product_surface", "design_compare_align"] }),
  composition({ signalId: "worktree_diff_operation", allOf: ["local_worktree_state", "workspace_mutation_intent"] }),
  composition({ signalId: "worktree_diff_operation", allOf: ["local_worktree_state", "workspace_mutation_intent", "task_change_isolation"] }),
  composition({
    signalId: "dispatch_runtime_development",
    allOf: ["dispatch_runtime_entity", "dispatch_development_action", "dispatch_owned_runtime_subsystem"],
    maxSpan: 280,
    maxSegmentGap: 2,
    replaceDirectPatterns: true,
  }),
]);

const ATOM_BY_ID = new Map<string, Readonly<SemanticAtomDefinition>>();
for (const definition of SEMANTIC_ATOMS) {
  if (ATOM_BY_ID.has(definition.id)) throw new Error(`duplicate semantic atom: ${definition.id}`);
  ATOM_BY_ID.set(definition.id, definition);
}
for (const item of SEMANTIC_SIGNAL_COMPOSITIONS) {
  for (const atomId of item.allOf) {
    if (!ATOM_BY_ID.has(atomId)) throw new Error(`unknown semantic atom ${atomId} in ${item.signalId}`);
  }
}

export function listSemanticSignalCompositions(signalId?: string): Readonly<SemanticSignalComposition>[] {
  return SEMANTIC_SIGNAL_COMPOSITIONS.filter((item) => !signalId || item.signalId === signalId);
}

export function semanticSignalReplacesDirectPatterns(signalId: string): boolean {
  const items = listSemanticSignalCompositions(signalId);
  return items.length > 0 && items.every((item) => item.replaceDirectPatterns);
}

export function matchSemanticSignalComposition(signalId: string, text: unknown): SemanticCompositionMatch | null {
  const value = String(text || "");
  for (const item of listSemanticSignalCompositions(signalId)) {
    const match = matchComposition(item, value);
    if (match) return match;
  }
  return null;
}

export function matchesSemanticAtom(atomId: string, text: unknown): boolean {
  const definition = ATOM_BY_ID.get(atomId);
  return Boolean(definition && atomRanges(definition, String(text || "")).length);
}

interface EvidenceRange {
  atomId: string;
  start: number;
  end: number;
  segment: number;
}

function matchComposition(item: Readonly<SemanticSignalComposition>, value: string): SemanticCompositionMatch | null {
  const segments = sentenceSegments(value);
  const candidates = item.allOf.map((atomId) => {
    const definition = ATOM_BY_ID.get(atomId)!;
    return atomRanges(definition, value)
      .slice(0, 24)
      .map((range) => ({ ...range, atomId, segment: segmentForOffset(segments, range.start) }));
  });
  if (candidates.some((ranges) => !ranges.length)) return null;
  return findBoundedMatch(item, candidates, 0, []);
}

function findBoundedMatch(
  item: Readonly<SemanticSignalComposition>,
  candidates: EvidenceRange[][],
  index: number,
  picked: EvidenceRange[],
): SemanticCompositionMatch | null {
  if (index >= candidates.length) {
    const start = Math.min(...picked.map((item) => item.start));
    const end = Math.max(...picked.map((item) => item.end));
    const segmentStart = Math.min(...picked.map((item) => item.segment));
    const segmentEnd = Math.max(...picked.map((item) => item.segment));
    if (end - start > item.maxSpan || segmentEnd - segmentStart > item.maxSegmentGap) return null;
    return {
      signalId: item.signalId,
      atomIds: [...item.allOf],
      span: { start, end },
      segmentRange: { start: segmentStart, end: segmentEnd },
    };
  }
  for (const candidate of candidates[index]) {
    const next = [...picked, candidate];
    const start = Math.min(...next.map((item) => item.start));
    const end = Math.max(...next.map((item) => item.end));
    const segmentStart = Math.min(...next.map((item) => item.segment));
    const segmentEnd = Math.max(...next.map((item) => item.segment));
    if (end - start > item.maxSpan || segmentEnd - segmentStart > item.maxSegmentGap) continue;
    const match = findBoundedMatch(item, candidates, index + 1, next);
    if (match) return match;
  }
  return null;
}

function atomRanges(definition: Readonly<SemanticAtomDefinition>, value: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const pattern of definition.patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const matcher = new RegExp(pattern.source, flags);
    for (const match of value.matchAll(matcher)) {
      const start = match.index ?? -1;
      if (start < 0 || !match[0]) continue;
      ranges.push({ start, end: start + match[0].length });
    }
  }
  return ranges.sort((left, right) => left.start - right.start || left.end - right.end);
}

function sentenceSegments(value: string): Array<{ start: number; end: number }> {
  const segments: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (const match of value.matchAll(/[\n。.!?？；;]+/g)) {
    const end = (match.index ?? start) + match[0].length;
    if (end > start) segments.push({ start, end });
    start = end;
  }
  if (start < value.length || !segments.length) segments.push({ start, end: value.length });
  return segments;
}

function segmentForOffset(segments: Array<{ start: number; end: number }>, offset: number): number {
  const index = segments.findIndex((segment) => offset >= segment.start && offset < segment.end);
  return index >= 0 ? index : Math.max(segments.length - 1, 0);
}
