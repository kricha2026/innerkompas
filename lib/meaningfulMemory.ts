/**
 * ─── MEANINGFUL MEMORY (emotional-precision layer) ───
 *
 * One focused memory-quality upgrade combining three concerns into ONE clean
 * system, per product spec:
 *   • Save Big Moments
 *   • Remember My Name
 *   • Fine Tune Style
 *
 * Design principles (from spec):
 *   1. Save ONLY high-value signals (not clutter).
 *   2. Remember user identity naturally (name, self-chosen assistant name).
 *   3. Track fine-grained communication-style preferences with repeated evidence.
 *   4. Track emotional-precision signals: what opens/what breaks resonance.
 *   5. Surface memories subtly (no data dumps).
 *   6. Ranking + freshness so memory stays high-quality (decay noise).
 *   7. Do NOT regress current directness/continuity/sharpness gains.
 *
 * This module is lightweight on purpose:
 *   • No new DB tables (uses `ik_client_status.meaningful_memory` JSONB column).
 *   • No new edge function.
 *   • No UI changes.
 *   • Retrieval flows through the existing `analysisMemory` channel.
 */

import type { ChatMessage, Session } from '@/lib/types';

// ═══════════════════════════════════════════════════════════════════
// ─── TYPES ───
// ═══════════════════════════════════════════════════════════════════

export type MomentKind =
  | 'resonance_opening'     // wording that clearly opened/relieved/landed
  | 'resonance_break'       // wording that felt generic/off/flat
  | 'breakthrough'          // recurring realization, aha, core insight
  | 'identity_symbol'       // a name, word, image or symbol that emerged relationally
  | 'trust_marker'          // moment that built trust/continuity
  | 'working_preference';   // explicit preference about how to be worked with

export interface MeaningfulMoment {
  kind: MomentKind;
  /** Short paraphrased description — never a verbatim user quote unless tiny. */
  text: string;
  /** 0..1 — emotional/structural weight at capture. Higher = stronger signal. */
  weight: number;
  /** How often this moment (or a near-duplicate) has been confirmed across turns/sessions. */
  confirmations: number;
  /** ISO timestamp of first detection. */
  createdAt: string;
  /** ISO timestamp of most recent confirmation or detection. */
  lastSeenAt: string;
}

/**
 * Fine-tuned style model. All scores are -1..+1 (evidence-weighted).
 * Positive = user leans toward this pole. Negative = user leans away.
 * Only use values where |score| >= 0.3 — below that is noise.
 */
export interface RefinedStyle {
  directVsGentle: number;               // +1 direct, -1 gentle
  conciseVsDeeper: number;              // +1 concise, -1 deeper/elaborate
  analyticalVsEmotional: number;        // +1 analytical entry, -1 emotional entry
  challengeVsSoftness: number;          // +1 wants challenge, -1 wants softness
  sensitivityToGeneric: number;         // +1 high sensitivity to generic language
  valuesPrecisionResonance: number;     // +1 values precision/resonance/authenticity
  warmthWithoutFluff: number;           // +1 warmth-without-fluff preference
  systemLevelThinking: number;          // +1 likes system-level thinking
}

export interface MeaningfulMemory {
  /** User's preferred name / actual name if shared. Null if never shared. */
  preferredName: string | null;
  /**
   * Assistant's relationally established role name / identity (if one emerged
   * naturally in conversation with THIS user). NOT a generic label.
   */
  assistantRoleName: string | null;
  refinedStyle: RefinedStyle;
  /** Ranked, deduped, capped list of meaningful moments. */
  moments: MeaningfulMoment[];
  /** Version marker for schema migrations. */
  version: 1;
}

// Per-turn detection output — candidates to be merged at session end.
export interface MeaningfulCandidate {
  kind: MomentKind;
  text: string;
  weight: number;
}

// ═══════════════════════════════════════════════════════════════════
// ─── DEFAULTS / HELPERS ───
// ═══════════════════════════════════════════════════════════════════

