// ─── BULLET → QUICK-REPLY EXTRACTION (CONSERVATIVE) ───
//
// History note (regression fix Apr 14):
// An earlier version of this function aggressively converted ANY trailing
// bulleted lines into quickReplies AND stripped therapeutic "drie-ingangen"
// phrases such as "in je denken, in je gevoel, of in je lichaam" from the
// message body. That destroyed legitimate, expressive AI content and made
// responses feel flat, broken, or grammatically incoherent.
//
// The function now:
//  • only treats a trailing bullet block as quickReplies when it really looks
//    like a menu (2–4 short items, ≤50 chars each, with a clear lead-in),
//  • otherwise leaves the bullets in place as expressive content,
//  • does NOT strip "denken / gevoel / lichaam" prose under any circumstances.
export function stripBulletsFromMessage(
  message: string,
  existingQuickReplies?: string[]
): { cleanMessage: string; extractedReplies: string[] } {
  if (!message) return { cleanMessage: message, extractedReplies: existingQuickReplies || [] };

  // If the AI already supplied quickReplies, do NOT touch the message body.
  // The model has already separated UI options from prose — respect that.
  if (existingQuickReplies && existingQuickReplies.length > 0) {
    return {
      cleanMessage: message,
      extractedReplies: existingQuickReplies.slice(0, 3),
    };
  }

  // Match bullet-style lines: •, -, *, ·, >, or numbered (1., 2., 3.) / (1) (2)
  const bulletLineRegex = /^[\s]*(?:[•\-\*·>]|\d+[\.\)])\s+(.+)$/;

  const lines = message.split('\n');

  // Scan from the end to find a contiguous trailing bullet block
  let bulletBlockStartIdx = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) {
      // empty line — could be separator, only count if we already entered the block
      if (bulletBlockStartIdx < lines.length) bulletBlockStartIdx = i;
      continue;
    }
    if (bulletLineRegex.test(line)) {
      bulletBlockStartIdx = i;
    } else {
      break;
    }
  }

  // Collect bullet lines + non-bullet (prose) lines
  const bulletLines: string[] = [];
  const cleanLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i >= bulletBlockStartIdx) {
      const line = lines[i].trim();
      if (!line) continue;
      const m = line.match(bulletLineRegex);
      if (m) bulletLines.push(m[1].trim());
      else cleanLines.push(lines[i]);
    } else {
      cleanLines.push(lines[i]);
    }
  }

  // ── CONSERVATIVE GATE: only treat as menu when the block really looks like one ──
  // Otherwise leave the bullets inside the message (expressive lists are valid prose).
  const proseTrimmed = cleanLines.join('\n').trim();
  const proseEndsWithMenuCue =
    /[?:]\s*$/.test(proseTrimmed) || // ends with ? or :
    /\b(kies|kiezen|opties?|wil je|zullen we|welke)\b[^.?!]*$/i.test(proseTrimmed);
  const allBulletsShort = bulletLines.every(b => b.length > 0 && b.length <= 50);
  const looksLikeMenu =
    bulletLines.length >= 2 &&
    bulletLines.length <= 4 &&
    allBulletsShort &&
    proseTrimmed.length >= 10 &&
    proseEndsWithMenuCue;

  if (!looksLikeMenu) {
    // Leave message untouched. Do not flatten expressive content.
    return { cleanMessage: message, extractedReplies: [] };
  }

  // Menu detected — extract bullets as quickReplies
  let cleanMessage = proseTrimmed.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  cleanMessage = cleanMessage.replace(/\s{2,}/g, ' ').replace(/\s+([.?!])/g, '$1').trim();

  let finalReplies = bulletLines.slice(0, 3).map(r =>
    r.replace(/^["']+|["']+$/g, '').replace(/\.$/g, '').trim()
  ).filter(r => r.length > 0);

  return { cleanMessage, extractedReplies: finalReplies };
}


// ─── Known internal JSON field names that should NEVER appear in user-visible content ───
const INTERNAL_FIELD_NAMES = [
  'quickReplies', 'quick_replies',
  'phaseTransition', 'phase_transition',
  'detectedMode', 'detected_mode',
  'emotionWords', 'emotion_words',
  'markStable', 'mark_stable',
  'showBodyMap', 'show_body_map',
  'silenceMode', 'silence_mode',
  'activeAgent', 'active_agent',
  'regulationDomain', 'regulation_domain',
  'entryPoint', 'entry_point',
  'compassSignals', 'compass_signals',
  'identityThemes', 'identity_themes',
  'insightOffered', 'insight_offered',
  'compassState', 'compass_state',
  'secondaryCompassState', 'secondary_compass_state',
  'bodyAreaSelected', 'body_area_selected',
  'detectedMechanism', 'detected_mechanism',
  'dominantLayer', 'dominant_layer',
];
// NOTE: Removed 'crisis', 'dysregulation', and 'message' from this list —
// those are normal Dutch/English words that legitimately appear in therapeutic
// content. Keeping them caused regression where valid prose containing the
// word "crisis" or "message" got mangled by the JSON-fragment stripper.

// Build a regex pattern from the field names
const FIELD_NAMES_PATTERN = INTERNAL_FIELD_NAMES.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');


// ─── CLIENT-SIDE RAW JSON CLEANING ───
// Removes raw JSON that leaked into the message content.
// Conservative: only acts when the content is clearly JSON-shaped, never
// strips arbitrary leading words from natural prose.
export function cleanRawJsonFromMessage(message: string): string {
  if (!message || typeof message !== 'string') return '';

  let cleaned = message.trim();

  // ── CASE 1: Entire message is a JSON object — extract the "message" field ──
  if (cleaned.startsWith('{')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object' && typeof parsed.message === 'string') {
        return cleanRawJsonFromMessage(parsed.message);
      }
    } catch (_) {
      // Not valid JSON — try regex extraction of just the "message" field
      const msgMatch = cleaned.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (msgMatch) {
        const extracted = msgMatch[1]
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\\\/g, '\\');
        return cleanRawJsonFromMessage(extracted);
      }
    }
  }

  // ── CASE 2: JSON block tacked onto the end of a normal message ──
  // Pattern: "Normal text here... { ... JSON with known fields ... }"
  const jsonBlockAtEnd = cleaned.match(
    /^([\s\S]+?)\s*\{[\s\S]*"(?:quickReplies|phaseTransition|activeAgent|compassState)"[\s\S]*\}\s*$/
  );
  if (jsonBlockAtEnd && jsonBlockAtEnd[1].trim().length > 10) {
    cleaned = jsonBlockAtEnd[1].trim();
  }

  // ── CASE 3: Trailing JSON fragment (single object) ──
  cleaned = cleaned.replace(
    /\s*\{[^}]*"(?:quickReplies|phaseTransition|activeAgent|compassState)"[^}]*\}\s*$/g,
    ''
  );
  cleaned = cleaned.replace(/\s*"quickReplies"\s*:\s*\[.*?\]\s*$/gs, '');

  // ── CASE 4: Markdown JSON code fences ──
  cleaned = cleaned.replace(/```json\n?|\n?```/g, '');

  // ── CASE 5: Trailing raw string array (e.g. ["A","B","C"]) ──
  cleaned = cleaned.replace(/\s*\[("[^"]*"(,\s*"[^"]*")*)\]\s*$/g, '');

  // ── CASE 6: Stray "key": value pairs from internal field names ──
  // Requires the field name to be quoted AND followed by a colon, so this
  // cannot match normal prose words like "crisis" or "message".
  const kvRegex = new RegExp(
    `\\s*"(${FIELD_NAMES_PATTERN})"\\s*:\\s*(?:` +
      `\\[(?:[^\\[\\]]*|\\[(?:[^\\[\\]]*|\\[[^\\[\\]]*\\])*\\])*\\]` + // arrays
      `|"(?:[^"\\\\]|\\\\.)*"` + // quoted strings
      `|null|true|false` +
      `|[\\d.]+` +
      `|[^,}\\]\\n]+` +
    `)\\s*[,}]?\\s*`,
    'g'
  );
  cleaned = cleaned.replace(kvRegex, ' ');

  // ── CASE 7: Lines that are nothing but JSON debris ──
  cleaned = cleaned.replace(/^\s*[{}\[\],]+\s*$/gm, '');

  // ── Final whitespace cleanup ──
  cleaned = cleaned
    .replace(/,\s*$/gm, '')
    .replace(/^\s*,\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{3,}/g, ' ')
    .trim();

  return cleaned;
}
