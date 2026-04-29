import type { AIResponse } from '@/lib/types';

/**
 * ─── AI RESPONSE VALIDATION ───
 *
 * Validates that the data returned by the edge function is a genuine AI response
 * and not an error object, empty response, or error message disguised as a response.
 *
 * Common failure modes this catches:
 * 1. Edge function returns { error: "AI generation error: fetch failed" } (HTTP 200 with error body)
 * 2. Edge function returns { message: "AI generation error: ..." } (error in message field)
 * 3. Edge function returns null/undefined/empty data
 * 4. Edge function returns valid JSON but without required fields
 * 5. Edge function wraps error in a therapeutic-looking response (embedded error strings)
 */
export function isValidAIResponse(data: any): data is AIResponse {
  // Must exist
  if (!data || typeof data !== 'object') return false;

  // Must have a message field that's a non-empty string
  if (!data.message || typeof data.message !== 'string' || data.message.trim().length === 0) return false;

  // If there's a top-level error field, this is an error response, not a valid AI response
  if (data.error && typeof data.error === 'string' && data.error.trim().length > 0) return false;

  // Check if the message itself looks like an error message (not a therapeutic response)
  const lowerMsg = data.message.toLowerCase().trim();
  const errorPrefixes = [
    'ai generation error',
    'error:',
    'error :',
    'internal server error',
    'openai error',
    'api error',
    'generation error',
    'fetch failed',
    'request failed',
    'function invocation error',
    'edge function error',
    'unexpected error',
    'failed to generate',
    'could not generate',
    'service unavailable',
    'rate limit',
    'quota exceeded',
  ];
  if (errorPrefixes.some(prefix => lowerMsg.startsWith(prefix))) return false;

  // ── CRITICAL ERROR STRINGS — reject if found ANYWHERE in the message, regardless of length ──
  // These specific technical error strings should NEVER appear in legitimate therapeutic content.
  // This catches edge function responses that wrap the error in a longer message like:
  //   "Ik merk dat er iets speelt. AI generation error: fetch failed. Probeer het opnieuw."
  const criticalErrorPatterns = [
    'ai generation error',
    'fetch failed',
    'function invocation error',
    'edge function error',
    'openai error',
    'anthropic error',
    'api key',
    'rate limit exceeded',
    'quota exceeded',
    'econnrefused',
    'enotfound',
    'etimedout',
    'internal server error',
    '502 bad gateway',
    '503 service unavailable',
    '504 gateway timeout',
  ];
  if (criticalErrorPatterns.some(pattern => lowerMsg.includes(pattern))) {
    console.warn(
      `%c[AI VALIDATION] Critical error pattern detected in message:%c "${data.message.substring(0, 120)}" — rejecting`,
      'color: #e53e3e; font-weight: bold;',
      'color: #718096;'
    );
    return false;
  }

  // Check for error-like patterns anywhere in short messages (< 100 chars)
  // Longer messages are likely real therapeutic content that happens to mention "error"
  if (lowerMsg.length < 100) {
    const errorPatterns = [
      'generation error',
      'unauthorized',
      '500 internal',
      'request failed',
      'failed to generate',
      'could not generate',
      'service unavailable',
    ];
    if (errorPatterns.some(pattern => lowerMsg.includes(pattern))) return false;
  }

  // ── EDGE FUNCTION FALLBACK DETECTION ──
  // Only reject the EXACT server-side therapeutic fallbacks (emitted when provider fails).
  // Trimmed to exact-match-only to avoid rejecting legitimate short AI responses.
  const KNOWN_EDGE_FUNCTION_FALLBACKS = [
    'ik ben hier bij je. neem even een adem — er is geen haast.',
    'ik ben hier bij je. neem even een adem - er is geen haast.',
    'ik ben er. laten we heel even vertragen, en kijken wat er nu aandacht vraagt.',
    'ik ben bij je. voel je voeten op de grond, en adem rustig uit.',
    'ik blijf hier. wat speelt er nu het sterkst in je?',
    'ik ben er. neem even de tijd.',
    'ik ben er. neem de tijd.',
  ];

  // Accept context-aware server fallbacks, reject only the old generic holding/regulation ones.
  if ((data as any)._fallback === true) {
    const fallbackKind = (data as any)._fallbackKind;

    const allowedFallbackKinds = [
      'explicit_question_intent',
      'memory_continuity',
      'honest_first_contact',
      'greeting',
      'generic_open',
      'technical_retry',

    ];

    if (allowedFallbackKinds.includes(fallbackKind)) {
      console.warn(
        `%c[AI VALIDATION] Context-aware server fallback accepted%c (_fallbackKind=${fallbackKind})`,
        'color: #38a169; font-weight: bold;',
        'color: #718096;'
      );
    } else {
      console.warn(
        `%c[AI VALIDATION] Unknown/old server fallback rejected%c (_reason=${(data as any)._reason}, _fallbackKind=${fallbackKind})`,
        'color: #dd6b20; font-weight: bold;',
        'color: #718096;'
      );
      return false;
    }
  }

  if (KNOWN_EDGE_FUNCTION_FALLBACKS.includes(lowerMsg)) {
    console.warn(
      `%c[AI VALIDATION] Edge function fallback detected:%c "${data.message}" — rejecting to trigger local fallback`,
      'color: #dd6b20; font-weight: bold;',
      'color: #718096;'
    );
    return false;
  }

  // ── BARE RESPONSE DETECTION — DISABLED ──
  // Previously this rejected short AI responses (<60 chars) without structured data,
  // which caused legitimate short therapeutic replies to be replaced with generic local
  // fallbacks (e.g., repeated "Ik ben er. Vertel..." messages). The AI legitimately
  // returns short responses in regulation/holding phases, so this check now only
  // rejects responses that are clearly empty or malformed (handled above).

  return true;
}

/**
 * ─── MESSAGE ERROR DETECTION ───
 *
 * Lightweight check that can be used as a final safety net on any message string
 * before displaying it to the user. Returns true if the message contains
 * technical error patterns that should never be shown.
 *
 * This is separate from isValidAIResponse because it operates on a plain string,
 * not an AIResponse object, and can be used at the rendering layer.
 */
export function containsLeakedError(message: string): boolean {
  if (!message || typeof message !== 'string') return false;
  const lower = message.toLowerCase();

  const errorSignals = [
    'ai generation error',
    'fetch failed',
    'function invocation error',
    'edge function error',
    'openai error',
    'anthropic error',
    'internal server error',
    'econnrefused',
    'enotfound',
    'etimedout',
    '502 bad gateway',
    '503 service unavailable',
    '504 gateway timeout',
    'rate limit exceeded',
    'quota exceeded',
    'api key invalid',
    'api key expired',
  ];

  return errorSignals.some(signal => lower.includes(signal));
}