/**
 * ─── LOCAL FALLBACK AI ───
 * 
 * Generates context-aware therapeutic responses when the edge function
 * is unreachable (fetch failed, timeout, network error, etc.)
 * 
 * This is NOT a replacement for the AI — it's a safety net that ensures
 * the user always gets a meaningful response, even when the backend is down.
 * 
 * Responses are based on:
 * - Current flow stage (story, emotion, body, integrating)
 * - Client-side detections (overwhelm, relaxation, somatic entry, etc.)
 * - Reflective Sparring Partner Mode (high self-awareness, insight requests)
 * - Message count (early vs. later in session)
 * - Last user message content
 * - Continuity-question + meaningful-memory awareness (v3.7.3):
 *     When the user asks a continuity question ("weet je nog wie ik ben",
 *     "weet je nog wat belangrijk is voor mijn begeleiding", etc.) and
 *     `clientStatusMemory` is available, the fallback answers CONCRETELY
 *     from memory (name, refined style prefs, top moments, persoonsduiding,
 *     progressSummary, shortStatus) instead of emitting a generic regulation
 *     / holding template. This eliminates the regression where continuity
 *     questions were routed into "Voel je voeten op de grond"-style replies.
 */
 
import type { AIResponse, FlowStage, CompassState } from '@/lib/types';
import type { ClientStatusMemory } from '@/lib/clientStatusMemory';
import { rankMoments } from '@/lib/meaningfulMemory';

interface FallbackContext {
  flowStage: FlowStage;
  isOverwhelmed: boolean;
  isRelaxing: boolean;
  isSomaticEntry: boolean;
  isCognitiveEntry: boolean;
  isTraumaActivation: boolean;
  lastMessageHasEmotion: boolean;
  lastMessageHasBodySensation: boolean;
  lastMessageHasStoryTrigger: boolean;
  lastMessageProcessFrustration: boolean;
  innerFocusWorsening: boolean;
  bodyBoundarySet: boolean;
  messageCount: number;
  userText: string;
  recentUserTurns?: string[];
  compassState?: CompassState | null;
  // ─── Reflective Sparring Partner Mode (optional — added for enhanced fallback) ───
  isHighSelfAwareness?: boolean;
  isInsightPriorityRequest?: boolean;
  dominantLayer?: 'thinking' | 'feeling' | 'body' | 'existential' | null;
  recentAiQuestionCount?: number;
  isQuietResponse?: boolean;
  consecutiveQuietResponses?: number;
  // ─── v3.7.3: Meaningful-memory awareness ───
  // When present, the fallback can answer continuity questions CONCRETELY
  // from stored memory rather than dropping into a regulation/holding template.
  clientStatusMemory?: ClientStatusMemory | null;
}

/**
 * Helper to create a base AIResponse with common defaults.
 */
function makeResponse(overrides: Partial<AIResponse> & { message: string }): AIResponse {
  return {
    quickReplies: [],
    phaseTransition: null,
    detectedMode: null,
    crisis: false,
    dysregulation: false,
    emotionWords: [],
    markStable: false,
    showBodyMap: false,
    silenceMode: false,
    activeAgent: null,
    regulationDomain: null,
    entryPoint: null,
    compassSignals: [],
    identityThemes: [],
    insightOffered: false,
    compassState: null,
    secondaryCompassState: null,
    ...overrides,
  };
}

/**
 * ─── CONTINUITY-QUESTION DETECTION (client-side mirror of edge fn v3.7.1) ───
 *
 * Mirrors the edge-function's `detectsContinuityQuestion` patterns so that
 * when the edge function is unreachable, the LOCAL fallback can still
 * recognize a continuity question and answer it from memory rather than
 * routing it into a grounding / holding template.
 *
 * v3.8-routing: widened to also match the "jij" form ("weet jij nog wie ik
 * ben") and common continuity-intent phrasings without "weet je". The
 * previous regexes only matched "weet je"; the user literally typed
 * "Weet jij nog wie ik ben" and was silently falling through to the intake
 * branch because "jij" was never recognized.
 */
function isContinuityQuestion(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();
  // Normalize "weet jij" → "weet je" for pattern matching (non-destructive, local only).
  const n = t
    .replace(/\bweet\s+jij\b/g, 'weet je')
    .replace(/\bken\s+jij\b/g, 'ken je')
    .replace(/\bherken\s+jij\b/g, 'herken je')
    .replace(/\bonthoud\s+jij\b/g, 'onthoud je')
    .replace(/\bheb\s+jij\b/g, 'heb je');
  const patterns: RegExp[] = [
    /weet je (nog )?wie ik ben/,
    /weet je (nog )?(wat |hoe )?(mijn )?naam/,
    /ken je mij/,
    /herken je mij/,
    /weet je (nog )?hoe ik (wil|graag) (dat je )?werk/,
    /weet je (nog )?hoe ik (begeleid|behandeld|benaderd)/,
    /weet je (nog )?waar we (gebleven|waren)/,
    /weet je (nog )?wat we (besproken|deden|hadden)/,
    /onthoud je (mij|mij nog|nog wat)/,
    /weet je (nog )?(wat|wat is) mijn (terugkerende )?patroon/,
    /weet je (nog )?wie je voor mij (bent|was)/,
    /weet je (nog )?hoe je heet/,
    /heb je geheugen/,
    /heb je (mij|mij nog) onthouden/,
    // Extended: "weet je nog wat belangrijk is voor ..." / "weet je nog wat voor mij werkt"
    /weet je (nog )?wat belangrijk is (voor )?(mijn |mij)/,
    /weet je (nog )?wat (voor )?mij (werkt|helpt)/,
    /weet je (nog )?wat ik nodig heb/,
    /weet je (nog )?mijn (voorkeur|stijl|aanpak)/,
  ];
  return patterns.some((p) => p.test(n));
}