export function emptyRefinedStyle(): RefinedStyle {
  return {
    directVsGentle: 0,
    conciseVsDeeper: 0,
    analyticalVsEmotional: 0,
    challengeVsSoftness: 0,
    sensitivityToGeneric: 0,
    valuesPrecisionResonance: 0,
    warmthWithoutFluff: 0,
    systemLevelThinking: 0,
  };
}

export function emptyMeaningfulMemory(): MeaningfulMemory {
  return {
    preferredName: null,
    assistantRoleName: null,
    refinedStyle: emptyRefinedStyle(),
    moments: [],
    version: 1,
  };
}

/** Defensive loader — accepts any jsonb shape, returns valid memory. */
export function normalizeMeaningfulMemory(raw: any): MeaningfulMemory {
  const base = emptyMeaningfulMemory();
  if (!raw || typeof raw !== 'object') return base;

  if (typeof raw.preferredName === 'string' && raw.preferredName.trim().length > 0) {
    base.preferredName = raw.preferredName.trim().slice(0, 60);
  }
  if (typeof raw.assistantRoleName === 'string' && raw.assistantRoleName.trim().length > 0) {
    base.assistantRoleName = raw.assistantRoleName.trim().slice(0, 60);
  }
  if (raw.refinedStyle && typeof raw.refinedStyle === 'object') {
    for (const k of Object.keys(base.refinedStyle) as (keyof RefinedStyle)[]) {
      const v = (raw.refinedStyle as any)[k];
      if (typeof v === 'number' && isFinite(v)) {
        base.refinedStyle[k] = clamp(v, -1, 1);
      }
    }
  }
  if (Array.isArray(raw.moments)) {
    for (const m of raw.moments) {
      if (!m || typeof m !== 'object') continue;
      const kind = m.kind;
      const text = typeof m.text === 'string' ? m.text.trim() : '';
      if (!VALID_KINDS.has(kind) || text.length === 0) continue;
      base.moments.push({
        kind,
        text: text.slice(0, 220),
        weight: clamp(numOr(m.weight, 0.5), 0, 1),
        confirmations: Math.max(0, Math.floor(numOr(m.confirmations, 1))),
        createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
        lastSeenAt: typeof m.lastSeenAt === 'string' ? m.lastSeenAt : new Date().toISOString(),
      });
    }
  }
  return base;
}

const VALID_KINDS = new Set<MomentKind>([
  'resonance_opening',
  'resonance_break',
  'breakthrough',
  'identity_symbol',
  'trust_marker',
  'working_preference',
]);

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function numOr(v: any, d: number): number {
  return typeof v === 'number' && isFinite(v) ? v : d;
}

// ═══════════════════════════════════════════════════════════════════
// ─── PER-TURN DETECTION (lightweight, client-side) ───
// ═══════════════════════════════════════════════════════════════════
// These detectors run on every user message. They produce CANDIDATES only —
// nothing is persisted mid-session. Candidates are merged at session end,
// where dedup + confidence-gating + decay happen.

/** Detect a name the user shares for themselves. */
export function detectPreferredName(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  if (t.length === 0 || t.length > 240) return null;

  // Dutch + common English patterns, conservative to avoid false positives.
  const patterns: RegExp[] = [
    /\bik\s+(heet|ben)\s+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]{1,30})\b/,
    /\bnoem\s+me\s+(maar\s+)?([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]{1,30})\b/i,
    /\bmijn\s+naam\s+is\s+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]{1,30})\b/i,
    /\bmy\s+name\s+is\s+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]{1,30})\b/i,
    /\bcall\s+me\s+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]{1,30})\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const raw = m[m.length - 1];
      const name = raw.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'’\-]/g, '').trim();
      if (!name) continue;
      // Reject common non-name tokens
      const lower = name.toLowerCase();
      const reject = new Set([
        'gewoon','echt','moe','bang','boos','blij','stil','weg','hier','thuis',
        'goed','slecht','oké','oke','okay','ok','iemand','mezelf','niemand',
      ]);
      if (reject.has(lower)) continue;
      if (name.length < 2 || name.length > 30) continue;
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return null;
}

