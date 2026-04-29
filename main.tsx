
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// ─── Expose crisis detection test utilities on window for browser console ───
import { detectCrisis, testCrisisDetection } from './lib/types';

// Make available in browser console:
//   window.testCrisisDetection()  — runs full test suite
//   window.detectCrisis("tekst")  — tests a single phrase
(window as any).testCrisisDetection = testCrisisDetection;
(window as any).detectCrisis = detectCrisis;

// ═══════════════════════════════════════════════════════════════════
// PRE-REACT TESTER MODE DETECTION
// This runs BEFORE React renders — sets CSS class + global flag
// so tester-mode elements are hidden immediately via CSS,
// completely independent of React state/hooks/context.
// ═══════════════════════════════════════════════════════════════════
(function detectTesterModePreReact() {
  let detected = false;

  // Method 1: URLSearchParams
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'tester') detected = true;
  } catch (e) { /* ignore */ }

  // Method 2: Raw href string match
  if (!detected) {
    try {
      if (window.location.href.includes('mode=tester')) detected = true;
    } catch (e) { /* ignore */ }
  }

  // Method 3: document.URL
  if (!detected) {
    try {
      if (document.URL.includes('mode=tester')) detected = true;
    } catch (e) { /* ignore */ }
  }

  // Method 4: Hash-based (in case platform moves params to hash)
  if (!detected) {
    try {
      if (window.location.hash.includes('mode=tester')) detected = true;
    } catch (e) { /* ignore */ }
  }

  // Method 5: sessionStorage (persists from a previous detection)
  if (!detected) {
    try {
      if (sessionStorage.getItem('ik_tester_mode') === 'true') detected = true;
    } catch (e) { /* ignore */ }
  }

  // If detected, set everything
  if (detected) {
    // Global flag — readable by any JS code
    (window as any).__IK_TESTER_MODE__ = true;

    // CSS class on <html> — enables pure-CSS hiding
    document.documentElement.classList.add('tester-mode');

    // Persist to sessionStorage for same-tab navigations
    try { sessionStorage.setItem('ik_tester_mode', 'true'); } catch (e) { /* ignore */ }

    console.log('%c[TESTER] Pre-React: tester mode ACTIVATED', 'color: #d97706; font-weight: bold;');
  } else {
    (window as any).__IK_TESTER_MODE__ = false;

    // Clean up stale sessionStorage
    try { sessionStorage.removeItem('ik_tester_mode'); } catch (e) { /* ignore */ }
  }
})();

// ═══════════════════════════════════════════════════════════════════
// SERVICE WORKER REGISTRATION
// Register the service worker for PWA support (offline caching, 
// installability, and Add to Home Screen prompt on Android).
// ═══════════════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registered:', reg.scope);
        // Check for updates periodically (every 60 min)
        setInterval(() => {
          reg.update();
        }, 60 * 60 * 1000);
      })
      .catch((err) => {
        console.log('[SW] Registration failed:', err);
      });
  });
}

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);
