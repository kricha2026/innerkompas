// ─── FLOW-ROUTING DETECTION ───

import { detectProcessFrustration } from './types';

// Story/situation trigger words — when user mentions a situation, event, or conflict
export const STORY_TRIGGER_WORDS = [
  // Conflict / relational events
  'ruzie', 'conflict', 'discussie', 'aanvaring', 'confrontatie',
  'appje', 'bericht', 'mail', 'telefoontje', 'gesprek',
  'blokkeren', 'geblokkeerd', 'ontvriend', 'verwijderd',
  'uit elkaar', 'verlaten', 'weg', 'vertrokken',
  'bedrogen', 'vreemdgegaan', 'ontrouw', 'leugen', 'gelogen',
  // Events
  'gebeurd', 'voorval', 'incident', 'situatie', 'moment',
  'vandaag', 'gisteren', 'net', 'zojuist', 'vanmorgen', 'vanavond', 'vanmiddag',
  'op werk', 'op het werk', 'op school', 'thuis',
  // Relational triggers
  'mijn partner', 'mijn man', 'mijn vrouw', 'mijn vriend', 'mijn vriendin',
  'mijn moeder', 'mijn vader', 'mijn ouders', 'mijn kind', 'mijn kinderen',
  'mijn baas', 'mijn collega', 'mijn ex',
  'hij zei', 'zij zei', 'ze zeiden', 'die zei',
  'hij deed', 'zij deed', 'ze deden',
  // Narrative indicators
  'toen', 'daarna', 'vervolgens', 'opeens', 'plotseling', 'ineens',
  'en toen', 'maar toen',
];

// Patterns that indicate the user is telling a story (longer narrative text)
export const STORY_NARRATIVE_PATTERNS = [
  /ik had\s+(een|ruzie|gesprek|conflict)/i,
  /er is\s+(iets|wat)\s+gebeurd/i,
  /ik heb\s+(ruzie|een\s+gesprek|een\s+conflict)/i,
  /we\s+hadden\s+(ruzie|een\s+gesprek|een\s+conflict|een\s+discussie)/i,
  /ik\s+kreeg\s+(een\s+bericht|een\s+appje|een\s+mail|een\s+telefoontje)/i,
  /ik\s+zag\s+dat/i,
  /ik\s+hoorde\s+dat/i,
  /hij\s+heeft|zij\s+heeft|ze\s+hebben/i,
  /er\s+gebeurde/i,
  /ik\s+was\s+bij/i,
  /ik\s+kwam\s+erachter/i,
  /ik\s+ontdekte/i,
];

// Detect if user text contains a story/situation trigger
export function detectStoryTrigger(text: string): boolean {
  const lower = text.toLowerCase().trim();
  
  // Check trigger words
  for (const word of STORY_TRIGGER_WORDS) {
    if (lower.includes(word)) {
      return true;
    }
  }
  
  // Check narrative patterns
  for (const pattern of STORY_NARRATIVE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  // Longer messages (>60 chars) that describe events are likely stories
  if (lower.length > 80 && !detectProcessFrustration(text)) {
    // Check for past tense / narrative structure
    const narrativeIndicators = ['toen', 'daarna', 'maar', 'want', 'omdat', 'en toen', 'dus'];
    const indicatorCount = narrativeIndicators.filter(w => lower.includes(w)).length;
    if (indicatorCount >= 2) return true;
  }
  
  return false;
}


// Relaxation/integration signals — when user shows signs of calm, rest, or settling
export const RELAXATION_WORDS = [
  'rust', 'rustig', 'rustiger', 'kalm', 'kalmer', 'kalmte',
  'ontspanning', 'ontspannen', 'ontspant',
  'zakken', 'zakt', 'gezakt',
  'lichter', 'licht', 'lucht',
  'ruimte', 'meer ruimte', 'adem', 'ademen',
  'stilte', 'stil', 'vredig', 'vrede',
  'beter', 'het gaat beter', 'het lukt',
  'opluchting', 'opgelucht',
  'het zakt', 'het wordt minder', 'het wordt rustiger',
  'ik voel me beter', 'ik voel me rustiger', 'ik voel me kalmer',
  'het helpt', 'dat helpt', 'ja dat helpt',
  'het is zachter', 'zachter', 'milder',
  'ik kan ademen', 'ik kan weer ademen',
  'het laat los', 'loslaten', 'losser',
];

// Detect if user text indicates relaxation/integration
export function detectRelaxation(text: string): boolean {
  const lower = text.toLowerCase().trim();
  
  for (const word of RELAXATION_WORDS) {
    if (lower.includes(word)) {
      return true;
    }
  }
  
  return false;
}


// Overwhelm signals — when user is flooded/overstimulated
export const OVERWHELM_WORDS = [
  'te veel', 'teveel', 'overweldigd', 'overspoeld',
  'te snel', 'gaat te snel', 'te hard', 'te intens',
  'ik kan niet meer', 'kan niet meer', 'stop',
  'even stoppen', 'even pauze', 'pauze',
  'ik wil even niks', 'even niks',
  'het is te veel', 'dit is te veel',
  'ik raak in paniek', 'paniek',
  'ik kan niet denken', 'ik kan niet nadenken',
  'mijn hoofd', 'vol', 'te vol',
  'ik word gek', 'ik word er gek van',
  'te druk', 'te chaotisch',
];

// Detect if user text indicates overwhelm/overstimulation
export function detectOverwhelm(text: string): boolean {
  const lower = text.toLowerCase().trim();
  
  for (const word of OVERWHELM_WORDS) {
    if (lower.includes(word)) {
      return true;
    }
  }
  
  return false;
}


// Detect if user describes a body sensation (for flow advancement from emotion→body)
export const BODY_SENSATION_WORDS = [
  'borst', 'buik', 'keel', 'hoofd', 'schouders', 'rug', 'armen', 'benen', 'bekken',
  'druk', 'spanning', 'zwaar', 'licht', 'warm', 'koud', 'tintelingen', 'trillen',
  'knoop', 'bal', 'steen', 'band', 'prop', 'brok',
  'strak', 'stijf', 'hard', 'zacht',
  'kloppend', 'bonzend', 'prikkelend', 'brandend',
  'misselijk', 'duizelig', 'benauwd',
  'hartkloppingen', 'hartslagverhoging',
  'spierspanning', 'spierpijn',
];

export function detectBodySensation(text: string): boolean {
  const lower = text.toLowerCase().trim();
  
  for (const word of BODY_SENSATION_WORDS) {
    if (lower.includes(word)) {
      return true;
    }
  }
  
  // Patterns like "ik voel het in mijn..."
  const bodyPatterns = [
    /ik voel\s+(het\s+)?(in|bij)\s+(mijn|m'n|de)/i,
    /het zit\s+(in|bij)\s+(mijn|m'n|de)/i,
    /mijn\s+(borst|buik|keel|hoofd|schouders|rug|armen|benen|bekken)/i,
    /in mijn\s+(borst|buik|keel|hoofd|schouders|rug|armen|benen|bekken)/i,
  ];
  
  for (const pattern of bodyPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  return false;
}


// Detect if user asks AI to slow down
export function detectSlowDownRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const patterns = [
    'te snel', 'gaat te snel', 'langzamer', 'rustiger',
    'even rustig', 'rustig aan', 'niet zo snel',
    'wacht even', 'even wachten', 'momentje',
    'te veel vragen', 'teveel vragen',
    'een voor een', 'één voor één',
    'kalm aan', 'ho even', 'ho',
  ];
  
  for (const p of patterns) {
    if (lower.includes(p)) {
      return true;
    }
  }
  
  return false;
}
