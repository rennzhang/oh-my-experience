import type { CardIndexEntry } from "./cards.js";
import type { ExperienceCard, RetrospectiveCandidate } from "./schema.js";
import { tokenize } from "./matcher.js";

export interface SimilaritySubject {
  id?: string;
  title?: string;
  category?: string;
  triggers?: string[];
  negativeTriggers?: string[];
  topics?: string[];
  summary?: string;
  rule?: string;
  body?: string;
}

export interface SimilarCardHint {
  id: string;
  title: string;
  score: number;
  reason: string;
}

export const SIMILAR_CARD_THRESHOLD = 52;

export function cardSimilarity(
  left: SimilaritySubject,
  right: SimilaritySubject,
): { score: number; reason: string } {
  const title = jaccard(tokens(left.title), tokens(right.title));
  const routing = jaccard(routingTokens(left), routingTokens(right));
  const lesson = jaccard(lessonTokens(left), lessonTokens(right));
  const triggerOverlap = directOverlap(left.triggers || [], right.triggers || []);
  const topicOverlap = directOverlap(left.topics || [], right.topics || []);
  const sameCategory = normalize(left.category) && normalize(left.category) === normalize(right.category) ? 0.08 : 0;
  const score = round(Math.min(1, title * 0.3 + routing * 0.34 + lesson * 0.14 + triggerOverlap * 0.22 + topicOverlap * 0.1 + sameCategory) * 100);
  const reason = score >= SIMILAR_CARD_THRESHOLD
    ? "标题、触发词或主题高度接近"
    : "标题、触发词或主题有部分重叠";
  return { score, reason };
}

export function isSimilarCard(left: SimilaritySubject, right: SimilaritySubject, threshold = SIMILAR_CARD_THRESHOLD): boolean {
  return cardSimilarity(left, right).score >= threshold;
}

export function findSimilarCards(
  subject: SimilaritySubject,
  cards: Array<CardIndexEntry | ExperienceCard>,
  { limit = 3, threshold = SIMILAR_CARD_THRESHOLD }: { limit?: number; threshold?: number } = {},
): SimilarCardHint[] {
  return cards
    .filter((card) => card.id !== subject.id)
    .map((card) => ({ card, similarity: cardSimilarity(subject, normalizeCardLike(card)) }))
    .filter((item) => item.similarity.score >= threshold)
    .sort((a, b) => b.similarity.score - a.similarity.score || a.card.id.localeCompare(b.card.id))
    .slice(0, limit)
    .map(({ card, similarity }) => ({
      id: card.id,
      title: card.title,
      score: similarity.score,
      reason: similarity.reason,
    }));
}

export function candidateSimilaritySubject(candidate: RetrospectiveCandidate | SimilaritySubject): SimilaritySubject {
  return {
    id: candidate.id,
    title: candidate.title,
    category: candidate.category,
    triggers: candidate.triggers || [],
    negativeTriggers: candidate.negativeTriggers || [],
    topics: candidate.topics || [],
    summary: candidate.summary,
    rule: candidate.rule,
    body: [candidate.summary, candidate.rule].filter(Boolean).join("\n"),
  };
}

function normalizeCardLike(card: CardIndexEntry | ExperienceCard): SimilaritySubject {
  return {
    id: card.id,
    title: card.title,
    category: card.category,
    triggers: card.triggers || [],
    negativeTriggers: card.negativeTriggers || [],
    topics: card.topics || [],
    summary: "summary" in card ? card.summary : undefined,
    rule: "rule" in card ? card.rule : undefined,
    body: "body" in card ? card.body : undefined,
  };
}

function routingTokens(subject: SimilaritySubject): string[] {
  return unique([
    ...(subject.triggers || []).flatMap(tokens),
    ...(subject.topics || []).flatMap(tokens),
    ...tokens(subject.category),
  ]);
}

function lessonTokens(subject: SimilaritySubject): string[] {
  return unique([
    ...tokens(subject.summary),
    ...tokens(subject.rule),
    ...tokens(subject.body),
  ]).slice(0, 120);
}

function tokens(value: unknown): string[] {
  return tokenize(String(value || ""));
}

function jaccard(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function normalize(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function directOverlap(left: string[], right: string[]): number {
  const a = new Set(left.map(normalize).filter(Boolean));
  const b = new Set(right.map(normalize).filter(Boolean));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const item of a) {
    if (b.has(item)) hit += 1;
  }
  return hit / Math.min(a.size, b.size);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
