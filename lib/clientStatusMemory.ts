/**
 * ─── CLIENT STATUS MEMORY (cross-session analysis reuse) ───
 *
 * Reuses the SAME AI analysis source that the coach Sessions page already displays
 * (ik_client_status: short_status, progress_summary, accumulated_insights,
 *  persoonsduiding, last_analysis_at) and injects it SILENTLY into the live
 *  inner-kompas-chat flow for the logged-in user.
 *
 * Goals:
 * 1. Live chat uses recurring insights, preferences, triggers, regulation style,
 *    "wat helpt / wat werkt niet", kernpatroon, coachrichting — same as coach view.
 * 2. No coach-only raw text is surfaced verbatim to the user. It is used as
 *    SILENT context for the model, not pasted into replies.
 * 3. Previous-session continuity is honest: if the stored analysis is reliable
 *    and recent enough, continuity is offered; otherwise the model is told NOT
 *    to invent prior-session content.
 *
 * IMPORTANT: no coach pages or coach UI are touched — this is read-only reuse
 * of an existing data source that already exists for this user.
 */

import { supabase } from '@/lib/supabase';
import {
  MeaningfulMemory,
  MeaningfulMemoryContext,
  buildMeaningfulMemoryContext,
  normalizeMeaningfulMemory,
  rankMoments,
  describeRefinedStyle,
} from '@/lib/meaningfulMemory';


// ─── DB row shape (subset we need for live chat) ───
interface ClientStatusRow {
  user_id: string;
  short_status: string | null;
  progress_summary: string | null;
  accumulated_insights: any; // jsonb — array of strings, or object, or null
  persoonsduiding: any; // jsonb — object keyed by PERSOONSDUIDING_FIELDS keys
  last_analysis_at: string | null;
  updated_at?: string | null;
  // ─── v3.8: emotional-precision memory layer (name + style refinement + big moments) ───
  meaningful_memory?: any;
}

// ─── In-memory shape used by the live chat ───
export interface ClientStatusMemory {
  hasAnalysis: boolean;
  lastAnalysisAt: Date | null;
  shortStatus: string | null;
  progressSummary: string | null;
  accumulatedInsights: string[];
  persoonsduiding: {
    kernpatroon?: string;
    onderliggende_laag?: string;
    beschermingsmechanisme?: string;
    wat_activeert?: string;
    wat_helpt?: string;
    wat_werkt_niet?: string;
    fase_readiness?: string;
    coachrichting_nu?: string;
  } | null;
  /**
   * "Reliable" = analysis exists AND was generated within the last 45 days.
   * If unreliable, the AI is explicitly told NOT to claim to remember specifics
   * from the previous session.
   */
  isReliableContinuity: boolean;
  /**
   * Emotional-precision memory layer (v3.8): preferred name, self-chosen
   * assistant role name, refined style preferences, meaningful moments.
   * Persisted in `ik_client_status.meaningful_memory`. Null when nothing
   * meaningful has been captured yet.
   */
  meaningfulMemory: MeaningfulMemory | null;
}


const EMPTY_MEMORY: ClientStatusMemory = {
  hasAnalysis: false,
  lastAnalysisAt: null,
  shortStatus: null,
  progressSummary: null,
  accumulatedInsights: [],
  persoonsduiding: null,
  isReliableContinuity: false,
  meaningfulMemory: null,
};

function safeStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.filter((x: any) => typeof x === 'string' && x.trim().length > 0).map((x: string) => x.trim());
  }
  if (typeof v === 'string' && v.trim().length > 0) return [v.trim()];
  return [];
}

function safeString(v: any): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  return null;
}

/** Detect whether a stored meaningful_memory blob contains anything useful. */
function isMeaningfulMemoryNonEmpty(mm: MeaningfulMemory | null): boolean {
  if (!mm) return false;
  if (mm.preferredName) return true;
  if (mm.assistantRoleName) return true;
  if (mm.moments && mm.moments.length > 0) return true;
  if (mm.refinedStyle) {
    for (const v of Object.values(mm.refinedStyle)) {
      if (typeof v === 'number' && Math.abs(v) >= 0.1) return true;
    }
  }
  return false;
}

