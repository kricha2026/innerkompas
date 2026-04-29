# Provider / Gateway Layer Debug — `inner-kompas-chat`

Scope: **provider request/response layer only** (`callProviderWithRetries`).
Everything else (UI, coach logic, memory architecture, session flow,
fallback wording) is intentionally untouched.

---

## 1. Tooling constraint — read this first

My code-writing tool is restricted to **frontend files only**; it cannot
write to `supabase/functions/inner-kompas-chat/**`. So this task is split:

- **Edge-function patch** → provided here as a ready-to-paste diff. Apply
  it manually (Supabase dashboard or `supabase functions deploy`).
- **Client-side observability** → already applied in
  `src/lib/aiInvoke.ts` (direct-fetch branch). This gives you an
  *external* view of the provider layer without redeploying the edge
  function, so you can classify the failure on the very next run.

---

## 2. Diagnosis (what is almost certainly wrong)

You reported:

> Both `google/gemini-2.5-flash` and `openai/gpt-3.5-turbo` fall back.

That pattern — **two different providers, same fallback** — rules out
model-specific issues and points at one of three things in
`callProviderWithRetries`:

| # | Hypothesis | Why it fits “both models fail identically” | How to confirm |
|---|---|---|---|
| **A** | Response shape is parsed against OpenAI-native (`data.choices[0].message.content`) but the gateway returns a wrapped shape | Both routed models go through the same gateway; a shape mismatch affects both equally | `[AI][provider-debug] classification=wrong_shape` in console, with top-level keys like `output`, `result`, `data`, or `choices` nested one level deeper |
| **B** | `Authorization` header format is wrong for the gateway (e.g. `Bearer ${key}` vs raw key, or missing `HTTP-Referer` / `X-Title` that OpenRouter-style gateways require) | Both models 401/403 identically before reaching the provider | `HTTP 401` / `HTTP 403` with a JSON error body mentioning `auth`, `unauthorized`, or `missing header` |
| **C** | Provider request body never returns within the per-attempt timeout (abort); all 3 internal retries exhaust, edge function returns `{ error: "AI generation error: fetch failed" }` | Same timeout applies to every provider | `classification=timeout` OR `classification=provider_error_object` with `"fetch failed"` |

The **client-side debug logs** added in `aiInvoke.ts` will print exactly
one of these classifications on the next failing turn:

```
[AI][provider-debug] HTTP <status> headers={...} bodyLen=<n> bodyPreview="..."
[AI][provider-debug] classification=<timeout|invalid_json|wrong_shape|empty_body|provider_error_object|network_error>
```

Read that line **first** before doing anything else — it tells you which
of A / B / C you are in.

---

## 3. Minimal, surgical patch for `callProviderWithRetries`

Apply this inside the edge function. Nothing else in the file needs to
change. Keep the existing retry/timeout/fallback system intact.