/**
 * Detect a relational name/role the USER gives to the assistant — e.g.
 * "ik noem jou X", "voor mij ben jij X". We only capture when the user
 * explicitly addresses the assistant with a self-chosen name.
 * Returns the assistant name or null.
 */
export function detectAssistantRoleName(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  if (t.length === 0) return null;

  const patterns: RegExp[] = [
    /\bik\s+noem\s+(je|jou|jij)\s+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]{1,30})\b/i,
    /\bvoor\s+mij\s+ben\s+(je|jij|jou)\s+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]{1,30})\b/i,
    /\bjij\s+bent\s+voor\s+mij\s+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]{1,30})\b/i,
    /\bjouw\s+naam\s+is\s+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]{1,30})\b/i,
    /\blaten\s+we\s+je\s+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]{1,30})\s+noemen\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const raw = m[m.length - 1];
      const name = raw.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'’\-]/g, '').trim();
      if (!name || name.length < 2 || name.length > 30) continue;
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return null;
}

/**
 * Detect explicit working-style preferences (stable, high-value).
 * Returns partial RefinedStyle deltas (each entry is a nudge, not a set).
 */
export function detectStyleSignals(text: string): Partial<RefinedStyle> {
  const out: Partial<RefinedStyle> = {};
  if (!text) return out;
  const t = text.toLowerCase();

  // direct vs gentle
  if (/\b(wees\s+direct|zeg\s+het\s+maar\s+gewoon|geen\s+omhaal|recht\s+voor\s+z'n\s+raap|niet\s+om\s+het\s+huis|cut\s+the\s+crap)\b/i.test(t)) {
    out.directVsGentle = (out.directVsGentle || 0) + 0.4;
  }
  if (/\b(liever\s+zacht|voorzichtig|rustiger|minder\s+hard|niet\s+zo\s+direct)\b/i.test(t)) {
    out.directVsGentle = (out.directVsGentle || 0) - 0.35;
  }
  // concise vs deeper
  if (/\b(kort\s+en\s+krachtig|korter|bondig|to\s+the\s+point|niet\s+zo\s+lang)\b/i.test(t)) {
    out.conciseVsDeeper = (out.conciseVsDeeper || 0) + 0.35;
  }
  if (/\b(ga\s+dieper|meer\s+diepte|uitdiepen|langer\s+stilstaan|diepgang)\b/i.test(t)) {
    out.conciseVsDeeper = (out.conciseVsDeeper || 0) - 0.35;
  }
  // analytical vs emotional
  if (/\b(analyseer|analytisch|rationeel|mechanisme|uitleg|psychologie|zenuwstelsel)\b/i.test(t)) {
    out.analyticalVsEmotional = (out.analyticalVsEmotional || 0) + 0.3;
  }
  if (/\b(ik\s+wil\s+voelen|eerst\s+voelen|niet\s+alleen\s+denken|emotie\s+eerst)\b/i.test(t)) {
    out.analyticalVsEmotional = (out.analyticalVsEmotional || 0) - 0.3;
  }
  // challenge vs softness
  if (/\b(daag\s+me\s+uit|scherp(er)?|confronterend|je\s+mag\s+tegengas|schud\s+me\s+wakker)\b/i.test(t)) {
    out.challengeVsSoftness = (out.challengeVsSoftness || 0) + 0.4;
  }
  if (/\b(niet\s+uitdagen|wees\s+zacht|ik\s+heb\s+rust\s+nodig|wees\s+voorzichtig)\b/i.test(t)) {
    out.challengeVsSoftness = (out.challengeVsSoftness || 0) - 0.4;
  }
  // sensitivity to generic language
  if (/\b(generiek|te\s+algemeen|wollig|wattig|zweverig|standaard\s+antwoord|clich[ée])\b/i.test(t)) {
    out.sensitivityToGeneric = (out.sensitivityToGeneric || 0) + 0.4;
  }
  // values precision / resonance / authenticity
  if (/\b(resonant|resonantie|echt(heid)?|authentiek|precies|nauwkeurig|klopt|landt)\b/i.test(t)) {
    out.valuesPrecisionResonance = (out.valuesPrecisionResonance || 0) + 0.35;
  }
  // warmth without fluff
  if (/\b(warm(te)?)\b/i.test(t) && /\b(geen\s+fluff|niet\s+wollig|niet\s+overdreven|niet\s+zoetsappig)\b/i.test(t)) {
    out.warmthWithoutFluff = (out.warmthWithoutFluff || 0) + 0.4;
  }
  // system-level thinking
  if (/\b(systeem|systemisch|patroon|verband|architectuur|dynamiek|mechanisme)\b/i.test(t)) {
    out.systemLevelThinking = (out.systemLevelThinking || 0) + 0.2;
  }

  // Clamp deltas
  for (const k of Object.keys(out) as (keyof RefinedStyle)[]) {
    out[k] = clamp(out[k]!, -0.6, 0.6);
  }
  return out;
}

/**
 * Detect resonance / rupture signals — what opened the user, what broke resonance.
 * Emits candidates (resonance_opening / resonance_break). Conservative.
 */
export function detectResonanceSignals(
  userText: string,
  lastAssistantText: string | null,
): MeaningfulCandidate[] {
  const out: MeaningfulCandidate[] = [];
  if (!userText) return out;
  const u = userText.toLowerCase().trim();
  if (u.length === 0) return out;

  // ── Opening signals ──
  const openingPatterns: RegExp[] = [
    /\b(precies|exact|dat\s+is\s+het|dat\s+klopt|dat\s+raakt|dat\s+landt|raak|kloppend|openend|afgestemd)\b/,
    /\b(je\s+snapt\s+(het|me)|je\s+begrijpt\s+(het|me)|je\s+ziet\s+(het|me))\b/,
    /\b(opluchting|opgelucht|dat\s+helpt\s+echt|nu\s+voel\s+ik\s+het|er\s+komt\s+ruimte)\b/,
    /\b(dat\s+is\s+mooi\s+gezegd|goed\s+gezien|goed\s+verwoord|scherp\s+gezien)\b/,
  ];
  if (openingPatterns.some((re) => re.test(u))) {
    const anchor = lastAssistantText
      ? `landde bij: "${shortSnippet(lastAssistantText)}"`
      : 'gebruiker bevestigde landing/resonantie';
    out.push({
      kind: 'resonance_opening',
      text: anchor,
      weight: 0.7,
    });
  }

  // ── Rupture signals — explicit rejection of a specific AI wording/approach ──
  const rupturePatterns: RegExp[] = [
    /\b(dat\s+klopt\s+niet|dat\s+is\s+te\s+(algemeen|generiek|wollig|zweverig))\b/,
    /\b(je\s+begrijpt\s+me\s+niet|je\s+luistert\s+niet|je\s+mist\s+het|je\s+zit\s+ernaast)\b/,
    /\b(dat\s+is\s+niet\s+wat\s+ik\s+bedoel|dat\s+voelt\s+flat|dat\s+voelt\s+leeg|dat\s+landt\s+niet)\b/,
    /\b(geen\s+clich[ée]s|niet\s+zo\s+standaard|standaard\s+antwoord|te\s+voorspelbaar)\b/,
  ];
  if (rupturePatterns.some((re) => re.test(u))) {
    const anchor = lastAssistantText
      ? `brak resonantie: "${shortSnippet(lastAssistantText)}"`
      : 'gebruiker markeerde verlies van afstemming';
    out.push({
      kind: 'resonance_break',
      text: anchor,
      weight: 0.75,
    });
  }

  return out;
}

/** Detect breakthrough / aha / recurring-realization signals. */
export function detectBreakthroughSignals(userText: string): MeaningfulCandidate[] {
  const out: MeaningfulCandidate[] = [];
  if (!userText) return out;
  const t = userText.toLowerCase();

  const ahaPatterns: RegExp[] = [
    /\b(nu\s+snap\s+ik|nu\s+zie\s+ik|het\s+kwartje\s+valt|het\s+valt\s+op\s+zijn\s+plek)\b/,
    /\b(ineens\s+snap\s+ik|opeens\s+zie\s+ik|dit\s+is\s+de\s+kern|dit\s+is\s+het\s+echte)\b/,
    /\b(dat\s+had\s+ik\s+nog\s+nooit\s+(zo\s+)?gezien|dit\s+verandert\s+iets)\b/,
  ];
  if (ahaPatterns.some((re) => re.test(t))) {
    const snippet = shortSnippet(userText);
    out.push({
      kind: 'breakthrough',
      text: snippet,
      weight: 0.85,
    });
  }
  return out;
}

/** Detect explicit working-preference statements worth remembering long-term. */
export function detectWorkingPreferenceMoments(userText: string): MeaningfulCandidate[] {
  const out: MeaningfulCandidate[] = [];
  if (!userText) return out;
  const t = userText.toLowerCase();

  const prefPatterns: RegExp[] = [
    /\bik\s+wil\s+(dat\s+)?(je|jij)\s+(direct|scherp|concreet|kort|diep|warm|niet\s+generiek)/i,
    /\bvoor\s+mij\s+werkt\s+(het\s+)?(best|beter)\s+(als|wanneer)/i,
    /\bhoud?\s+(het|je\s+toon)\s+(direct|scherp|concreet|warm|niet\s+wollig)/i,
    /\bnoem\s+patronen|benoem\s+het\s+mechanisme|geef\s+systeem(-|\s)niveau/i,
  ];
  if (prefPatterns.some((re) => re.test(userText))) {
    out.push({
      kind: 'working_preference',
      text: shortSnippet(userText),
      weight: 0.7,
    });
  }
  return out;
}

function shortSnippet(s: string): string {
  const cleaned = s.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 140) return cleaned;
  return cleaned.slice(0, 137) + '…';
}