/**
 * ─── EXPLICIT QUESTION-INTENT DETECTION (v3.8-routing fix) ───
 *
 * Detects when the user is explicitly announcing that they want to ASK
 * the assistant something — e.g. "ik wil je wat vragen", "mag ik je iets
 * vragen", "ik stel je een vraag", "ik heb een vraag", "ik wil je iets
 * vragen", "vraagje". This intent MUST override the intake/regulation
 * opener flow: answering with "Wat speelt er op dit moment het meest?" is
 * a routing error — the user's direct intent was a question, not a
 * regulation prompt.
 *
 * This detector deliberately does NOT fire on phrases like
 * "ik heb wel een vraag over hoe ik me voel" (which already contain the
 * substantive question), nor on casual "de vraag is of ..." prose. It
 * fires only on short announcement-style turns.
 */
function isExplicitQuestionIntent(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const raw = text.trim().toLowerCase();
  if (raw.length > 120) return false; // long prose is not a pure announcement
  const normalized = raw
    .replace(/\bje\b/g, 'je')
    .replace(/\bjij\b/g, 'je')
    .replace(/[!?.,]+$/g, '')
    .trim();
  const patterns: RegExp[] = [
    /^(ik wil|ik zou graag|mag ik)\s+(je|u)?\s*(iets|wat|even)?\s*vragen\b/,
    /^ik stel (je|u) (een|nog een)?\s*vraag\b/,
    /^ik heb (even\s+)?(een|nog een|een andere)?\s*vraag(je)?(\s+aan\s+(jou|je|u))?\b/,
    /^(even een|heb ik een|is er een|een)\s*vraag(je)?\b/,
    /^vraag(je)?\s*(aan (je|u))?$/,
    /^(kan|mag) ik (je|u) (iets|wat|een ding)\s*vragen\b/,
    /^(ik wil|ik zou graag)\s+(even|kort)?\s*iets (weten|vragen)\b/,
    /^kun je (me|mij) (iets|wat) (vertellen|uitleggen|zeggen)\b/,
  ];
  return patterns.some((p) => p.test(normalized));
}

/**
 * ─── EXPLICIT QUESTION-INTENT RESPONSE BUILDER ───
 *
 * When the user announces a question ("ik wil je wat vragen"), the assistant
 * must stay OPEN and invite the actual question — not push them into
 * intake/regulation prompts. This keeps the conversation on the user's
 * chosen track.
 */
function buildExplicitQuestionIntentResponse(
  memory: ClientStatusMemory | null | undefined,
): AIResponse {
  const name = memory?.meaningfulMemory?.preferredName || null;
  const message = name
    ? `Ja ${name}, vraag maar. Ik luister — wat wil je weten?`
    : 'Ja, vraag maar. Ik luister — wat wil je weten?';
  return makeResponse({
    message,
    // Deliberately empty: we do NOT want to nudge them into an intake menu.
    // The user said "I want to ask you something" — the UI should just let
    // them type the actual question.
    quickReplies: [],
    activeAgent: 'validation',
  });
}
/**
 * ─── QUESTION CONTINUITY RULE ───
 *
 * If the user asks a question, the assistant should answer that question.
 * If the user stays on that same question-track through follow-up turns,
 * the assistant must stay with that track too.
 *
 * Do NOT fall back too quickly into:
 * - generic intake prompts
 * - regulation prompts
 * - "what is most present now?"
 * - body-first rerouting
 *
 * First finish the relational interaction:
 * answer, clarify, continue, then redirect only if truly needed.
 */
/**
 * ─── FOLLOW-THROUGH RULE ───
 *
 * When the user asks a question, do not only answer briefly and then stop.
 * Keep the interaction alive in a natural way.
 *
 * After answering:
 * - stay with the same topic
 * - offer one natural next step if relevant
 * - allow clarification or deepening
 * - do not abruptly reset into intake/regulation
 *
 * The assistant should feel conversational, not transactional.
 */