/**
 * Load the client status memory for a logged-in user.
 * Returns an EMPTY_MEMORY shape if the row does not exist or loading fails —
 * never throws, so live chat startup is never blocked by analysis availability.
 *
 * v3.8: Also loads the lightweight meaningful_memory layer (name, refined style,
 * big moments). This does NOT gate hasAnalysis — a user can have meaningful
 * memory even before the coach-analysis pipeline has populated persoonsduiding.
 */
export async function loadClientStatusMemory(userId: string): Promise<ClientStatusMemory> {
  if (!userId) return EMPTY_MEMORY;
  try {
    const { data, error } = await supabase
      .from('ik_client_status')
      .select('user_id, short_status, progress_summary, accumulated_insights, persoonsduiding, last_analysis_at, updated_at, meaningful_memory')
      .eq('user_id', userId)
      .maybeSingle();
      console.log('[CLIENT STATUS QUERY RESULT]', {
  userId,
  error,
  data,
});

    if (error || !data) {
  console.log('[CLIENT STATUS QUERY RESULT]', {
    userId,
    error,
    data,
  });
  return EMPTY_MEMORY;
}

    const row = data as ClientStatusRow;
    const lastAt = row.last_analysis_at ? new Date(row.last_analysis_at) : null;

    // Reliability: analysis exists AND less than 45 days old
    const RELIABILITY_WINDOW_DAYS = 45;
    let isReliable = false;
    if (lastAt && !isNaN(lastAt.getTime())) {
      const ageDays = (Date.now() - lastAt.getTime()) / (1000 * 60 * 60 * 24);
      isReliable = ageDays <= RELIABILITY_WINDOW_DAYS;
    }

    // Parse persoonsduiding defensively
    let persoonsduiding: ClientStatusMemory['persoonsduiding'] = null;
    if (row.persoonsduiding && typeof row.persoonsduiding === 'object' && !Array.isArray(row.persoonsduiding)) {
      const pd = row.persoonsduiding as Record<string, any>;
      const filled: Record<string, string> = {};
      for (const key of [
        'kernpatroon',
        'onderliggende_laag',
        'beschermingsmechanisme',
        'wat_activeert',
        'wat_helpt',
        'wat_werkt_niet',
        'fase_readiness',
        'coachrichting_nu',
      ]) {
        const v = safeString(pd[key]);
        if (v) filled[key] = v;
      }
      if (Object.keys(filled).length > 0) {
        persoonsduiding = filled;
      }
    }

    // ─── v3.8: parse meaningful_memory defensively ───
    let meaningfulMemory: MeaningfulMemory | null = null;
    if (row.meaningful_memory && typeof row.meaningful_memory === 'object') {
      const parsed = normalizeMeaningfulMemory(row.meaningful_memory);
      if (isMeaningfulMemoryNonEmpty(parsed)) meaningfulMemory = parsed;
    }

    // hasAnalysis is true when EITHER coach analysis fields OR meaningful memory
    // has captured something — so a user who only has live-detected meaningful
    // signals still gets their memory surfaced.
    const hasCoachAnalysisFields =
      !!safeString(row.short_status) ||
      !!safeString(row.progress_summary) ||
      safeStringArray(row.accumulated_insights).length > 0 ||
      !!persoonsduiding;
    const hasAnalysis = hasCoachAnalysisFields || !!meaningfulMemory;

    const memory: ClientStatusMemory = {
      hasAnalysis,
      lastAnalysisAt: lastAt,
      shortStatus: safeString(row.short_status),
      progressSummary: safeString(row.progress_summary),
      accumulatedInsights: safeStringArray(row.accumulated_insights),
      persoonsduiding,
      isReliableContinuity: isReliable,
      meaningfulMemory,
    };

    console.log(
      `%c[ANALYSIS MEMORY] Geladen voor live chat%c — insights: ${memory.accumulatedInsights.length}, persoonsduiding: ${memory.persoonsduiding ? 'ja' : 'nee'}, meaningful: ${meaningfulMemory ? `name=${meaningfulMemory.preferredName ? 'y' : 'n'},moments=${meaningfulMemory.moments.length}` : 'geen'}, laatst: ${lastAt?.toISOString().slice(0, 10) || 'onbekend'}, betrouwbaar: ${memory.isReliableContinuity}`,
      'color: #805ad5; font-weight: bold;',
      'color: #718096;'
    );

    return memory;
  } catch (e) {
    console.warn('[ANALYSIS MEMORY] Fout bij laden client status:', e);
    return EMPTY_MEMORY;
  }
}