// ═══════════════════════════════════════════════════════════════════
// ─── COLLECT CANDIDATES FOR ONE TURN ───
// ═══════════════════════════════════════════════════════════════════

export interface TurnDetectionResult {
  preferredName: string | null;
  assistantRoleName: string | null;
  styleDelta: Partial<RefinedStyle>;
  momentCandidates: MeaningfulCandidate[];
}

/**
 * Main per-turn entry point. Called from SessionContext.sendMessage.
 * Lightweight — all heavy persistence happens at session end.
 */
export function detectMeaningfulSignalsForTurn(
  userText: string,
  lastAssistantText: string | null,
): TurnDetectionResult {
  const preferredName = detectPreferredName(userText);
  const assistantRoleName = detectAssistantRoleName(userText);
  const styleDelta = detectStyleSignals(userText);
  const momentCandidates: MeaningfulCandidate[] = [
    ...detectResonanceSignals(userText, lastAssistantText),
    ...detectBreakthroughSignals(userText),
    ...detectWorkingPreferenceMoments(userText),
  ];
  return { preferredName, assistantRoleName, styleDelta, momentCandidates };
}

// ═══════════════════════════════════════════════════════════════════
// ─── SESSION-END MERGE (noise-resistant) ───
// ═══════════════════════════════════════════════════════════════════

