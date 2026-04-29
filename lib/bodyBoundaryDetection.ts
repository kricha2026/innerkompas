// ─── BODY BOUNDARY DETECTION ───
// Detects when user explicitly asks to stop body-related questions (LICHAAM-GRENS)

export const BODY_BOUNDARY_PATTERNS = [
  // Direct requests to stop body questions
  'hou op met vragen naar mijn lichaam',
  'stop met lichaamsvragen',
  'stop met vragen over mijn lichaam',
  'geen lichaamsvragen meer',
  'niet meer over mijn lichaam',
  'laat mijn lichaam met rust',
  'ik wil niet over mijn lichaam praten',
  'ik wil het niet over mijn lichaam hebben',
  'niet meer naar het lichaam',
  'stop met het lichaam',
  'genoeg over mijn lichaam',
  'genoeg over het lichaam',
  'ik wil niet naar mijn lichaam',
  'hou op over mijn lichaam',
  'hou op over het lichaam',
  'stop over het lichaam',
  'stop over mijn lichaam',
  // Frustration with body questions specifically
  'weer dat lichaam',
  'altijd dat lichaam',
  'steeds dat lichaam',
  'weer die lichaamsvraag',
  'altijd die lichaamsvragen',
  'steeds die lichaamsvragen',
  'weer het lichaam',
  'niet weer het lichaam',
  'niet weer mijn lichaam',
  // Shorter / more colloquial
  'geen lichaam meer',
  'lichaam laten',
  'niet mijn lichaam',
  'ik wil niet voelen',
  'ik wil niet in mijn lichaam',
];

// Detect if user explicitly sets a body boundary (asks to stop body questions)
export function detectBodyBoundary(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Direct pattern match
  for (const pattern of BODY_BOUNDARY_PATTERNS) {
    if (lower.includes(pattern)) {
      return true;
    }
  }

  // Regex patterns for more flexible matching
  const regexPatterns = [
    /stop\s+(met|eens)\s+(het\s+)?lichaam/i,
    /hou\s+op\s+(met|over)\s+(het\s+|mijn\s+)?lichaam/i,
    /geen\s+(lichaam|lichaamsvra)/i,
    /niet\s+meer\s+(over|naar|het)\s+(mijn\s+)?lichaam/i,
    /laat\s+(mijn\s+)?lichaam\s+(met\s+)?rust/i,
  ];

  for (const pattern of regexPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}
