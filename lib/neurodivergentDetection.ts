// ═══════════════════════════════════════════════════════════════════
// ─── NEURODIVERGENT / PROCESSING PATTERN DETECTION ───
// ═══════════════════════════════════════════════════════════════════
// Detects signals of neurodivergent and distinct processing styles.
// NOT for labeling — for adapting pacing, structure, and wording.
// Patterns are detected from repeated observed signals, not single messages.

export type NeurodivergentSignal =
  | 'fast_thinking'              // rapid thought patterns, jumping between topics
  | 'attention_switching'        // difficulty staying on one thread, switching focus
  | 'high_speed_processing'      // processes quickly, needs less repetition
  | 'high_sensitivity'           // quick overstimulation, sensory sensitivity
  | 'cognition_first'            // strong preference for understanding before feeling
  | 'mixed_cognition_overwhelm'  // switches between sharp analysis and overwhelm
  | 'frustration_with_vagueness' // irritation at unclear or imprecise language
  | 'need_for_speed'             // impatient with slow pacing, wants directness
  | 'difficulty_finishing'       // starts many threads, struggles to complete
  | 'overload_sensitivity'       // too many steps or options cause shutdown
  | 'repetition_aversion';       // strong negative reaction to repeated content

export interface NeurodivergentDetectionResult {
  signals: NeurodivergentSignal[];
  confidence: number; // 0-1
  suggestedAdaptations: string[]; // human-readable adaptation suggestions
}

// ─── Signal detection patterns ───

const FAST_THINKING_PATTERNS = [
  'mijn gedachten gaan snel', 'mijn hoofd gaat snel',
  'ik denk snel', 'ik spring van het ene naar het andere',
  'mijn gedachten racen', 'het gaat snel in mijn hoofd',
  'ik kan mijn gedachten niet bijhouden', 'alles gaat snel',
  'ik denk sneller dan ik kan praten', 'mijn brein gaat te snel',
  'te veel gedachten tegelijk', 'mijn hoofd staat niet stil',
  'mijn gedachten vliegen', 'het schiet alle kanten op',
];

const ATTENTION_SWITCHING_PATTERNS = [
  'mijn gedachten zijn overal', 'ik kan me niet focussen',
  'ik dwaal af', 'ik kan niet bij één ding blijven',
  'mijn aandacht springt', 'ik raak de draad kwijt',
  'waar had ik het over', 'ik ben de draad kwijt',
  'sorry ik dwaal af', 'ik kan me niet concentreren',
  'mijn focus is weg', 'ik spring steeds',
  'ik kan niet stilzitten', 'mijn hoofd is overal',
  'all over the place', 'alle kanten op',
];

const HIGH_SENSITIVITY_PATTERNS = [
  'ik ben gevoelig', 'ik ben hoogsensitief', 'hsp',
  'ik voel alles', 'ik neem alles op', 'ik absorbeer',
  'prikkels', 'overprikkeld', 'te veel prikkels',
  'geluid', 'te veel geluid', 'te druk', 'te veel mensen',
  'ik heb snel genoeg', 'ik raak snel overprikkeld',
  'mijn grens is snel bereikt', 'ik kan niet veel hebben',
  'alles komt hard binnen', 'het komt allemaal binnen',
  'ik filter niet', 'ik kan niet filteren',
];

const COGNITION_FIRST_PATTERNS = [
  'ik wil het eerst snappen', 'ik moet het begrijpen',
  'leg het me uit', 'ik wil weten waarom',
  'ik denk eerst', 'ik analyseer eerst',
  'voelen komt later', 'eerst denken dan voelen',
  'ik moet het ordenen', 'ik wil het op een rij',
  'geef me de logica', 'ik wil het rationeel begrijpen',
  'ik ben van het denken', 'ik leef in mijn hoofd',
];

const FRUSTRATION_WITH_VAGUENESS_PATTERNS = [
  'wees duidelijk', 'wees concreet', 'wees specifiek',
  'wat bedoel je precies', 'dat is vaag', 'dat zegt me niks',
  'dat is niet concreet', 'ik snap niet wat je bedoelt',
  'kun je specifieker zijn', 'wat bedoel je daar precies mee',
  'dat is te abstract', 'dat is te zweverig',
  'niet zo vaag', 'niet zo abstract',
  'kom ter zake', 'to the point', 'ter zake',
];