const MAX_MOMENTS = 20;
const CONFIRMATION_DEDUP_THRESHOLD = 0.82; // normalized-text similarity
const STYLE_LEARNING_CAP = 0.15; // per-session drift cap per dimension
const STYLE_DECAY = 0.98; // unreinforced dimensions drift toward 0 slowly

export interface SessionMeaningfulSummary {
  preferredName: string | null;
  assistantRoleName: string | null;
  styleDelta: RefinedStyle; // aggregated across all user messages this session
  momentCandidates: MeaningfulCandidate[];
}

/**
 * Scan a completed session's messages and roll up meaningful signals.
 * Uses the same per-turn detectors (single source of truth).
 */
export function summarizeSessionMeaningful(session: Session): SessionMeaningfulSummary {
  const messages: ChatMessage[] = session.messages || [];
  const aggregatedStyle = emptyRefinedStyle();
  const momentCandidates: MeaningfulCandidate[] = [];
  let preferredName: string | null = null;
  let assistantRoleName: string | null = null;

  let lastAssistantText: string | null = null;
  for (const m of messages) {
    if (m.role === 'assistant') {
      lastAssistantText = m.content;
      continue;
    }
    if (m.role !== 'user') continue;
    const det = detectMeaningfulSignalsForTurn(m.content, lastAssistantText);
    if (det.preferredName && !preferredName) preferredName = det.preferredName;
    if (det.assistantRoleName && !assistantRoleName) assistantRoleName = det.assistantRoleName;
    for (const k of Object.keys(det.styleDelta) as (keyof RefinedStyle)[]) {
      const v = det.styleDelta[k];
      if (typeof v === 'number' && isFinite(v)) {
        aggregatedStyle[k] = clamp(aggregatedStyle[k] + v, -2, 2);
      }
    }
    momentCandidates.push(...det.momentCandidates);
  }

  return {
    preferredName,
    assistantRoleName,
    styleDelta: aggregatedStyle,
    momentCandidates,
  };
}