/**
 * Persist ONLY the meaningful_memory column for this user. Safe against
 * concurrent coach-analysis writes — we never touch other columns.
 *
 * If the row does not yet exist, upsert with only user_id + meaningful_memory.
 */
export async function saveMeaningfulMemory(
  userId: string,
  memory: MeaningfulMemory,
): Promise<void> {
  if (!userId) return;
  try {
    // Try update first (common path — row already exists from coach analysis or prior save).
    const { data: existingRow } = await supabase
      .from('ik_client_status')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingRow) {
  const { error: updateError } = await supabase
    .from('ik_client_status')
    .update({
      meaningful_memory: memory as any,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('[MEANINGFUL MEMORY SAVE] update failed:', updateError);
  } else {
    console.warn('[MEANINGFUL MEMORY SAVE] update ok', {
      userId,
      hasMemory: !!memory,
      topMomentsCount: Array.isArray(memory?.topMoments) ? memory.topMoments.length : 0,
    });
  }
} else {
  const { error: insertError } = await supabase
    .from('ik_client_status')
    .insert({
      user_id: userId,
      meaningful_memory: memory as any,
    });

  if (insertError) {
    console.error('[MEANINGFUL MEMORY SAVE] insert failed:', insertError);
  } else {
    console.warn('[MEANINGFUL MEMORY SAVE] insert ok', {
      userId,
      hasMemory: !!memory,
      topMomentsCount: Array.isArray(memory?.topMoments) ? memory.topMoments.length : 0,
    });
  }
}

    console.log(
      `%c[MEANINGFUL MEMORY] Opgeslagen%c — name=${memory.preferredName || '-'}, assistantRole=${memory.assistantRoleName || '-'}, moments=${memory.moments.length}`,
      'color: #38a169; font-weight: bold;',
      'color: #718096;'
    );
  } catch (e) {
    console.warn('[MEANINGFUL MEMORY] Fout bij opslaan meaningful memory:', e);
  }
}

/**
 * Build a compact, size-capped analysisMemory object for injection into the
 * AI sessionContext. Only the fields the model actually needs to personalize
 * the live response.
 *
 * Returns null when no usable memory exists — callers should NOT set an empty
 * object on the payload.
 */
export function buildAnalysisMemoryContext(memory: ClientStatusMemory | null): Record<string, any> | null {
  if (!memory || !memory.hasAnalysis) return null;

  // Compact the persoonsduiding — only non-empty fields, strings capped at 240 chars
  const CAP = 240;
  let pd: Record<string, string> | null = null;
  if (memory.persoonsduiding) {
    pd = {};
    for (const [k, v] of Object.entries(memory.persoonsduiding)) {
      if (typeof v === 'string' && v.trim().length > 0) {
        pd[k] = v.length > CAP ? v.substring(0, CAP) + '…' : v;
      }
    }
    if (Object.keys(pd).length === 0) pd = null;
  }

  // Cap insights: max 6 items, each max 200 chars
  const insights = memory.accumulatedInsights
    .slice(0, 6)
    .map(i => (i.length > 200 ? i.substring(0, 200) + '…' : i));

  const ctx: Record<string, any> = {
    hasAnalysis: true,
    isReliableContinuity: memory.isReliableContinuity,
    lastAnalysisAt: memory.lastAnalysisAt ? memory.lastAnalysisAt.toISOString() : null,
    shortStatus: memory.shortStatus
      ? (memory.shortStatus.length > 300 ? memory.shortStatus.substring(0, 300) + '…' : memory.shortStatus)
      : null,
    progressSummary: memory.progressSummary
      ? (memory.progressSummary.length > 400 ? memory.progressSummary.substring(0, 400) + '…' : memory.progressSummary)
      : null,
    accumulatedInsights: insights,
    persoonsduiding: pd,
  };

  // ─── v3.8: surface meaningful memory (name, style refinement, top moments) ───
  const mmCtx: MeaningfulMemoryContext | null = buildMeaningfulMemoryContext(memory.meaningfulMemory);
  if (mmCtx) {
    ctx.meaningfulMemory = mmCtx;
  }

  // Hard cap the whole blob at ~3KB just in case
  const serialized = JSON.stringify(ctx);
  if (serialized.length > 3000) {
    // Drop the progress summary and trim insights further
    ctx.progressSummary = null;
    ctx.accumulatedInsights = ctx.accumulatedInsights.slice(0, 3);
    // If still too large, trim top moments
    if (ctx.meaningfulMemory?.topMoments?.length > 3) {
      ctx.meaningfulMemory = {
        ...ctx.meaningfulMemory,
        topMoments: ctx.meaningfulMemory.topMoments.slice(0, 3),
      };
    }
  }

  return ctx;
}