const NEED_FOR_SPEED_PATTERNS = [
  'dit gaat te langzaam', 'sneller', 'korter',
  'ik weet dit al', 'dat weet ik al', 'dat snap ik al',
  'je hoeft het niet uit te leggen', 'ik begrijp het al',
  'door', 'verder', 'volgende', 'next',
  'schiet op', 'ik heb niet zo veel tijd',
  'kort en bondig', 'to the point',
  'niet zo uitgebreid', 'minder woorden',
];

const DIFFICULTY_FINISHING_PATTERNS = [
  'ik begin altijd maar maak niet af',
  'ik start veel maar', 'ik kan niet afronden',
  'ik spring van het ene naar het andere',
  'ik heb zoveel ideeën maar', 'ik kom er niet aan toe',
  'ik stel uit', 'ik kan niet kiezen',
  'te veel opties', 'ik weet niet waar te beginnen',
  'alles tegelijk', 'ik wil alles tegelijk',
];

const OVERLOAD_SENSITIVITY_PATTERNS = [
  'te veel stappen', 'te veel opties', 'te veel keuzes',
  'te veel informatie', 'te veel tegelijk',
  'ik kan niet kiezen', 'kies voor mij',
  'zeg me wat ik moet doen', 'ik weet niet wat ik moet',
  'het is te veel', 'ik haak af', 'ik raak het overzicht kwijt',
  'minder opties', 'minder stappen', 'minder informatie',
  'hou het simpel', 'maak het simpel',
];

const REPETITION_AVERSION_PATTERNS = [
  'dat zei je al', 'je herhaalt jezelf', 'dat heb je al gezegd',
  'steeds hetzelfde', 'weer hetzelfde', 'altijd hetzelfde antwoord',
  'je zegt steeds hetzelfde', 'ik heb dit al gehoord',
  'dit weet ik al', 'dat weet ik al', 'ja dat zei je',
  'niet weer', 'niet nog een keer', 'alweer',
];

const MIXED_COGNITION_OVERWHELM_PATTERNS = [
  // These are detected by combining cognition-first + overwhelm signals
  // in the same session, not from single-message patterns
];