function isQuestionFollowup(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase().trim();

  const patterns: RegExp[] = [
    /wil je antwoord geven op mijn vraag/,
    /wil jij mijn vraag beantwoorden/,
    /geef antwoord op mijn vraag/,
    /ik vraag jou wat/,
    /ik stel je een vraag/,
    /waarom geef je geen antwoord/,
    /ik wil gewoon antwoord/,
    /ik praat tegen jou/,
    /ik wil weten wat jij weet/,
    /wat weet je nog/,
    /weet je nog meer/,
    /en verder/,
    /waar waren we gebleven/,
  ];

  return patterns.some((p) => p.test(t));
}

function detectStickyFallbackMode(
  recentUserTurns: string[] | undefined,
): 'question' | 'continuity' | null {
  if (!Array.isArray(recentUserTurns) || recentUserTurns.length === 0) return null;

  const normalized = recentUserTurns
    .filter(Boolean)
    .slice(-4)
    .map((t) => String(t).toLowerCase().trim());

  const hasContinuity = normalized.some((t) => isContinuityQuestion(t));
  const hasExplicitQuestion = normalized.some((t) => isExplicitQuestionIntent(t));
  const hasQuestionFollowup = normalized.some((t) => isQuestionFollowup(t));

  if (hasContinuity) return 'continuity';
  if (hasExplicitQuestion || hasQuestionFollowup) return 'question';

  return null;
}

/**
 * ─── CONTINUITY RESPONSE BUILDER ───
 *
 * Constructs a natural, memory-grounded reply when the user asks a
 * continuity question AND we have something concrete in
 * `clientStatusMemory` to ground the answer in.
 *
 * Design:
 *   - Uses preferredName naturally when available (opens warmly).
 *   - Names 1–3 concrete things actually known (top moment, style prefs,
 *     persoonsduiding.kernpatroon / wat_helpt, progressSummary/shortStatus).
 *   - Never a data dump. Never verbatim analysis text.
 *   - If the memory is truly empty, returns null → caller falls through
 *     to the default fallback branch (handled separately, honestly).
 */
function buildContinuityResponse(
  memory: ClientStatusMemory | null | undefined,
  userText: string,
): AIResponse | null {
  if (!memory || !memory.hasAnalysis) return null;

  const mm = memory.meaningfulMemory;
  const pd = memory.persoonsduiding;
  const progress = memory.progressSummary;
  const status = memory.shortStatus;
  const name = mm?.preferredName || null;

  // Collect up to 3 concrete, non-generic fragments.
  const fragments: string[] = [];

  if (pd?.kernpatroon) fragments.push(`je terugkerende kernpatroon: ${pd.kernpatroon.toLowerCase()}`);
  if (pd?.wat_helpt && fragments.length < 3) fragments.push(`wat voor jou werkt: ${pd.wat_helpt.toLowerCase()}`);
  if (!pd?.kernpatroon && progress && fragments.length < 3) {
    fragments.push(`waar we aan gewerkt hebben: ${progress.substring(0, 180).toLowerCase()}`);
  }
  if (status && fragments.length < 3 && !progress) {
    fragments.push(`waar je de laatste keer stond: ${status.substring(0, 160).toLowerCase()}`);
  }

  // Add style preferences if no concrete fragments yet OR if we still have room.
  if (fragments.length < 2 && mm) {
    const prefs: string[] = [];
    if (mm.refinedStyle.directVsGentle >= 0.3) prefs.push('direct, geen omhaal');
    else if (mm.refinedStyle.directVsGentle <= -0.3) prefs.push('zachter tempo');
    if (mm.refinedStyle.valuesPrecisionResonance >= 0.3) prefs.push('precisie en resonantie');
    if (mm.refinedStyle.systemLevelThinking >= 0.3) prefs.push('systeem-niveau denken');
    if (mm.refinedStyle.sensitivityToGeneric >= 0.3) prefs.push('geen generieke taal');
    if (prefs.length > 0) {
      fragments.push(`hoe je begeleid wilt worden: ${prefs.slice(0, 3).join(', ')}`);
    }
  }

  // Optionally add one top-ranked meaningful moment (paraphrased via its stored text).
  if (fragments.length < 3 && mm && mm.moments.length > 0) {
    const top = rankMoments(mm.moments)[0];
    if (top && top.kind === 'breakthrough') {
      fragments.push(`een moment dat jou eerder opende: ${top.text.toLowerCase()}`);
    } else if (top && top.kind === 'working_preference') {
      fragments.push(`een werkvoorkeur die je eerder aangaf: ${top.text.toLowerCase()}`);
    }
  }

  // If we truly have nothing concrete to say, let the caller produce an
  // honest non-memory fallback (handled in the default branch below).
  if (fragments.length === 0 && !name) return null;

  // Compose the reply. Keep it 2–4 sentences, natural, no data-dump cadence.
  const opener = name
    ? `Ja ${name}, ik ken de lijn met jou.`
    : 'Ja, ik ken de lijn met jou.';

  let body = '';
  if (fragments.length === 1) {
    body = ` Wat ik bij je herken is ${fragments[0]}.`;
  } else if (fragments.length >= 2) {
    const [a, b, c] = fragments;
    body = c
      ? ` Wat ik bij je herken is ${a}, en ${b} — en ${c}.`
      : ` Wat ik bij je herken is ${a}, en ${b}.`;
  }

  const tail = ' Waar wil je vandaag instappen?';

  const message = (opener + body + tail).replace(/\s{2,}/g, ' ').trim();

  return makeResponse({
    message,
    quickReplies: ['Waar we gebleven waren', 'Iets nieuws', 'Even landen eerst'],
    activeAgent: 'emotionClarity',
    insightOffered: true,
  });
}