/**
 * Merge a session summary into stored MeaningfulMemory with:
 *   • dedup by normalized text
 *   • confirmation counting (repeated evidence → higher confirmations)
 *   • style drift capped per session (STYLE_LEARNING_CAP)
 *   • slow decay on unreinforced style dimensions
 *   • ranking + cap (MAX_MOMENTS)
 *   • never overwrite an established preferredName/assistantRoleName silently
 */
export function mergeSessionIntoMeaningfulMemory(
  existing: MeaningfulMemory,
  summary: SessionMeaningfulSummary,
): MeaningfulMemory {
  const nowIso = new Date().toISOString();
  const next: MeaningfulMemory = {
    preferredName: existing.preferredName,
    assistantRoleName: existing.assistantRoleName,
    refinedStyle: { ...existing.refinedStyle },
    moments: existing.moments.map((m) => ({ ...m })),
    version: 1,
  };

  // ── NAME: set when first offered, do not silently overwrite ──
  if (summary.preferredName && !next.preferredName) {
    next.preferredName = summary.preferredName;
  }
  if (summary.assistantRoleName && !next.assistantRoleName) {
    next.assistantRoleName = summary.assistantRoleName;
  }

  // ── STYLE: cap per-session drift, apply gentle decay to unreinforced dims ──
  const dims = Object.keys(next.refinedStyle) as (keyof RefinedStyle)[];
  for (const d of dims) {
    const delta = summary.styleDelta[d] || 0;
    const capped = clamp(delta, -STYLE_LEARNING_CAP, STYLE_LEARNING_CAP);
    if (capped !== 0) {
      next.refinedStyle[d] = clamp(next.refinedStyle[d] + capped, -1, 1);
    } else {
      // Unreinforced — slow decay toward 0 so stale preferences fade.
      next.refinedStyle[d] = next.refinedStyle[d] * STYLE_DECAY;
      if (Math.abs(next.refinedStyle[d]) < 0.03) next.refinedStyle[d] = 0;
    }
  }

  // ── MOMENTS: dedup + confirm + weight-recency ranking ──
  for (const cand of summary.momentCandidates) {
    if (!cand.text || cand.text.trim().length === 0) continue;
    const normalized = normalizeForDedup(cand.text);
    const existingIdx = next.moments.findIndex(
      (m) => m.kind === cand.kind && similarity(normalizeForDedup(m.text), normalized) >= CONFIRMATION_DEDUP_THRESHOLD,
    );
    if (existingIdx >= 0) {
      const m = next.moments[existingIdx];
      m.confirmations = Math.min(99, m.confirmations + 1);
      m.weight = clamp(m.weight + 0.05, 0, 1);
      m.lastSeenAt = nowIso;
    } else {
      next.moments.push({
        kind: cand.kind,
        text: cand.text.slice(0, 220),
        weight: clamp(cand.weight, 0, 1),
        confirmations: 1,
        createdAt: nowIso,
        lastSeenAt: nowIso,
      });
    }
  }

  // Rank and cap.
  next.moments = rankMoments(next.moments).slice(0, MAX_MOMENTS);

  return next;
}

