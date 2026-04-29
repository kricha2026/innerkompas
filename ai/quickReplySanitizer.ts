// ─── CLIENT-SIDE QUICK REPLY SANITIZATION ───
// Deduplicates, limits, cleans, and validates quick replies
// This is the LAST line of defense against broken quick replies
export function sanitizeQuickRepliesClient(replies: string[] | undefined): string[] {
  if (!replies || !Array.isArray(replies)) return [];

  let cleaned = replies
    // Must be non-empty strings
    .filter(r => r && typeof r === 'string' && r.trim().length > 0)
    // Clean each reply
    .map(r => r.trim().replace(/^["']+|["']+$/g, '').replace(/\.$/g, '').trim())
    // Remove empty after cleaning
    .filter(r => r.length > 0 && r.length < 80)
    // Remove replies that look like JSON or technical content
    .filter(r => !r.startsWith('{') && !r.startsWith('[') && !r.includes('"message"') && !r.includes('"quickReplies"'))
    // Remove replies that are just single characters or punctuation
    .filter(r => r.length > 1 || /[a-zA-Z]/.test(r))
    // Remove replies that look like error messages
    .filter(r => {
      const lower = r.toLowerCase();
      return !lower.includes('error') && !lower.includes('fallback') && !lower.includes('undefined') && !lower.includes('null');
    });

  // Deduplicate near-identical replies (case-insensitive)
  const seen = new Set<string>();
  cleaned = cleaned.filter(r => {
    const normalized = r.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (seen.has(normalized)) return false;
    // Check if any existing entry is a substring of this one or vice versa
    for (const s of seen) {
      if (s.includes(normalized) || normalized.includes(s)) return false;
      // If they share 80%+ characters at the start, consider duplicate
      const shorter = Math.min(s.length, normalized.length);
      if (shorter > 3) {
        let matches = 0;
        for (let i = 0; i < shorter; i++) {
          if (s[i] === normalized[i]) matches++;
        }
        if (matches / shorter > 0.8) return false;
      }
    }
    seen.add(normalized);
    return true;
  });

  // Max 3 replies
  return cleaned.slice(0, 3);
}