/**
 * ─── HONEST FIRST-CONTACT REPLY FOR CONTINUITY QUESTIONS ───
 *
 * Used when the user asks a continuity question but no memory exists yet.
 * Honest, warm, NOT a regulation template.
 */
function buildHonestFirstContactResponse(): AIResponse {
  return makeResponse({
    message:
      'Ik herken je vraag. Ik kan je eerdere lijn nu lokaal niet ophalen. Stuur je vraag nog eens, dan probeer ik opnieuw verbinding te maken.',
    quickReplies: [],
    activeAgent: 'validation',
  });
}

/**
 * ─── RETURNING-USER CONTINUITY REPLY WITHOUT CONCRETE FIELDS ───
 *
 * v3.7.5 fix: When the user IS clearly a returning user (profile says
 * `sessionCount > 0` — which we now correct at session start from
 * `ik_sessions` when it drifted to 0, or when `messageCount > 0` for
 * the current session so we know there is already a relationship) BUT
 * we don't have concrete persoonsduiding / top-moment fields to quote,
 * we must NOT emit "We beginnen net samen". That sentence is only
 * truthful for a brand-new first-contact user.
 *
 * This reply honestly acknowledges that the line with them is known,
 * keeps the assistant on the continuity path (doesn't divert into a
 * regulation/intake template), and invites them to steer where to pick
 * up — without inventing concrete prior-session content.
 */
function buildReturningUserContinuityResponse(): AIResponse {
  return makeResponse({
    message:
"Ik zie dat je vraagt naar wat ik van je weet. De verbinding viel terug op lokaal noodantwoord. Probeer nog één keer, dan pak ik je echte geheugen erbij.",
quickReplies: [],
    activeAgent: 'emotionClarity',
    insightOffered: true,
  });
}

/**
 * Generate a fallback AI response based on session context.
 * Called when the edge function is completely unreachable.
 */
