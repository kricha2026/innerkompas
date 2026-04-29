// ─── CRISIS DETECTION (PRECISE) ───
// Only trigger on genuinely suicidal/self-harm phrases.
// NEVER trigger on casual Dutch like "praten we niet meer" or "ik heb pijn in mijn buik".
// The old broad keywords ('niet meer', 'pijn', 'einde', 'dood', 'paniek', 'dissociatie', 'bevries')
// caused false positives and interrupted normal conversations.

// Tier 1: Always crisis — explicit suicidal/self-harm intent
export const CRISIS_PHRASES_EXACT = [
  'zelfmoord',
  'suïcide',
  'suicide',
  'ik wil dood',
  'ik wil niet meer leven',
  'ik wil er niet meer zijn',
  'ik wil een einde maken',
  'ik maak er een einde aan',
  'ik ga mezelf',
  'ik snij mezelf',
  'ik doe mezelf iets aan',
  'ik wil mezelf pijn doen',
  'ik wil mezelf iets aandoen',
  'een einde aan mijn leven',
  'einde aan mijn leven',
  'ik wil doodgaan',
];

// Colloquial expressions that contain crisis-like words but are NOT suicidal
// These are checked BEFORE crisis detection to prevent false positives
export const CRISIS_FALSE_POSITIVE_PATTERNS = [
  /ik\s+ga\s+dood\s+van\s+(de\s+)?(stress|verveling|warmte|kou|honger|dorst|pijn|het\s+lachen|de\s+hitte)/i,
  /doodmoe/i,
  /doodop/i,
  /doodeng/i,
  /doodstil/i,
  /doodleuk/i,
  /doodgewoon/i,
  /doodsbenauwd/i,
  /doodsbang/i,
  /doodgaan\s+van\s+(de\s+)?(stress|verveling|warmte|honger)/i,
  /bang\s+voor\s+de\s+dood/i,
];


// Tier 2: Regex patterns for more flexible matching of suicidal intent
export const CRISIS_REGEX_PATTERNS = [
  /ik\s+wil\s+(er\s+)?(niet\s+meer\s+)?dood/i,
  /ik\s+wil\s+niet\s+meer\s+leven/i,
  /ik\s+wil\s+er\s+niet\s+meer\s+zijn/i,
  /ik\s+(ga|wil)\s+(me|mij)zelf\s+(iets\s+aan|pijn|snij|verwond)/i,
  /ik\s+maak\s+er\s+een\s+einde\s+aan/i,
  /een\s+einde\s+(aan|maken)\s+(mijn\s+)?leven/i,
  /ik\s+wil\s+(gewoon\s+)?doodgaan/i,
  /ik\s+heb\s+geen\s+reden\s+(meer\s+)?om\s+te\s+leven/i,
  /ik\s+zie\s+geen\s+uitweg(\s+meer)?/i,
  /ik\s+wil\s+stoppen\s+met\s+leven/i,
  /beter\s+af\s+zonder\s+mij/i,
  /de\s+wereld\s+is\s+beter\s+af/i,
  // "ik ga dood" — but NOT "ik ga dood van de stress/verveling/etc."
  /ik\s+ga\s+dood(?!\s+van\s+(de\s+)?(stress|verveling|warmte|kou|honger|dorst|pijn|het\s+lachen|de\s+hitte))/i,
];

// Detect genuine crisis (suicidal/self-harm intent)
// Returns true ONLY for clearly suicidal/self-harm expressions
// Includes console logging for debugging/testing
export function detectCrisis(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // ── Pre-check: Exclude known false-positive colloquial expressions ──
  for (const fpPattern of CRISIS_FALSE_POSITIVE_PATTERNS) {
    if (fpPattern.test(lower)) {
      console.log(
        `%c[CRISIS DETECTIE] Vals-positief uitgesloten%c — "${text}" (match: ${fpPattern})`,
        'color: #805ad5; font-weight: bold;',
        'color: #718096;'
      );
      return false;
    }
  }

  // Tier 1: Exact phrase matching
  for (const phrase of CRISIS_PHRASES_EXACT) {
    if (lower.includes(phrase)) {
      console.log(
        `%c[CRISIS DETECTIE] TRIGGER (Tier 1 — exacte match)%c\n` +
        `  Tekst: "${text}"\n` +
        `  Match: "${phrase}"`,
        'color: #e53e3e; font-weight: bold;',
        'color: #e53e3e;'
      );
      return true;
    }
  }

  // Tier 2: Regex patterns
  for (const pattern of CRISIS_REGEX_PATTERNS) {
    if (pattern.test(lower)) {
      console.log(
        `%c[CRISIS DETECTIE] TRIGGER (Tier 2 — regex match)%c\n` +
        `  Tekst: "${text}"\n` +
        `  Patroon: ${pattern}`,
        'color: #e53e3e; font-weight: bold;',
        'color: #e53e3e;'
      );
      return true;
    }
  }

  console.log(
    `%c[CRISIS DETECTIE] Geen match%c — "${text}"`,
    'color: #38a169; font-weight: bold;',
    'color: #718096;'
  );
  return false;
}