export function detectNeurodivergentSignals(text: string): NeurodivergentDetectionResult {
  const lower = text.toLowerCase().trim();
  const signals: NeurodivergentSignal[] = [];
  let totalScore = 0;

  // ── Fast thinking ──
  if (FAST_THINKING_PATTERNS.some(p => lower.includes(p)) ||
      /mijn\s+(gedachten|hoofd|brein)\s+(gaan|gaat|racen|vliegen|staan?\s+niet\s+stil)/i.test(lower) ||
      /te\s+veel\s+gedachten/i.test(lower)) {
    signals.push('fast_thinking');
    totalScore += 0.7;
  }

  // ── Attention switching ──
  if (ATTENTION_SWITCHING_PATTERNS.some(p => lower.includes(p)) ||
      /ik\s+(kan|kun)\s+(me\s+)?niet\s+(focussen|concentreren)/i.test(lower) ||
      /mijn\s+(aandacht|focus)\s+(springt|is\s+weg|dwaal)/i.test(lower) ||
      /ik\s+(dwaal|spring)\s+(af|steeds)/i.test(lower)) {
    signals.push('attention_switching');
    totalScore += 0.65;
  }

  // ── High sensitivity ──
  if (HIGH_SENSITIVITY_PATTERNS.some(p => lower.includes(p)) ||
      /ik\s+(ben|voel\s+me)\s+(hoog)?sensitief/i.test(lower) ||
      /alles\s+komt\s+(hard|sterk|heftig)\s+binnen/i.test(lower) ||
      /ik\s+(neem|absorbeer|voel)\s+alles\s+(op|mee)/i.test(lower)) {
    signals.push('high_sensitivity');
    totalScore += 0.6;
  }

  // ── Cognition first ──
  if (COGNITION_FIRST_PATTERNS.some(p => lower.includes(p)) ||
      /ik\s+(wil|moet)\s+(het\s+)?(eerst|altijd)\s+(snappen|begrijpen|ordenen)/i.test(lower) ||
      /eerst\s+(denken|begrijpen|snappen)/i.test(lower)) {
    signals.push('cognition_first');
    totalScore += 0.6;
  }

  // ── Frustration with vagueness ──
  if (FRUSTRATION_WITH_VAGUENESS_PATTERNS.some(p => lower.includes(p)) ||
      /wees\s+(duidelijk|concreet|specifiek|precies)/i.test(lower) ||
      /dat\s+(is|klinkt)\s+(vaag|abstract|zweverig)/i.test(lower) ||
      /niet\s+zo\s+(vaag|abstract|zweverig)/i.test(lower)) {
    signals.push('frustration_with_vagueness');
    totalScore += 0.7;
  }

  // ── Need for speed ──
  if (NEED_FOR_SPEED_PATTERNS.some(p => lower.includes(p)) ||
      /dit\s+gaat\s+te\s+langzaam/i.test(lower) ||
      /ik\s+(weet|snap|begrijp)\s+(dit|het|dat)\s+al/i.test(lower) ||
      /kort\s+en\s+bondig/i.test(lower)) {
    signals.push('need_for_speed');
    totalScore += 0.65;
  }

  // ── High speed processing (inferred from fast thinking + need for speed) ──
  if (signals.includes('fast_thinking') && signals.includes('need_for_speed')) {
    signals.push('high_speed_processing');
    totalScore += 0.3;
  }

  // ── Difficulty finishing ──
  if (DIFFICULTY_FINISHING_PATTERNS.some(p => lower.includes(p)) ||
      /ik\s+(begin|start)\s+(altijd|veel)\s+(maar|en)/i.test(lower) ||
      /ik\s+kan\s+niet\s+(afronden|afmaken|kiezen)/i.test(lower)) {
    signals.push('difficulty_finishing');
    totalScore += 0.6;
  }

  // ── Overload sensitivity ──
  if (OVERLOAD_SENSITIVITY_PATTERNS.some(p => lower.includes(p)) ||
      /te\s+veel\s+(stappen|opties|keuzes|informatie)/i.test(lower) ||
      /(hou|maak)\s+het\s+simpel/i.test(lower)) {
    signals.push('overload_sensitivity');
    totalScore += 0.65;
  }

  // ── Repetition aversion ──
  if (REPETITION_AVERSION_PATTERNS.some(p => lower.includes(p)) ||
      /je\s+(herhaalt|zegt\s+steeds|zei\s+al)/i.test(lower) ||
      /dat\s+(heb\s+je|zei\s+je)\s+al/i.test(lower)) {
    signals.push('repetition_aversion');
    totalScore += 0.7;
  }

  // Normalize confidence
  const confidence = signals.length > 0 ? Math.min(totalScore / signals.length, 1) : 0;

  // Generate adaptation suggestions
  const suggestedAdaptations: string[] = [];
  if (signals.includes('fast_thinking') || signals.includes('high_speed_processing')) {
    suggestedAdaptations.push('Match tempo — geen onnodige vertraging');
  }
  if (signals.includes('attention_switching') || signals.includes('difficulty_finishing')) {
    suggestedAdaptations.push('Bied structuur — één ding tegelijk, korte stappen');
  }
  if (signals.includes('high_sensitivity') || signals.includes('overload_sensitivity')) {
    suggestedAdaptations.push('Minimaliseer input — korter, minder opties');
  }
  if (signals.includes('cognition_first')) {
    suggestedAdaptations.push('Begin met uitleg/inzicht — voelen komt later');
  }
  if (signals.includes('frustration_with_vagueness')) {
    suggestedAdaptations.push('Wees precies en concreet — geen vage taal');
  }
  if (signals.includes('need_for_speed')) {
    suggestedAdaptations.push('Kort en direct — geen herhaling, geen omhaal');
  }
  if (signals.includes('repetition_aversion')) {
    suggestedAdaptations.push('Varieer altijd — herhaal nooit dezelfde zin of structuur');
  }

  return { signals, confidence, suggestedAdaptations };
}


// ═══════════════════════════════════════════════════════════════════
// ─── LANGUAGE PREFERENCE DETECTION ───
// ═══════════════════════════════════════════════════════════════════
// Detects what language style the user prefers based on their own language.
// This is NOT about Dutch/English — it's about communication style.