export function generateFallbackResponse(ctx: FallbackContext): AIResponse {
    const stickyMode = detectStickyFallbackMode(ctx.recentUserTurns);
  // ════════════════════════════════════════════════════════════════
  // ─── HIGHEST PRIORITY: EXPLICIT QUESTION INTENT ─── (v3.8-routing)
  // ════════════════════════════════════════════════════════════════
  // The user literally said "I want to ask you something" /
  // "Ik stel je een vraag" / "Ik heb een vraag". This is a DIRECT
  // CONVERSATIONAL INTENT, not a regulation signal. Answering with
  // "Wat speelt er op dit moment het meest?" or pushing them into
  // intake quick replies is a routing bug — it overrides their clear
  // intent. We must invite the actual question and stay out of their
  // way. This branch runs BEFORE everything else (including continuity,
  // overwhelm, intake openers) because the user's explicit ask is the
  // conversational trump card.
  if (
  isExplicitQuestionIntent(ctx.userText) ||
  stickyMode === 'question'
) {
  return buildExplicitQuestionIntentResponse(ctx.clientStatusMemory);
}

  // ════════════════════════════════════════════════════════════════
  // ─── NEXT PRIORITY: CONTINUITY QUESTIONS ─── (v3.7.3 regression fix)
  // ════════════════════════════════════════════════════════════════
  // If the user is asking "weet je nog wie ik ben", "weet je nog wat
  // belangrijk is voor mijn begeleiding", etc., we MUST answer from
  // memory — never route into a regulation/holding template. This
  // branch runs BEFORE overwhelm/trauma/etc. because continuity
  // questions are a qualitatively different need: recognition, not
  // co-regulation. Dropping them into "Voel je voeten op de grond"-
  // style replies was the exact regression the user reported.
  //
  // v3.7.5 fix: distinguish "brand-new user" from "returning user with
  // thin/no analysisMemory fields". For returning users we must NOT
  // emit "We beginnen net samen" — instead we stay on the continuity
  // path with an honest returning-user reply that keeps the topic open
  // and lets the user steer.
  if (
  isContinuityQuestion(ctx.userText) ||
  stickyMode === 'continuity'
) {
    const memoryAnswer = buildContinuityResponse(ctx.clientStatusMemory, ctx.userText);
    if (memoryAnswer) return memoryAnswer;

    // Returning-user signal:
    //  • already mid-conversation (messageCount > 0), OR
    //  • we have any stored analysis memory row at all (hasAnalysis), OR
    //  • messageCount > 1 (any prior turn in this session implies we're
    //    not literally at first contact).
    const looksReturning =
      ctx.messageCount > 1 ||
      !!(ctx.clientStatusMemory && ctx.clientStatusMemory.hasAnalysis);
    if (looksReturning) return buildReturningUserContinuityResponse();

    // Truly first contact → honest first-contact reply.
    return buildHonestFirstContactResponse();
  }



  // ── Crisis / overwhelm: short, grounding ──
  if (ctx.isOverwhelmed) {
    return makeResponse({
      message: 'Ik merk dat het veel is. Je hoeft nu niks te doen. Ik ben hier.',
      quickReplies: ['Ik wil even stilte', 'Help me gronden', 'Vertel wat er gebeurt'],
      dysregulation: true,
      activeAgent: 'resonance',
      compassState: 'overprikkeld',
    });
  }


  // ── Trauma activation: normalize, ground ──
  if (ctx.isTraumaActivation) {
    return makeResponse({
      message: 'Je lijf reageert nu sterk. Dat is niet gek — het probeert je te beschermen. Voel je je voeten op de grond?',
      quickReplies: ['Ja, een beetje', 'Nee, ik voel ze niet', 'Het is te veel'],
      detectedMode: 'body',
      dysregulation: true,
      activeAgent: 'somatic',
      regulationDomain: 'somatic',
      entryPoint: 'body',
      compassState: 'freeze_stuck',
    });
  }

  // ── Inner focus worsening: stop deepening, offer external focus ──
  if (ctx.innerFocusWorsening) {
    return makeResponse({
      message: 'Oké, we stoppen daarmee. Soms maakt naar binnen kijken het juist feller. Kijk even om je heen — wat is het eerste dat je ziet?',
      quickReplies: ['Ik zie iets', 'Het lukt niet', 'Ik wil praten'],
      activeAgent: 'realityAnchor',
      regulationDomain: 'cognitive',
      insightOffered: true,
    });
  }

  // ── Process frustration: acknowledge, don't defend ──
  if (ctx.lastMessageProcessFrustration) {
    return makeResponse({
      message: 'Ik hoor je. Dit werkt niet zo voor jou. Hoe wil je dat we verdergaan?',
      quickReplies: ['Anders aanpakken', 'Even pauze', 'Ik wil stoppen'],
      activeAgent: 'validation',
    });
  }

  // ─── REFLECTIVE SPARRING PARTNER MODE ───
  // When user shows high self-awareness or explicitly asks for depth/insight,
  // provide sharper, more analytical responses instead of generic questions.

  // Insight priority request: user explicitly asks for the why, the core, the mechanism
  if (ctx.isInsightPriorityRequest) {
    const lower = ctx.userText.toLowerCase();
    // Detect what kind of insight they want
    if (lower.includes('patroon') || lower.includes('herken')) {
      return makeResponse({
        message: 'Dat je dit patroon herkent is al een belangrijk signaal. Patronen ontstaan als beschermingsmechanismen — je zenuwstelsel heeft ooit geleerd dat dit de veiligste reactie was. De vraag is niet waarom je dit doet, maar wat je zenuwstelsel probeert te beschermen.',
        quickReplies: ['Wat bedoel je met bescherming?', 'Ik herken dat', 'Hoe doorbreek ik dit?'],
        detectedMode: 'reflection',
        activeAgent: 'emotionClarity',
        regulationDomain: 'cognitive',
        entryPoint: 'insight',
        insightOffered: true,
        compassState: 'insight_seeking',
      });
    }
    if (lower.includes('mechanisme') || lower.includes('dieper') || lower.includes('kern') || lower.includes('waarom')) {
      return makeResponse({
        message: 'Wat je beschrijft klinkt als een zenuwstelsel dat probeert controle te houden via denken wanneer het emotioneel overprikkeld raakt. De negatieve gedachte is dan niet de oorzaak maar het gevolg van activatie. Je brein zoekt een verklaring voor wat je lijf al voelt.',
        quickReplies: ['Dat klopt', 'Leg meer uit', 'Wat kan ik ermee?'],
        detectedMode: 'reflection',
        activeAgent: 'emotionClarity',
        regulationDomain: 'cognitive',
        entryPoint: 'insight',
        insightOffered: true,
        compassState: 'insight_seeking',
      });
    }
    // Generic insight request
    return makeResponse({
      message: 'Ik merk dat je dieper wilt kijken. Wat je beschrijft wijst op een beschermingspatroon — je systeem heeft geleerd om op een bepaalde manier te reageren op spanning of dreiging. Dat is geen fout, maar een overlevingsstrategie die ooit logisch was.',
      quickReplies: ['Vertel meer', 'Wat is de kern?', 'Hoe verandert dit?'],
      detectedMode: 'reflection',
      activeAgent: 'emotionClarity',
      regulationDomain: 'cognitive',
      entryPoint: 'insight',
      insightOffered: true,
      compassState: 'insight_seeking',
    });
  }

  // High self-awareness: shift to deeper analytical sparring mode
  if (ctx.isHighSelfAwareness && !ctx.isOverwhelmed) {
    return makeResponse({
      message: 'Je ziet het helder. Dat zelfbewustzijn is een kracht. Laat me scherper zijn: wat je beschrijft klinkt als een systeem dat oscilleert tussen controle en overgave. Het patroon zelf is niet het probleem — het is de automatische piloot die aanslaat. Waar merk je dat het kantelt?',
      quickReplies: ['Bij spanning', 'Bij nabijheid', 'Bij onzekerheid'],
      detectedMode: 'reflection',
      activeAgent: 'emotionClarity',
      regulationDomain: 'cognitive',
      entryPoint: 'insight',
      insightOffered: true,
      compassState: 'insight_seeking',
    });
  }

  // Consecutive quiet responses (ja, hmm, ok): provide reflective observation, not another question
  if (ctx.isQuietResponse && ctx.consecutiveQuietResponses && ctx.consecutiveQuietResponses >= 2) {
    return makeResponse({
      message: 'Ik merk dat je kort reageert. Dat kan betekenen dat je nadenkt, dat het moeilijk is om woorden te vinden, of dat je even ruimte nodig hebt. Ik blijf hier — je hoeft niks te forceren.',
      quickReplies: ['Ik denk na', 'Het is moeilijk', 'Ik wil even stilte'],
      activeAgent: 'resonance',
      silenceMode: false,
    });
  }

  // Question chain prevention: if AI has asked many questions recently, offer observation instead
  if (ctx.recentAiQuestionCount && ctx.recentAiQuestionCount >= 3) {
    return makeResponse({
      message: 'Laat me even samenvatten wat ik tot nu toe merk, in plaats van nog een vraag te stellen. Er speelt iets dat je raakt, en je probeert het te begrijpen. Dat zoeken zelf is al waardevol.',
      quickReplies: ['Ga verder', 'Ik wil iets toevoegen', 'Klopt'],
      activeAgent: 'emotionClarity',
      insightOffered: true,
    });
  }

  // ── Relaxation / integration: minimal, warm ──
  if (ctx.isRelaxing) {
    return makeResponse({
      message: 'Mooi. Ik merk dat er iets zakt. Neem de ruimte die er nu is.',
      markStable: true,
      silenceMode: true,
      activeAgent: 'integration',
      compassState: 'release_movement',
    });
  }

  // ── Somatic entry: acknowledge body, ask about sensation ──
  if (ctx.isSomaticEntry && !ctx.bodyBoundarySet) {
    return makeResponse({
      message: 'Je lijf laat iets merken. Dat is een belangrijk signaal. Waar voel je het het meest?',
      quickReplies: ['In mijn borst', 'In mijn buik', 'In mijn hoofd'],
      detectedMode: 'body',
      showBodyMap: !ctx.bodyBoundarySet,
      activeAgent: 'somatic',
      regulationDomain: 'somatic',
      entryPoint: 'body',
      compassState: 'body_signal',
    });
  }

  // ── Cognitive entry: give brief explanation ──
  if (ctx.isCognitiveEntry) {
    return makeResponse({
      message: 'Je wilt begrijpen wat er gebeurt. Dat is logisch — soms helpt het om het even te ordenen. Wat wil je het meest snappen?',
      quickReplies: ['Waarom ik zo reageer', 'Wat er in mijn lijf gebeurt', 'Hoe ik hiermee om kan gaan'],
      detectedMode: 'reflection',
      activeAgent: 'emotionClarity',
      regulationDomain: 'cognitive',
      entryPoint: 'cognitive',
      insightOffered: true,
      compassState: 'insight_seeking',
    });
  }

  // ── Flow stage based responses ──
  switch (ctx.flowStage) {
    case 'story_detected':
    case 'story_exploring':
      return makeResponse({
        message: 'Vertel. Ik luister. Wat is er gebeurd?',
        detectedMode: 'story',
        activeAgent: 'validation',
        entryPoint: 'story',
      });

    case 'emotion_exploring':
      if (ctx.bodyBoundarySet) {
        return makeResponse({
          message: 'Wat je voelt mag er zijn. Kun je het een naam geven — welk woord komt het dichtst in de buurt?',
          quickReplies: ['Verdriet', 'Boosheid', 'Iets anders'],
          activeAgent: 'emotionClarity',
          regulationDomain: 'emotional',
          entryPoint: 'emotion',
        });
      }
      return makeResponse({
        message: 'Ik hoor wat je voelt. Merk je het ook ergens in je lijf?',
        quickReplies: ['Ja, ik voel het ergens', 'Nee, niet echt', 'Ik weet het niet'],
        activeAgent: 'emotionClarity',
        regulationDomain: 'emotional',
        entryPoint: 'emotion',
      });

    case 'body_exploring':
      return makeResponse({
        message: 'Blijf er even bij. Wat merk je als je er aandacht aan geeft?',
        quickReplies: ['Het wordt sterker', 'Het wordt zachter', 'Het verandert niet'],
        detectedMode: 'body',
        activeAgent: 'somatic',
        regulationDomain: 'somatic',
        entryPoint: 'body',
        compassState: 'body_signal',
      });

    case 'integrating':
      return makeResponse({
        message: 'Er is ruimte. Neem even de tijd om te voelen hoe het nu is.',
        quickReplies: ['Het is rustiger', 'Er speelt nog iets', 'Ik wil afsluiten'],
        activeAgent: 'integration',
        compassState: 'integration',
      });
  }

  // ── Early in conversation: open invitation (name-aware when known) ──
  if (ctx.messageCount <= 2) {
    const knownName = ctx.clientStatusMemory?.meaningfulMemory?.preferredName || null;
    const opener = knownName
      ? `Fijn dat je er weer bent, ${knownName}. Vertel — wat speelt er nu voor je?`
      : 'Ik ben er. Vertel in je eigen woorden wat er speelt.';
    return makeResponse({
      message: opener,
      quickReplies: ['Er is iets gebeurd', 'Ik voel me niet goed', 'Ik weet niet waar ik moet beginnen'],
      activeAgent: 'validation',
    });
  }


  // ── Emotion detected: acknowledge and explore ──
  if (ctx.lastMessageHasEmotion) {
    return makeResponse({
      message: 'Ik hoor wat je zegt. Dat raakt iets. Waar merk je het nu het meest?',
      quickReplies: ctx.bodyBoundarySet
        ? ['In mijn hoofd', 'In mijn gevoel']
        : ['In mijn hoofd', 'In mijn gevoel', 'In mijn lijf'],
      activeAgent: 'emotionClarity',
      regulationDomain: 'emotional',
      entryPoint: 'emotion',
    });
  }

  // ── Story trigger: explore the story ──
  if (ctx.lastMessageHasStoryTrigger) {
    return makeResponse({
      message: 'Dat klinkt belangrijk. Vertel, wat is er precies gebeurd?',
      detectedMode: 'story',
      activeAgent: 'validation',
      entryPoint: 'story',
    });
  }

  // ─── TEXT-BASED CONTEXTUAL RESPONSE ───
  // When no specific detection fires, analyze the raw text for recognizable content
  // to provide a more specific response than the generic default.
  const textResponse = generateTextBasedResponse(ctx.userText, ctx.messageCount);
  if (textResponse) {
    return textResponse;
  }

  // — Default fallback: technical + neutral —

return makeResponse({
  message: 'Er ging technisch iets mis. Stuur je bericht gerust nog een keer.',
  quickReplies: [],
  activeAgent: 'validation',
});
}