/**
 * Build a compact flow-instruction string that tells the AI HOW to use the
 * analysisMemory silently. Returns null if there's nothing useful to guide on.
 *
 * This instruction enforces:
 * - Use silently to personalize tone/pace/approach
 * - Do NOT paste coach analysis text verbatim into replies
 * - Do NOT invent specific prior-session content when continuity is unreliable
 *
 * REGRESSION FIX (memory behavior audit):
 * Previously the "unreliable continuity" branch literally instructed the model
 * to answer with the phrase "Ik heb geen betrouwbare herinnering aan de
 * precieze vorige sessie" — which the live assistant then quoted back to
 * users almost verbatim, contradicting the actual Inner Kompas architecture
 * (which DOES carry personalProfile + ongoing session + prior assistant turns
 * across the conversation). The replacement wording below removes that
 * scripted disclaimer and instead instructs the model to USE the continuity
 * channels that ARE available, while only abstaining from inventing concrete
 * details from a previous session it has no record of.
 */
export function buildAnalysisMemoryInstruction(memory: ClientStatusMemory | null): string | null {
  if (!memory || !memory.hasAnalysis) return null;

  const parts: string[] = [];
  parts.push(
    'PERSOONLIJKE ANALYSE-GEHEUGEN (uit eerdere sessies met deze gebruiker): ' +
    'Gebruik `sessionContext.analysisMemory` STIL om deze sessie te personaliseren — ' +
    'tempo, toon, regulatiepad, wel/niet-helpende benaderingen, bekende triggers, voorkeursstijl (cognitie-eerst vs gevoel-eerst), ' +
    'herkenbare kernpatronen en eerder succesvolle interventies. ' +
    'Dit is COACH-OBSERVATIE: parafraseer hooguit in eigen woorden wanneer het direct bijdraagt aan de huidige reactie. ' +
    'Kopieer of citeer de analyse-tekst NOOIT letterlijk aan de gebruiker. ' +
    'Dump geen samenvattingen; laat de intelligentie zich uiten in passende tussenzinnen, keuzes en diepte.'
  );

  // Continuity guidance — honest behavior aligned with what the system actually has
  if (memory.isReliableContinuity) {
    parts.push(
      'CONTINUÏTEIT (recente analyse beschikbaar): Je mag subtiel verwijzen naar terugkerende thema\'s, ' +
      'eerder gedetecteerde patronen, voorkeursstijl en wat eerder hielp/niet hielp — gebaseerd op de expliciete velden ' +
      'in analysisMemory (shortStatus, progressSummary, accumulatedInsights, persoonsduiding) en op de personalProfile-velden. ' +
      'Verzin GEEN concrete gespreksdetails die niet in deze velden staan. ' +
      'Als de gebruiker vraagt "weet je nog waar we gebleven waren?" — antwoord vanuit de feitelijke velden ' +
      '(bijv. terugkerend thema, kernpatroon, wat eerder hielp), zonder een specifiek scenario te fabriceren.'
    );
  } else {
    parts.push(
      'CONTINUÏTEIT (geen recente cross-sessie analyse beschikbaar): Je hebt nog steeds toegang tot ' +
      '`sessionContext.personalProfile` (terugkerende thema\'s, krachten, voorkeursstijl, wat eerder hielp) ' +
      'EN tot de volledige lopende sessie via `messages`. Gebruik die continuïteit natuurlijk en intelligent. ' +
      'Antwoord NOOIT met generieke disclaimers zoals "ik heb geen geheugen", "ik heb geen herinnering", ' +
      '"elke sessie begint opnieuw" of "ik kan me niets herinneren" — die kloppen niet met dit systeem. ' +
      'Wat je WEL eerlijk kunt zeggen wanneer iemand vraagt naar specifieke details van een eerdere sessie ' +
      'die niet in profile/analysisMemory staan: dat je de grote lijn en het terugkerende patroon kent (en benoem die kort, ' +
      'als die er zijn), maar dat je niet alle precieze details van een vorige sessie woord voor woord paraat hebt. ' +
      'Verzin geen concrete gespreksinhoud van een eerdere sessie als die niet uit de beschikbare velden of de huidige messages komt.'
    );
  }

  // Persoonsduiding-derived concrete guidance
  if (memory.persoonsduiding) {
    const pd = memory.persoonsduiding;
    const hints: string[] = [];
    if (pd.wat_helpt) hints.push(`WAT HELPT DEZE GEBRUIKER (eerder vastgesteld): ${pd.wat_helpt}`);
    if (pd.wat_werkt_niet) hints.push(`WAT WERKT MEESTAL NIET: ${pd.wat_werkt_niet}`);
    if (pd.wat_activeert) hints.push(`WAT ACTIVEERT HET SYSTEEM: ${pd.wat_activeert}`);
    if (pd.coachrichting_nu) hints.push(`HUIDIGE COACHRICHTING: ${pd.coachrichting_nu}`);
    if (pd.fase_readiness) hints.push(`FASE-READINESS: ${pd.fase_readiness}`);
    if (hints.length > 0) {
      parts.push(
        'LAAT JE STILZWIJGEND STUREN door deze COACH-observaties: ' + hints.join(' | ') +
        '. Pas lengte, directheid, lichaamsgerichtheid en uitleg/inzicht-dosering hierop aan — zonder deze observaties als tekst te delen.'
      );
    }
  }

  // ─── v3.8: meaningful memory — name, refined style, big moments ───
  // This is EMOTIONAL-PRECISION memory. It captures what creates resonance,
  // what broke resonance, breakthroughs, identity symbols, and stable working-
  // style preferences across sessions. The model uses this SUBTLY — it is NOT
  // a data dump. Names are used naturally when fitting, style preferences are
  // honored in tone/length/register, meaningful moments inform recognition.
  const mm = memory.meaningfulMemory;
  if (mm) {
    const mmHints: string[] = [];
    if (mm.preferredName) {
      mmHints.push(
        `De naam van deze gebruiker is "${mm.preferredName}". Gebruik die natuurlijk waar passend — NIET in elke zin, NIET geforceerd, WEL wanneer het warmte of herkenning voegt. Vraag NOOIT opnieuw naar de naam.`
      );
    }
    if (mm.assistantRoleName) {
      mmHints.push(
        `Jouw relationeel gevormde rol/naam voor deze gebruiker is "${mm.assistantRoleName}" (natuurlijk ontstaan in eerdere sessies). Behoud die — vervang die NOOIT door generieke labels als "Inner Kompas AI" of "de app".`
      );
    }
    const stylePrefs = describeRefinedStyle(mm.refinedStyle);
    if (stylePrefs.length > 0) {
      mmHints.push(
        `Stabiele werkvoorkeuren (via herhaald bewijs): ${stylePrefs.join(' · ')}. Houd je toon, lengte en register hierbij — zonder dit ooit expliciet te benoemen tegen de gebruiker.`
      );
    }
    const topMoments = rankMoments(mm.moments).slice(0, 5);
    if (topMoments.length > 0) {
      const momentLines = topMoments.map((m) => {
        const kindLabel: Record<string, string> = {
          resonance_opening: 'wat eerder opende/landde',
          resonance_break: 'wat eerder NIET landde / brak resonantie',
          breakthrough: 'eerder doorbraak-moment',
          identity_symbol: 'relationeel symbool/naam',
          trust_marker: 'vertrouwens-moment',
          working_preference: 'expliciete werkvoorkeur',
        };
        const label = kindLabel[m.kind] || m.kind;
        const conf = m.confirmations > 1 ? ` (×${m.confirmations} bevestigd)` : '';
        return `• [${label}${conf}] ${m.text}`;
      });
      mmHints.push(
        'BETEKENISVOLLE MOMENTEN uit eerdere sessies (gebruik SUBTIEL om herkenning te voeden — NOOIT als opsomming tegen de gebruiker, NOOIT verbatim citeren, WEL als stille kalibratie voor woordkeuze, diepte en timing):\n' +
        momentLines.join('\n') +
        '\n→ Wanneer de huidige turn lijkt op een eerder openend moment: gebruik dat register opnieuw. ' +
        '→ Wanneer de huidige turn risico loopt om te klinken als een eerder rupture-moment (te generiek, te vlak): kies specifieker, preciezer, belichamender.'
      );
    }
    if (mmHints.length > 0) {
      parts.push('EMOTIONELE-PRECISIE GEHEUGEN (gebruik met fijngevoeligheid):\n' + mmHints.join('\n\n'));
    }
  }

  return parts.join('\n\n');
}