export type LanguageStyle =
  | 'body_based'     // uses body/somatic language naturally
  | 'cognitive'      // uses analytical/thinking language
  | 'direct'         // short, clear, no-nonsense
  | 'soft'           // gentle, careful, nuanced
  | 'structured'     // likes order, steps, clarity
  | 'intuitive'      // follows feeling, associative
  | 'grounded'       // practical, concrete, here-and-now
  | 'abstract';      // philosophical, meaning-seeking

export interface LanguagePreferenceResult {
  detected: LanguageStyle[];
  rejected: LanguageStyle[]; // styles the user has pushed back against
}

export function detectLanguagePreference(text: string): LanguageStyle[] {
  const lower = text.toLowerCase().trim();
  const styles: LanguageStyle[] = [];

  // Body-based language
  if (/\b(ik voel|mijn lijf|mijn lichaam|spanning|druk|warmte|koude|trillen|in mijn borst|in mijn buik)\b/i.test(lower)) {
    styles.push('body_based');
  }

  // Cognitive language
  if (/\b(ik denk|ik analyseer|logisch|rationeel|begrijpen|snappen|verklaring|mechanisme|patroon)\b/i.test(lower)) {
    styles.push('cognitive');
  }

  // Direct style
  if (lower.length < 40 || /\b(kort|bondig|to the point|duidelijk|concreet|gewoon|simpel)\b/i.test(lower)) {
    if (lower.length < 25) styles.push('direct');
  }

  // Soft style
  if (/\b(misschien|een beetje|voorzichtig|zachtjes|langzaam|rustig|eventjes)\b/i.test(lower) && lower.length > 30) {
    styles.push('soft');
  }

  // Structured style
  if (/\b(stappen|plan|structuur|overzicht|lijst|eerst|dan|vervolgens|ten eerste)\b/i.test(lower)) {
    styles.push('structured');
  }

  // Intuitive style
  if (/\b(ik voel dat|ergens weet ik|mijn gevoel zegt|intuïtie|buikgevoel|het voelt alsof)\b/i.test(lower)) {
    styles.push('intuitive');
  }

  // Grounded style
  if (/\b(concreet|praktisch|in de praktijk|hoe doe ik|wat kan ik doen|vandaag|morgen|nu)\b/i.test(lower)) {
    styles.push('grounded');
  }

  // Abstract style
  if (/\b(betekenis|zingeving|existentieel|dieper|groter|het leven|de kern|waarheid|essentie)\b/i.test(lower)) {
    styles.push('abstract');
  }

  return [...new Set(styles)];
}

// Detect language rejection — when the user pushes back against a style
export function detectLanguageRejection(text: string): LanguageStyle[] {
  const lower = text.toLowerCase().trim();
  const rejected: LanguageStyle[] = [];

  // Rejecting soft/gentle language
  if (/\b(niet zo zacht|niet zo voorzichtig|wees direct|wees eerlijk|niet zo omzichtig|niet zo lief)\b/i.test(lower) ||
      lower.includes('niet zo soft') || lower.includes('niet zo therapeutisch')) {
    rejected.push('soft');
  }

  // Rejecting body-based language
  if (/\b(niet het lichaam|niet mijn lichaam|niet weer lichaam|ik wil niet voelen|niet naar mijn lijf)\b/i.test(lower) ||
      lower.includes('weer die lichaamsvraag') || lower.includes('altijd dat lichaam')) {
    rejected.push('body_based');
  }

  // Rejecting cognitive/analytical language
  if (/\b(niet analyseren|niet zo analytisch|ik wil niet denken|niet in mijn hoofd|te veel denken)\b/i.test(lower)) {
    rejected.push('cognitive');
  }

  // Rejecting abstract language
  if (/\b(te abstract|te zweverig|te vaag|niet zo filosofisch|concreter|specifieker)\b/i.test(lower)) {
    rejected.push('abstract');
  }

  // Rejecting structured language
  if (/\b(niet zo gestructureerd|niet zo strak|niet zo schools|te veel stappen|te gestructureerd)\b/i.test(lower)) {
    rejected.push('structured');
  }

  return [...new Set(rejected)];
}


// ═══════════════════════════════════════════════════════════════════
// ─── DIRECT REQUEST DETECTION ───
// ═══════════════════════════════════════════════════════════════════
// Detects when the user explicitly asks for something specific:
// options, a sentence, an exercise, explanation, steps.
// When detected: answer the request FIRST, then detect state and move forward.