// ─── TEST UTILITY: Run from browser console via window.testCrisisDetection() ───
// Tests a comprehensive set of false-positive and true-positive phrases
export function testCrisisDetection(): void {
  const falsePositives = [
    'praten we niet meer verder',
    'ik heb pijn in mijn buik',
    'het einde van de dag',
    'ik wil niet meer praten',
    'ik heb geen zin meer',
    'het doet pijn',
    'ik voel pijn in mijn borst',
    'ik kan niet meer nadenken',
    'ik ben in paniek',
    'ik wil stoppen met deze sessie',
    'het is het einde van het gesprek',
    'mijn coach zei dat ik moest bellen',
    'ik heb een zorgverlener',
    'ik ben doodmoe',
    'ik ga dood van de stress',
    'ik dissocieer soms',
    'ik bevries als ik dat hoor',
    'het voelt als paniek',
    'ik wil er niet meer over praten',
    'dat is niet meer van deze tijd',
    'ik kan er niet meer tegen',
    'de pijn wordt minder',
    'het einde is in zicht',
    'ik ben bang voor de dood',
  ];

  const truePositives = [
    'ik wil niet meer leven',
    'ik wil dood',
    'ik wil er niet meer zijn',
    'ik wil een einde maken',
    'ik maak er een einde aan',
    'ik ga mezelf iets aandoen',
    'ik wil mezelf pijn doen',
    'ik doe mezelf iets aan',
    'ik wil doodgaan',
    'zelfmoord',
    'suïcide',
    'een einde aan mijn leven',
    'ik heb geen reden meer om te leven',
    'ik zie geen uitweg meer',
    'de wereld is beter af zonder mij',
    'ik wil stoppen met leven',
  ];

  console.log('\n%c╔══════════════════════════════════════════════════════╗', 'color: #805ad5;');
  console.log('%c║       CRISIS DETECTIE — TESTRESULTATEN               ║', 'color: #805ad5; font-weight: bold;');
  console.log('%c╚══════════════════════════════════════════════════════╝\n', 'color: #805ad5;');

  // Test false positives
  console.log('%c── VALS-POSITIEVEN (moeten NIET triggeren) ──', 'color: #dd6b20; font-weight: bold;');
  let fpErrors = 0;
  for (const phrase of falsePositives) {
    const result = detectCrisis(phrase);
    if (result) {
      fpErrors++;
      console.log(`  %c✗ FOUT — triggerde onterecht:%c "${phrase}"`, 'color: #e53e3e; font-weight: bold;', 'color: #e53e3e;');
    } else {
      console.log(`  %c✓ OK — geen trigger:%c "${phrase}"`, 'color: #38a169;', 'color: #718096;');
    }
  }

  console.log('');

  // Test true positives
  console.log('%c── ECHTE CRISIS-ZINNEN (moeten WÉL triggeren) ──', 'color: #dd6b20; font-weight: bold;');
  let tpErrors = 0;
  for (const phrase of truePositives) {
    const result = detectCrisis(phrase);
    if (!result) {
      tpErrors++;
      console.log(`  %c✗ FOUT — miste crisis:%c "${phrase}"`, 'color: #e53e3e; font-weight: bold;', 'color: #e53e3e;');
    } else {
      console.log(`  %c✓ OK — crisis gedetecteerd:%c "${phrase}"`, 'color: #38a169;', 'color: #718096;');
    }
  }

  console.log('');

  // Summary
  const totalTests = falsePositives.length + truePositives.length;
  const totalErrors = fpErrors + tpErrors;
  const totalPassed = totalTests - totalErrors;

  if (totalErrors === 0) {
    console.log(
      `%c╔══════════════════════════════════════════════════════╗\n` +
      `║  ALLE ${totalTests} TESTS GESLAAGD                            ║\n` +
      `╚══════════════════════════════════════════════════════╝`,
      'color: #38a169; font-weight: bold;'
    );
  } else {
    console.log(
      `%c╔══════════════════════════════════════════════════════╗\n` +
      `║  ${totalPassed}/${totalTests} GESLAAGD — ${totalErrors} FOUT(EN)                       ║\n` +
      `╚══════════════════════════════════════════════════════╝`,
      'color: #e53e3e; font-weight: bold;'
    );
    if (fpErrors > 0) console.log(`  %c${fpErrors} vals-positief(en)`, 'color: #e53e3e;');
    if (tpErrors > 0) console.log(`  %c${tpErrors} gemiste crisis-zin(nen)`, 'color: #e53e3e;');
  }

  console.log('\n%cTip: Gebruik detectCrisis("je tekst hier") om individuele zinnen te testen.', 'color: #718096; font-style: italic;');
}
