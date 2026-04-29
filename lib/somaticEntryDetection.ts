// ─── SOMATIC ENTRY DETECTION ───
// Detects strong somatic/body-first entry: misselijk, benauwd, hart bonkt, stikken, etc.
// When detected, PRIORITEIT override: body first, then emotion-link (skip story-first)

export const SOMATIC_ENTRY_WORDS = [
  // Acute physical distress
  'misselijk', 'misselijkheid', 'overgeven', 'kotsen', 'braken',
  'benauwd', 'benauwdheid', 'stikken', 'ik stik', 'geen lucht',
  'hart bonkt', 'hart klopt', 'hartkloppingen', 'mijn hart', 'hart gaat tekeer',
  'hartslagverhoging', 'hart rast', 'hart bonst',
  'hyperventileer', 'hyperventilatie', 'hyperventileren',
  'trillen', 'ik tril', 'ik beef', 'beven', 'schudden',
  'duizelig', 'duizeligheid', 'draaierig', 'het draait',
  'flauwvallen', 'ik val flauw', 'zwart voor ogen',
  'pijn in mijn borst', 'borstpijn', 'druk op mijn borst',
  'niet ademen', 'kan niet ademen', 'ik krijg geen lucht',
  'mijn keel zit dicht', 'keel dicht', 'brok in mijn keel',
  'mijn buik', 'buikkrampen', 'krampen',
  'zweten', 'ik zweet', 'koud zweet',
  'tintelingen', 'verdoofd', 'gevoelloos',
  'mijn lichaam doet', 'mijn lijf doet',
];

export const SOMATIC_ENTRY_PATTERNS = [
  /mijn\s+hart\s+(bonkt|klopt|rast|gaat|bonst|slaat)/i,
  /ik\s+(stik|beef|tril|zweet|hyperventileer)/i,
  /ik\s+(krijg|heb)\s+(geen\s+)?lucht/i,
  /ik\s+kan\s+niet\s+ademen/i,
  /ik\s+word\s+(misselijk|duizelig|benauwd)/i,
  /ik\s+voel\s+(me\s+)?(misselijk|duizelig|benauwd|flauw)/i,
  /het\s+voelt\s+alsof\s+ik\s+(stik|doodga|flauwval)/i,
  /mijn\s+(keel|borst|buik)\s+(zit|is)\s+(dicht|vol|zwaar)/i,
];

export function detectSomaticEntry(text: string): boolean {
  const lower = text.toLowerCase().trim();

  for (const word of SOMATIC_ENTRY_WORDS) {
    if (lower.includes(word)) {
      return true;
    }
  }

  for (const pattern of SOMATIC_ENTRY_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}