/**
 * ─── MEMORY ARCHITECTURE AWARENESS ───
 *
 * Always-injectable instruction describing what continuity channels ARE
 * available in the live Inner Kompas chat for THIS turn. Used by
 * buildInvokePayload to prevent the model from defaulting to generic
 * "I have no memory" responses when the system actually does carry context.
 *
 * The instruction is composed dynamically based on what is actually present
 * in this specific payload (profile present? analysisMemory present?
 * how many prior messages?), so the model gets an accurate self-model
 * rather than a hardcoded claim.
 */
export function buildMemoryArchitectureInstruction(args: {
  hasPersonalProfile: boolean;
  hasAnalysisMemory: boolean;
  priorMessageCount: number;
}): string {
  const channels: string[] = [];
  if (args.priorMessageCount > 0) {
    channels.push(`de lopende sessie (${args.priorMessageCount} eerdere berichten in deze conversatie)`);
  }
  if (args.hasPersonalProfile) {
    channels.push('`sessionContext.personalProfile` (cross-sessie patronen: terugkerende thema\'s, krachten, voorkeursstijl, wat eerder hielp/niet hielp)');
  }
  if (args.hasAnalysisMemory) {
    channels.push('`sessionContext.analysisMemory` (stille coach-analyse uit eerdere sessies)');
  }

  const channelList = channels.length > 0
    ? channels.join('; ')
    : 'alleen deze huidige turn (eerste bericht van een nieuwe gebruiker, nog geen profiel of analyse opgebouwd)';

  return (
    'GEHEUGEN-ARCHITECTUUR (ZELFMODEL — KRITIEK):\n' +
    'Je hebt in dit systeem WEL continuïteit. De volgende geheugenkanalen zijn NU actief: ' + channelList + '.\n\n' +
    'GEDRAGSREGEL:\n' +
    '→ Antwoord NOOIT met algemene disclaimers zoals "ik heb geen geheugen", "ik heb geen persoonlijk geheugen", ' +
    '"elke sessie begint opnieuw", "ik kan me niets van je herinneren", "ik heb geen toegang tot vorige gesprekken" ' +
    'of soortgelijke standaard-AI-formuleringen. Die kloppen niet met dit systeem.\n' +
    '→ Gebruik de beschikbare kanalen actief en natuurlijk. Verwijs terug naar wat eerder in deze sessie genoemd is. ' +
    'Bouw voort op personalProfile/analysisMemory wanneer die signalen dragen die nu relevant zijn.\n' +
    '→ Wanneer iemand een vraag stelt over wat je je herinnert: antwoord vanuit wat je daadwerkelijk hebt ' +
    '(grote lijn, terugkerend patroon, voorkeursstijl, eerder besproken thema\'s) — niet vanuit een ontkenning.\n' +
    '→ Eerlijke nuance is toegestaan EN gewenst: als je geen woordelijke details hebt van een specifieke eerdere ' +
    'sessie, zeg dan dat je de lijn en het patroon kent maar niet alle precieze details — en benoem KORT wat je wél kent. ' +
    'Verzin nooit concrete gespreksinhoud die niet uit de beschikbare kanalen komt.\n' +
    '→ Als er ECHT geen profiel, analyse of eerdere berichten zijn (eerste turn, nieuwe gebruiker): zeg dat eerlijk in ' +
    'natuurlijke taal ("we beginnen net samen — ik leer je in dit gesprek kennen"), zonder te beweren dat het systeem ' +
    'fundamenteel geen geheugen kan hebben.'
  );
}