export type DirectRequestType =
  | 'options'        // "geef me opties"
  | 'sentence'       // "geef me een zin" / "zeg iets"
  | 'exercise'       // "geef me een oefening"
  | 'explanation'    // "leg uit" / "verklaar"
  | 'steps'          // "geef me stappen" / "wat moet ik doen"
  | 'summary'        // "vat samen" / "wat hebben we besproken"
  | 'direction';     // "wat nu" / "hoe verder"

export function detectDirectRequest(text: string): DirectRequestType | null {
  const lower = text.toLowerCase().trim();

  // Options
  if (/\b(geef\s+(me\s+)?opties|welke\s+opties|wat\s+zijn\s+mijn\s+opties|wat\s+kan\s+ik)\b/i.test(lower) ||
      lower.includes('geef me opties') || lower.includes('welke mogelijkheden')) {
    return 'options';
  }

  // Sentence / say something
  if (/\b(zeg\s+(iets|wat|eens)|geef\s+me\s+een\s+zin|schrijf\s+(iets|wat))\b/i.test(lower) ||
      lower.includes('zeg iets') || lower.includes('geef me een zin')) {
    return 'sentence';
  }

  // Exercise
  if (/\b(geef\s+me\s+een\s+oefening|een\s+oefening|oefening|ademhaling|grounding)\b/i.test(lower) ||
      lower.includes('geef me een oefening') || lower.includes('ik wil een oefening')) {
    return 'exercise';
  }

  // Explanation
  if (/\b(leg\s+(het\s+)?uit|verklaar|uitleg|hoe\s+werkt|wat\s+gebeurt\s+er)\b/i.test(lower) ||
      lower.includes('leg uit') || lower.includes('ik wil uitleg')) {
    return 'explanation';
  }

  // Steps
  if (/\b(geef\s+me\s+stappen|wat\s+moet\s+ik\s+doen|hoe\s+doe\s+ik|stap\s+voor\s+stap)\b/i.test(lower) ||
      lower.includes('geef me stappen') || lower.includes('wat moet ik doen')) {
    return 'steps';
  }

  // Summary
  if (/\b(vat\s+samen|samenvatting|wat\s+hebben\s+we|overzicht)\b/i.test(lower) ||
      lower.includes('vat samen') || lower.includes('samenvatting')) {
    return 'summary';
  }

  // Direction
  if (/\b(wat\s+nu|hoe\s+verder|en\s+nu|volgende\s+stap)\b/i.test(lower) ||
      lower.includes('wat nu') || lower.includes('hoe verder')) {
    return 'direction';
  }

  return null;
}


// ═══════════════════════════════════════════════════════════════════
// ─── SUPPORTIVE LEADERSHIP NEED DETECTION ───
// ═══════════════════════════════════════════════════════════════════
// Detects when the user needs the AI to step in with grounded direction
// rather than asking open questions. The user may be:
// - overwhelmed and unable to choose
// - dysregulated and unable to access clarity
// - unclear and asking for help but can't articulate what they need

export function detectLeadershipNeed(text: string, context?: {
  isOverwhelmed?: boolean;
  consecutiveQuietResponses?: number;
  isTraumaActivation?: boolean;
}): boolean {
  const lower = text.toLowerCase().trim();
  const ctx = context || {};

  // Explicit help requests without clarity
  if (/\b(help\s+me|ik\s+weet\s+niet|ik\s+kan\s+niet|ik\s+weet\s+het\s+niet|wat\s+moet\s+ik)\b/i.test(lower) ||
      lower.includes('help me') || lower.includes('ik weet niet wat ik moet') ||
      lower.includes('ik weet het niet meer') || lower.includes('ik kan niet kiezen')) {
    return true;
  }

  // Overwhelmed + short response = needs leadership
  if (ctx.isOverwhelmed && lower.length < 30) {
    return true;
  }

  // Multiple quiet responses = user may need direction
  if ((ctx.consecutiveQuietResponses || 0) >= 3) {
    return true;
  }

  // Trauma activation + confusion
  if (ctx.isTraumaActivation && lower.length < 40) {
    return true;
  }

  // Explicit "tell me what to do"
  if (/\b(zeg\s+(me\s+)?wat\s+ik|vertel\s+me\s+wat|kies\s+(voor\s+)?mij|bepaal\s+jij)\b/i.test(lower)) {
    return true;
  }

  return false;
}