/**
 * ─── TEXT-BASED CONTEXTUAL RESPONSE ───
 * 
 * Analyzes the raw user text for recognizable patterns when the formal
 * detection system doesn't fire a specific match. This catches common
 * conversational inputs that fall between the cracks of the detector system.
 * 
 * Returns null if no pattern is recognized (falls through to default).
 */
function generateTextBasedResponse(text: string, messageCount: number): AIResponse | null {
  const lower = text.toLowerCase().trim();

  // ── Overprikkeling / sensory overload (colloquial expressions) ──
  if (
    lower.includes('ontploft') || lower.includes('ontploffen') ||
    lower.includes('hoofd ontploft') || lower.includes('mijn hoofd') && (lower.includes('vol') || lower.includes('druk')) ||
    lower.includes('te druk') || lower.includes('supermarkt') && (lower.includes('hoofd') || lower.includes('druk') || lower.includes('vol')) ||
    lower.includes('overprikkeld') || lower.includes('te veel prikkels') ||
    lower.includes('te veel geluid') || lower.includes('te veel indrukken') ||
    lower.includes('drukke') && (lower.includes('dag') || lower.includes('week') || lower.includes('situatie'))
  ) {
    return makeResponse({
      message: 'Het klinkt alsof je systeem nog helemaal vol zit van de prikkels. Bij zoveel indrukken tegelijk kan je hoofd overbelast raken en voelt alles meteen te veel. Dat is niet gek — je zenuwstelsel heeft gewoon meer verwerkt dan het aankan.',
      quickReplies: ['Hoe kom ik eruit?', 'Het is nog steeds heftig', 'Ik herken dit'],
      dysregulation: true,
      activeAgent: 'realityAnchor',
      regulationDomain: 'cognitive',
      compassState: 'overprikkeld',
      insightOffered: true,
    });
  }

  // ── Control pattern / thinking as control mechanism ──
  if (
    (lower.includes('controle') && (lower.includes('spanning') || lower.includes('nadenken') || lower.includes('denken'))) ||
    (lower.includes('nadenken') && lower.includes('controle')) ||
    (lower.includes('altijd') && lower.includes('nadenken') && lower.includes('spanning')) ||
    (lower.includes('denken') && lower.includes('om') && lower.includes('controle'))
  ) {
    return makeResponse({
      message: 'Wat je beschrijft klinkt als een systeem dat controle probeert te houden via denken wanneer het emotioneel overbelast raakt. Het nadenken is dan niet de oorzaak maar het gevolg — je brein zoekt houvast als het lijf spanning voelt. Dat is een beschermingspatroon, geen fout.',
      quickReplies: ['Dat herken ik', 'Hoe doorbreek ik dit?', 'Leg meer uit'],
      detectedMode: 'reflection',
      activeAgent: 'emotionClarity',
      regulationDomain: 'cognitive',
      entryPoint: 'insight',
      insightOffered: true,
      compassState: 'mental_looping',
    });
  }

  // ── Grief / loss / missing someone ──
  if (
    (lower.includes('mis') && (lower.includes('hem') || lower.includes('haar') || lower.includes('iemand'))) ||
    lower.includes('rouw') || lower.includes('verlies') ||
    (lower.includes('verdrietig') && (lower.includes('droom') || lower.includes('gedroomd') || lower.includes('denk aan'))) ||
    (lower.includes('gedachten') && (lower.includes('gaan naar') || lower.includes('steeds naar')))
  ) {
    return makeResponse({
      message: 'Het gemis komt op momenten dat je systeem kwetsbaar is — als er veel van je gevraagd wordt, zoekt het naar veiligheid en verbinding. Dat die gedachten dan komen is niet zwakte, het is je systeem dat zoekt naar iets dat ooit houvast gaf.',
      quickReplies: ['Dat klopt', 'Het voelt anders dan eerst', 'Ik wil het begrijpen'],
      activeAgent: 'emotionClarity',
      regulationDomain: 'emotional',
      entryPoint: 'emotion',
      insightOffered: true,
      compassState: 'emotional_flooding',
    });
  }

  // ── Dream processing ──
  if (lower.includes('droom') || lower.includes('gedroomd') || lower.includes('nachtmerrie')) {
    return makeResponse({
      message: 'Dromen maken vaak iets los zonder dat je de inhoud nog weet. Je systeem verwerkt dan iets — en de emotionele afdruk kan de hele dag doorwerken als een soort toon die blijft hangen.',
      quickReplies: ['Dat herken ik', 'Het maakt me onrustig', 'Ik wil het loslaten'],
      activeAgent: 'emotionClarity',
      regulationDomain: 'emotional',
      insightOffered: true,
    });
  }

  // ── Feeling stuck / not knowing what to do ──
  if (
    (lower.includes('weet niet') && (lower.includes('wat') || lower.includes('hoe'))) ||
    lower.includes('ik zit vast') || lower.includes('ik kom er niet uit') ||
    lower.includes('loop vast') || lower.includes('geen uitweg')
  ) {
    return makeResponse({
      message: 'Het gevoel van vastzitten is op zich al een signaal. Het betekent vaak dat er iets is wat aandacht vraagt maar nog geen woorden heeft. Soms helpt het om niet te zoeken naar de uitweg, maar eerst te kijken wat je vasthoudt.',
      quickReplies: ['Wat bedoel je?', 'Ik voel het in mijn lijf', 'Ik wil het begrijpen'],
      activeAgent: 'emotionClarity',
      regulationDomain: 'cognitive',
      entryPoint: 'insight',
      insightOffered: true,
      compassState: 'freeze_stuck',
    });
  }

  // ── Anger / frustration at situation ──
  if (
    lower.includes('boos') || lower.includes('woedend') || lower.includes('kwaad') ||
    lower.includes('oneerlijk') || lower.includes('onrecht') ||
    (lower.includes('niet eerlijk') && !lower.includes('eerlijk gezegd'))
  ) {
    return makeResponse({
      message: 'Die boosheid is er niet voor niks. Het is een signaal dat er iets geraakt wordt wat voor jou echt telt — een grens, een waarde, iets wat niet klopt. Waar richt die kracht zich op?',
      quickReplies: ['Op een situatie', 'Op iemand', 'Op mezelf'],
      activeAgent: 'emotionClarity',
      regulationDomain: 'emotional',
      entryPoint: 'emotion',
      compassState: 'fight_activation',
    });
  }

  // ── Tiredness / exhaustion ──
  if (
    lower.includes('moe') || lower.includes('uitgeput') || lower.includes('opgebrand') ||
    lower.includes('geen energie') || lower.includes('leeg')
  ) {
    return makeResponse({
      message: 'Die vermoeidheid zegt iets. Soms is het fysiek, maar vaak zit er ook emotionele uitputting onder — alsof je systeem te lang te hard heeft gewerkt. Wat kost je op dit moment de meeste energie?',
      quickReplies: ['Alles tegelijk', 'Mensen om me heen', 'Mijn eigen gedachten'],
      activeAgent: 'emotionClarity',
      regulationDomain: 'emotional',
      entryPoint: 'emotion',
    });
  }

  // ── Longer text (> 80 chars) without specific detection — treat as story/sharing ──
  if (lower.length > 80) {
    return makeResponse({
      message: 'Ik hoor je. Er speelt veel. Laat me even meelezen — wat raakt je hier het meest in wat je net vertelde?',
      quickReplies: ['Het gevoel erbij', 'De situatie zelf', 'Wat het met me doet'],
      activeAgent: 'validation',
      entryPoint: 'story',
    });
  }

  return null;
}

