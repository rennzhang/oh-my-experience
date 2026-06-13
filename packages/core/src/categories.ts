import { CategoryRecordSchema, DEFAULT_CATEGORY, type CategoryRecord } from "./schema.js";
import { layout, nowIso, operationLog, readJson, writeJsonAtomic } from "./storage.js";
import { inspectCards } from "./cards.js";

interface CategoryIndex {
  version: 1;
  updatedAt: string;
  categories: CategoryRecord[];
}

const KNOWN_CATEGORIES = [
  "开源 Skill 经验蒸馏",
  "经验召回",
  "产品与 UI",
  "前端工程",
  "后端与 API",
  "安全",
  "测试验收",
  "运行时与发布",
  "性能与观测",
  "文档与开源",
  DEFAULT_CATEGORY,
];

export function normalizeCategory(value: unknown): string {
  const text = String(value || "").trim();
  return text || DEFAULT_CATEGORY;
}

export function inferCategory(input: {
  title?: unknown;
  topics?: unknown;
  triggers?: unknown;
  summary?: unknown;
  rule?: unknown;
}): string {
  const terms = [
    input.title,
    arrayText(input.topics),
    arrayText(input.triggers),
    input.summary,
    input.rule,
  ].join(" ").toLowerCase();
  if (/(skill|docx|contract|email|邮件|合同|开源)/i.test(terms)) return "开源 Skill 经验蒸馏";
  if (/(recall|retrieval|hook|经验|召回)/i.test(terms)) return "经验召回";
  if (/(ui|ux|产品|界面|页面|交互|console|design)/i.test(terms)) return "产品与 UI";
  if (/(frontend|react|form|css|browser|responsive|前端|表单|浏览器|响应式)/i.test(terms)) return "前端工程";
  if (/(api|backend|server|database|后端|接口|数据库)/i.test(terms)) return "后端与 API";
  if (/(security|auth|secret|permission|安全|权限|隐私|密钥)/i.test(terms)) return "安全";
  if (/(test|e2e|playwright|验收|测试|冒烟)/i.test(terms)) return "测试验收";
  if (/(deploy|runtime|publish|package|git|运行时|发布|部署|打包)/i.test(terms)) return "运行时与发布";
  if (/(performance|latency|stats|observability|性能|观测|统计)/i.test(terms)) return "性能与观测";
  if (/(docs|readme|roadmap|文档|开源)/i.test(terms)) return "文档与开源";
  return DEFAULT_CATEGORY;
}

export function listCategories(dataDir: string): CategoryRecord[] {
  const byName = new Map<string, CategoryRecord>();
  const now = nowIso();
  for (const name of KNOWN_CATEGORIES) {
    byName.set(name, CategoryRecordSchema.parse({ name, source: "manual", count: 0, createdAt: now, updatedAt: now }));
  }
  for (const category of readCategoryIndex(dataDir).categories) byName.set(category.name, category);
  for (const card of inspectCards(dataDir).cards) {
    const name = normalizeCategory(card.category);
    const current = byName.get(name) || CategoryRecordSchema.parse({ name, source: "card", count: 0, createdAt: now, updatedAt: now });
    byName.set(name, { ...current, source: current.source === "manual" ? "manual" : "card", count: current.count + 1 });
  }
  return Array.from(byName.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
}

export function createCategory(dataDir: string, input: { name?: unknown; description?: unknown }): CategoryRecord {
  const now = nowIso();
  const name = normalizeCategory(input.name);
  const categories = readCategoryIndex(dataDir).categories;
  const existing = categories.find((category) => category.name === name);
  const next = CategoryRecordSchema.parse({
    ...(existing || {}),
    name,
    description: String(input.description || existing?.description || ""),
    source: "manual",
    count: existing?.count || 0,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  writeCategoryIndex(dataDir, [...categories.filter((category) => category.name !== name), next]);
  operationLog(dataDir, "category.write", { name });
  return next;
}

function readCategoryIndex(dataDir: string): CategoryIndex {
  return readJson<CategoryIndex>(layout(dataDir).categoryIndex, { version: 1, updatedAt: nowIso(), categories: [] });
}

function writeCategoryIndex(dataDir: string, categories: CategoryRecord[]): void {
  writeJsonAtomic(layout(dataDir).categoryIndex, { version: 1, updatedAt: nowIso(), categories }, dataDir);
}

function arrayText(value: unknown): string {
  return Array.isArray(value) ? value.join(" ") : String(value || "");
}