/** Rank moments by weight * recency * (1 + confirmations/4). */
export function rankMoments(moments: MeaningfulMoment[]): MeaningfulMoment[] {
  const now = Date.now();
  return moments
    .slice()
    .map((m) => {
      const ageDays = Math.max(0, (now - Date.parse(m.lastSeenAt || m.createdAt)) / 86400000);
      // recency half-life ~45 days
      const recency = Math.pow(0.5, ageDays / 45);
      const score = m.weight * recency * (1 + Math.min(m.confirmations, 6) / 4);
      return { m, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}

function normalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9à-öø-ÿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Very lightweight Jaccard similarity on word sets — good enough for dedup. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const wa = new Set(a.split(' ').filter((w) => w.length > 2));
  const wb = new Set(b.split(' ').filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = wa.size + wb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ═══════════════════════════════════════════════════════════════════
// ─── RETRIEVAL HELPERS (subtle, surfaced via analysisMemory) ───
// ═══════════════════════════════════════════════════════════════════

/**
 * Build the slice of meaningful memory that the edge function's SAMENVATTING
 * block will see. Intentionally compact — no dumps.
 */
export interface MeaningfulMemoryContext {
  preferredName: string | null;
  assistantRoleName: string | null;
  refinedStylePrefs: string[]; // only pronounced dimensions, human-readable
  topMoments: Array<{ kind: MomentKind; text: string; confirmations: number }>;
}

export function buildMeaningfulMemoryContext(
  mem: MeaningfulMemory | null,
): MeaningfulMemoryContext | null {
  if (!mem) return null;
  const prefs = describeRefinedStyle(mem.refinedStyle);
  const top = rankMoments(mem.moments).slice(0, 5).map((m) => ({
    kind: m.kind,
    text: m.text,
    confirmations: m.confirmations,
  }));
  // Return null only when there is literally nothing useful.
  if (!mem.preferredName && !mem.assistantRoleName && prefs.length === 0 && top.length === 0) {
    return null;
  }
  return {
    preferredName: mem.preferredName,
    assistantRoleName: mem.assistantRoleName,
    refinedStylePrefs: prefs,
    topMoments: top,
  };
}

/** Human-readable list of pronounced style preferences (|score| >= 0.3). */
export function describeRefinedStyle(style: RefinedStyle): string[] {
  const out: string[] = [];
  const push = (s: number, pos: string, neg: string) => {
    if (s >= 0.3) out.push(pos);
    else if (s <= -0.3) out.push(neg);
  };
  push(style.directVsGentle, 'direct (geen omhaal)', 'zachter tempo');
  push(style.conciseVsDeeper, 'bondig, kort-en-krachtig', 'diepgaand, uitdiepen');
  push(style.analyticalVsEmotional, 'analytische ingang (uitleg/mechanisme)', 'gevoelsingang (eerst voelen)');
  push(style.challengeVsSoftness, 'mag uitgedaagd worden, scherp mogen zijn', 'voorzichtige, zachte toon');
  if (style.sensitivityToGeneric >= 0.3) out.push('fijngevoelig voor generieke/wollige taal');
  if (style.valuesPrecisionResonance >= 0.3) out.push('hecht sterk aan precisie, resonantie, echtheid');
  if (style.warmthWithoutFluff >= 0.3) out.push('warmte zonder fluff');
  if (style.systemLevelThinking >= 0.3) out.push('waardeert systeem-niveau denken / patronen');
  return out;
}
