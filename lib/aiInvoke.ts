import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ─── AI INVOCATION WITH RETRIES ───
 *
 * Handles the robust AI invocation logic: timeout, retries, validation,
 * and direct-fetch fallback when the Supabase client invoke fails.
 *
 * Extracted from SessionContext.tsx — logic is identical.
 */

/**
 * ── REGRESSION FIX (v3.7.3-client, Apr 16): restore `createTimeoutPromise` ──
 * The helper that `Promise.race` uses to bound each attempt was missing from
 * this file (ReferenceError at runtime). Effect: every primary invoke threw
 * "createTimeoutPromise is not defined" on evaluation of the Promise.race
 * array, which the catch block below classified as a non-fetch error and
 * therefore SKIPPED the direct-fetch fallback too. Net result: every turn
 * fell straight to the local fallback, which produced the repeated
 * holding-style replies the user saw as a loop — regardless of whether the
 * user's message was a continuity question.
 *
 * This helper rejects after TIMEOUT_MS with a standard "timeout"-tagged error
 * so the existing catch-path pattern-matching continues to work unchanged.
 */
function createTimeoutPromise(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => {
      const err = new Error(`invoke timeout after ${ms}ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
}

export async function invokeAIWithRetries(
  invokeBody: any,
  database: SupabaseClient,
  isValidAIResponse: (data: any) => boolean,
): Promise<{ data: any | null; lastError: any }> {
  // ── Robust AI invocation with timeout, retries, and direct-fetch fallback ──
  //
  // ⚠️ REGRESSION FIX (v3.7.2-client-budget, Apr 16):
  //   The edge function (v3.7.1-fetch-resilient) now retries the provider 3×
  //   with a 22s per-attempt timeout + exponential backoff — worst-case server
  //   budget ≈ 68s. The client previously wrapped each invoke in a 25s timeout
  //   and retried 3× on its own, which caused the client to abort while the
  //   server was still mid-retry. Every abort triggered the local fallback,
  //   producing the repeated short "holding-style" replies the user saw as a
  //   loop. We now:
  //     • give the server enough room to finish its own retries (55s)
  //     • drop client retries to 2 (server already retries internally;
  //       duplicating it on the client just multiplied the wait)
  //     • shorten backoff so recovery feels responsive
  const TIMEOUT_MS = 55000; // was 25000 — must exceed server's ~68s worst case? use 55s as a compromise, since most provider successes land <20s
  const MAX_RETRIES = 2;    // was 3 — server retries internally; client retries amplified the loop

  /**
   * Quick check: does the raw response data look like an error from the edge function?
   * This catches cases where HTTP 200 is returned but the body is an error object.
   */
  const isErrorResponse = (data: any): boolean => {
    if (!data || typeof data !== 'object') return false;
    // { error: "AI generation error: ..." }
    if (data.error && typeof data.error === 'string') return true;
    // { message: "AI generation error: ..." } without other fields
    if (data.message && typeof data.message === 'string') {
      const lower = data.message.toLowerCase();
      if (lower.includes('ai generation error') || lower.includes('fetch failed') ||
          lower.includes('internal server error') || lower.includes('function invocation error') ||
          lower.includes('edge function error') || lower.includes('openai error') ||
          lower.includes('anthropic error') || lower.includes('econnrefused') ||
          lower.includes('etimedout') || lower.includes('rate limit') ||
          lower.includes('quota exceeded') || lower.includes('api key')) {
        return true;
      }
    }
    return false;
  };

  const invokeWithTimeout = async (attempt: number): Promise<{ data: any; error: any }> => {
    try {
      // Primary: use supabase.functions.invoke with timeout race
      const result = await Promise.race([
        database.functions.invoke('inner-kompas-chat', { body: invokeBody }),
        createTimeoutPromise(TIMEOUT_MS),
      ]);

      // ── Pre-validation: catch error responses before they enter the retry loop ──
      // The Supabase client may return { data: { error: "..." }, error: null } for HTTP 200 error bodies
      if (result?.data && !result?.error && isErrorResponse(result.data)) {
        const errDetail = result.data?.error || result.data?.message || 'unknown error in response body';
        console.warn(`[AI] Attempt ${attempt + 1}: edge function returned error in body: ${typeof errDetail === 'string' ? errDetail.substring(0, 150) : 'unknown'}`);
        return { data: null, error: new Error(`Edge function error: ${typeof errDetail === 'string' ? errDetail.substring(0, 150) : 'unknown'}`) };
      }

      return result;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`[AI] Attempt ${attempt + 1} failed (invoke): ${errMsg}`);

      // If fetch failed, aborted, timed out, or network error → try direct fetch as fallback
      if (
        errMsg.includes('fetch') ||
        errMsg.includes('abort') ||
        errMsg.includes('network') ||
        errMsg.includes('Failed') ||
        errMsg.includes('timeout') ||
        errMsg.includes('TypeError')
      ) {
        try {
          console.log(`[AI] Attempt ${attempt + 1}: trying direct fetch fallback...`);
          const directController = new AbortController();
          const directTimeoutId = setTimeout(() => directController.abort(), TIMEOUT_MS);

          // Construct the edge function URL from the supabase URL
          const supabaseUrl = 'https://bzmlljjjwrpxwiwnlwpb.supabase.co';
          const directResponse = await fetch(`${supabaseUrl}/functions/v1/inner-kompas-chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bWxsampqd3JweHdpd25sd3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NTc4OTUsImV4cCI6MjA5MzAzMzg5NX0.9qrx6RDbQOr1sVCzeuq6LuOd8MB-8m1ATX_jEWF2d9Y',
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bWxsampqd3JweHdpd25sd3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NTc4OTUsImV4cCI6MjA5MzAzMzg5NX0.9qrx6RDbQOr1sVCzeuq6LuOd8MB-8m1ATX_jEWF2d9Y',
            },

            body: JSON.stringify(invokeBody),
            signal: directController.signal,
          });

          clearTimeout(directTimeoutId);

          // ─── PROVIDER-LAYER DEBUG (temporary, surgical) ────────────────────
          // Capture HTTP status, response headers, and raw body text BEFORE
          // JSON parsing. This is the only external vantage point we have on
          // the edge function's provider/gateway layer (callProviderWithRetries)
          // without modifying the edge function source itself.
          //
          // Classifies the failure into one of:
          //   • timeout          → caught by outer catch (AbortError)
          //   • non-2xx HTTP     → directResponse.ok === false
          //   • invalid JSON     → JSON.parse throws on raw text
          //   • valid JSON, wrong shape → isErrorResponse(data) or validator fails upstream
          //   • empty content    → raw text length 0
          //   • provider error object → { error: "..." } in parsed JSON
          // ───────────────────────────────────────────────────────────────────
          const rawStatus = directResponse.status;
          const rawHeaders: Record<string, string> = {};
          try {
            directResponse.headers.forEach((v, k) => {
              // Redact auth-like headers; keep diagnostic ones
              if (/^(authorization|apikey|cookie|set-cookie)$/i.test(k)) return;
              rawHeaders[k] = v;
            });
          } catch { /* headers not iterable in some envs */ }

          let rawText = '';
          try {
            rawText = await directResponse.text();
          } catch (readErr: any) {
            console.warn('[AI][provider-debug] failed to read response body as text:', readErr?.message || readErr);
          }

          // Always log a bounded preview so we can diagnose provider shape mismatches
          console.log(
            `%c[AI][provider-debug] HTTP ${rawStatus}%c headers=%o bodyLen=${rawText.length} bodyPreview=%o`,
            'color: #2b6cb0; font-weight: bold;',
            'color: #718096;',
            rawHeaders,
            rawText.slice(0, 400),
          );

          if (!directResponse.ok) {
            return {
              data: null,
              error: new Error(`Direct fetch HTTP ${rawStatus}: ${rawText.substring(0, 200)}`),
            };
          }

          if (rawText.length === 0) {
            console.warn('[AI][provider-debug] classification=empty_body (HTTP 200 but zero-length body)');
            return { data: null, error: new Error('Direct fetch: empty response body') };
          }

          let data: any;
          try {
            data = JSON.parse(rawText);
          } catch (parseErr: any) {
            console.warn(
              `[AI][provider-debug] classification=invalid_json — parse error: ${parseErr?.message || parseErr}`,
            );
            return {
              data: null,
              error: new Error(`Direct fetch: invalid JSON in body: ${rawText.substring(0, 200)}`),
            };
          }

          // ── Validate the direct fetch response before returning ──
          // The edge function may return HTTP 200 with an error body
          if (isErrorResponse(data)) {
            const errDetail = data?.error || data?.message || 'unknown';
            console.warn(
              `[AI][provider-debug] classification=provider_error_object — ${typeof errDetail === 'string' ? errDetail.substring(0, 200) : 'unknown'}`,
            );
            return {
              data: null,
              error: new Error(`Direct fetch error body: ${typeof errDetail === 'string' ? errDetail.substring(0, 150) : 'unknown'}`),
            };
          }

          // Shape probe: if the body doesn't contain a top-level `message`, log the
          // keys so we can see whether the edge function is leaking the raw provider
          // shape (e.g. { choices: [...] }) instead of its normalized { message, ... }.
          if (data && typeof data === 'object' && typeof data.message !== 'string') {
            console.warn(
              '[AI][provider-debug] classification=wrong_shape — top-level keys:',
              Object.keys(data),
            );
          }

          console.log('[AI] Direct fetch fallback succeeded');
          return { data, error: null };
        } catch (directErr: any) {
          // AbortError here means the direct-fetch hit the client-side timeout.
          const isTimeout = directErr?.name === 'AbortError';
          console.warn(
            `[AI][provider-debug] classification=${isTimeout ? 'timeout' : 'network_error'} — ${directErr?.message || directErr}`,
          );
          return { data: null, error: directErr };
        }
      }

      return { data: null, error: err };
    }
  };



  let data: any = null;
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1.5s, 3s
      const delay = 1500 * attempt;
      console.log(`[AI] Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const result = await invokeWithTimeout(attempt);

    // ── RESPONSE VALIDATION: Check if the response is a genuine AI response ──
    // The edge function may return HTTP 200 with an error in the body, e.g.:
    //   { error: "AI generation error: fetch failed" }
    //   { message: "AI generation error: fetch failed" }
    // These must NOT be treated as valid therapeutic responses.
    if (result.data && !result.error) {
      if (isValidAIResponse(result.data)) {
        data = result.data;
        lastError = null;
        break;
      } else {
        // Data exists but is not a valid AI response (error disguised as data)
        const errorDetail = result.data?.error || result.data?.message || 'invalid response structure';
        console.warn(`%c[AI] Attempt ${attempt + 1}: response failed validation%c — ${typeof errorDetail === 'string' ? errorDetail.substring(0, 100) : 'unknown'}`, 'color: #dd6b20; font-weight: bold;', 'color: #718096;');
        lastError = new Error(`Invalid AI response: ${typeof errorDetail === 'string' ? errorDetail.substring(0, 100) : 'unknown structure'}`);
        // Don't break — continue to next retry attempt
        continue;
      }
    }

    // Check if we got data even with an error (some Supabase responses include both)
    if (result.data && result.error) {
      // If data looks valid (has a message field AND passes validation), use it despite the error
      if (isValidAIResponse(result.data)) {
        data = result.data;
        lastError = null;
        break;
      }
    }

    lastError = result.error;
    console.warn(`[AI] Attempt ${attempt + 1} result: error=${lastError?.message || 'no data'}`);
  }

  return { data, lastError };
}