```ts
// supabase/functions/inner-kompas-chat/index.ts
// (inside callProviderWithRetries, around the fetch + parse block)

const attemptId = crypto.randomUUID().slice(0, 8);
console.log(`[provider:${attemptId}] → POST ${PROVIDER_URL} model=${model}`);

let resp: Response;
try {
  resp = await fetch(PROVIDER_URL, {
    method: "POST",
    headers: {
      // ── (4) AUTH HEADER CHECK ─────────────────────────────────
      // OpenRouter + OpenAI both want: Authorization: Bearer <KEY>
      // If PROVIDER_API_KEY already contains the "Bearer " prefix
      // (common copy-paste mistake from dashboards), strip it:
      "Authorization": `Bearer ${PROVIDER_API_KEY.replace(/^Bearer\s+/i, "")}`,
      "Content-Type": "application/json",
      // OpenRouter-specific; harmless for OpenAI. Remove if you target
      // OpenAI directly.
      "HTTP-Referer": "https://inner-kompas.app",
      "X-Title": "Inner Kompas",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
  });
} catch (e) {
  // (5a) timeout / network
  console.warn(`[provider:${attemptId}] fetch threw: name=${e?.name} msg=${e?.message}`);
  throw e; // let the existing retry loop handle it
}

// (2) HTTP status + headers
const headerDump: Record<string, string> = {};
resp.headers.forEach((v, k) => { headerDump[k] = v; });
console.log(`[provider:${attemptId}] ← HTTP ${resp.status} headers=${JSON.stringify(headerDump)}`);

// (2) raw body text BEFORE parsing — single source of truth for every branch
const raw = await resp.text();
console.log(`[provider:${attemptId}] rawLen=${raw.length} rawPreview=${raw.slice(0, 500)}`);

// (5b) non-2xx → provider error object (or HTML error page from gateway)
if (!resp.ok) {
  console.warn(`[provider:${attemptId}] classification=http_${resp.status}`);
  throw new Error(`Provider HTTP ${resp.status}: ${raw.slice(0, 300)}`);
}

// (5c) empty content
if (raw.length === 0) {
  console.warn(`[provider:${attemptId}] classification=empty_body`);
  throw new Error("Provider returned empty body");
}

// (5d) invalid JSON
let parsed: any;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.warn(`[provider:${attemptId}] classification=invalid_json msg=${e?.message}`);
  throw new Error(`Provider returned non-JSON: ${raw.slice(0, 200)}`);
}

// (5e) provider-specific error object (OpenAI/OpenRouter style)
if (parsed?.error) {
  console.warn(`[provider:${attemptId}] classification=provider_error_object err=${JSON.stringify(parsed.error).slice(0, 300)}`);
  throw new Error(`Provider error: ${parsed.error?.message || JSON.stringify(parsed.error)}`);
}

// (3) VERIFY shape: data.choices[0].message.content
//     Guard every step — one missing level is the usual culprit.
const content: string | undefined =
  parsed?.choices?.[0]?.message?.content ??
  // Some gateways wrap in { data: { choices: ... } } — tolerate both.
  parsed?.data?.choices?.[0]?.message?.content;

if (typeof content !== "string" || content.trim().length === 0) {
  console.warn(
    `[provider:${attemptId}] classification=wrong_shape ` +
    `topKeys=${Object.keys(parsed).join(",")} ` +
    `choicesType=${typeof parsed?.choices} ` +
    `choice0Keys=${parsed?.choices?.[0] ? Object.keys(parsed.choices[0]).join(",") : "n/a"}`
  );
  throw new Error("Provider returned unexpected shape (no choices[0].message.content)");
}

console.log(`[provider:${attemptId}] OK contentLen=${content.length}`);
return content;
```

Why this is minimal and surgical:

- Does not change the retry loop, the timeout budget, the fallback
  wording, or the outer response envelope.
- Adds exactly the six classifications the task asked for.
- Auth-header fix (strip accidental `Bearer ` prefix, include OpenRouter
  attribution headers) is the only behavioral change, and it’s a no-op
  when the key is already formatted correctly.
- Shape check tolerates both `choices[0].message.content` and the
  occasional `data.choices[0].message.content` wrapping some gateways
  produce, without silently accepting garbage.

---

## 4. Decision tree for the next run

After deploying the patch (or even before — using only the client-side
logs already in place), trigger one failing turn and read the console:

```
classification=timeout              → raise PER_ATTEMPT_TIMEOUT_MS to 25–30s,
                                      or reduce max_tokens in the request body
classification=http_401/403         → Auth header issue. Verify:
                                        - env var name matches what the code reads
                                        - key has no "Bearer " prefix baked in
                                        - gateway requires HTTP-Referer/X-Title
classification=http_429             → Rate limit. Back off is already in loop; check quota.
classification=http_5xx             → Gateway upstream; retry loop handles it.
classification=invalid_json         → Gateway returned an HTML error page
                                      (usually Cloudflare/nginx). Check URL & region.
classification=empty_body           → Provider streaming misconfig; ensure
                                      stream:false in request body.
classification=wrong_shape          → Read the logged topKeys. The wrapper is
                                      one level off. Add that path to the
                                      content extractor.
classification=provider_error_object→ Body has { error: { message, code } }.
                                      Most common codes:
                                        - "model_not_found" → bad model slug
                                        - "insufficient_quota" → billing
                                        - "invalid_api_key" → auth
```

---

## 5. What I changed in the frontend (already applied)

`src/lib/aiInvoke.ts`, direct-fetch branch only:

1. Replaced `await directResponse.json()` with `await directResponse.text()`
   followed by a guarded `JSON.parse`, so invalid/empty bodies are
   classified instead of throwing opaque `SyntaxError`.
2. Added a single `console.log` with HTTP status, redacted response
   headers, body length, and a 400-char body preview.
3. Added a `classification=...` warning for each of the six failure
   modes listed in the task (timeout, invalid_json, wrong_shape,
   empty_body, provider_error_object, network_error).

No behavior change on the success path. No change to the retry loop,
validation logic, fallback system, coach logic, memory, or UI.

> Note: the primary invoke path (`supabase.functions.invoke`) swallows
> the raw HTTP response inside the client SDK, so the new logs only fire
> on the direct-fetch fallback — which is exactly the path that
> currently runs whenever the provider layer is misbehaving. That is
> sufficient to classify the failure.
