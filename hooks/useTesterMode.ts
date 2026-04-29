import { useState, useEffect } from 'react';

const TESTER_STORAGE_KEY = 'ik_tester_mode';

/**
 * Check tester mode from all available sources.
 * This is a plain function — safe to call anywhere, anytime.
 */
function checkTesterMode(): boolean {
  // 1. Global flag (set in main.tsx BEFORE React renders)
  try {
    if ((window as any).__IK_TESTER_MODE__ === true) return true;
  } catch (e) { /* ignore */ }

  // 2. CSS class on <html> (also set in main.tsx)
  try {
    if (document.documentElement.classList.contains('tester-mode')) return true;
  } catch (e) { /* ignore */ }

  // 3. sessionStorage
  try {
    if (sessionStorage.getItem(TESTER_STORAGE_KEY) === 'true') return true;
  } catch (e) { /* ignore */ }

  // 4. URLSearchParams
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'tester') return true;
  } catch (e) { /* ignore */ }

  // 5. Raw href
  try {
    if (window.location.href.includes('mode=tester')) return true;
  } catch (e) { /* ignore */ }

  // 6. Hash
  try {
    if (window.location.hash.includes('mode=tester')) return true;
  } catch (e) { /* ignore */ }

  return false;
}

/**
 * Standalone tester mode detection hook.
 * Reads from global flag (set pre-React in main.tsx) + window.location + sessionStorage.
 * Does NOT depend on React Router or any context.
 */
export function useTesterMode(): boolean {
  const [isTester, setIsTester] = useState<boolean>(checkTesterMode);

  // Re-check after mount (catches any late URL availability)
  useEffect(() => {
    const detected = checkTesterMode();
    if (detected && !isTester) {
      setIsTester(true);
    }

    // Also set up a small delay re-check for platforms with async URL handling
    const timer = setTimeout(() => {
      const delayDetected = checkTesterMode();
      if (delayDetected) {
        setIsTester(true);
        // Ensure CSS class and global flag are set
        try { document.documentElement.classList.add('tester-mode'); } catch (e) {}
        try { (window as any).__IK_TESTER_MODE__ = true; } catch (e) {}
        try { sessionStorage.setItem(TESTER_STORAGE_KEY, 'true'); } catch (e) {}
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return isTester;
}
