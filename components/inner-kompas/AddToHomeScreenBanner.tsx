import React, { useState, useEffect, useCallback } from 'react';

// ─── Platform detection ───
type Platform = 'ios' | 'android' | 'other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(ua)) {
    return 'android';
  }
  return 'other';
}

function isStandalone(): boolean {
  // Check display-mode media query (works on most browsers)
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari specific
  if ((navigator as any).standalone === true) return true;
  // Android TWA
  if (document.referrer.includes('android-app://')) return true;
  return false;
}

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (window.innerWidth <= 768 && 'ontouchstart' in window);
}

const DISMISS_KEY = 'ik_a2hs_dismissed';
const DISMISS_DAYS = 14; // Don't show again for 14 days after dismiss

function isDismissed(): boolean {
  try {
    const val = localStorage.getItem(DISMISS_KEY);
    if (!val) return false;
    const dismissedAt = parseInt(val, 10);
    const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    return daysSince < DISMISS_DAYS;
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  } catch {
    // localStorage not available
  }
}

// ─── Share icon for iOS ───
const ShareIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

// ─── Three dots icon for Android ───
const MoreVertIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="5" r="1.5" fill="currentColor" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12" cy="19" r="1.5" fill="currentColor" />
  </svg>
);

// ─── Compass icon ───
const CompassIcon: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold-muted">
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" opacity="0.3" />
    <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" />
  </svg>
);

// ─── Close icon ───
const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ─── Main Banner Component ───
const AddToHomeScreenBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>('other');
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);

  // Android "beforeinstallprompt" event
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Don't show if already running as PWA
    if (isStandalone()) return;
    // Don't show on desktop
    if (!isMobileDevice()) return;
    // Don't show if dismissed recently
    if (isDismissed()) return;

    const detectedPlatform = detectPlatform();
    // Don't show on unsupported platforms
    if (detectedPlatform === 'other') return;

    setPlatform(detectedPlatform);

    // Small delay so it doesn't flash on page load
    const timer = setTimeout(() => {
      setVisible(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // Listen for Android's beforeinstallprompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleDismiss = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setDismissed();
      setVisible(false);
    }, 300);
  }, []);

  const handleInstallAndroid = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setVisible(false);
      }
      setDeferredPrompt(null);
    } catch {
      // Prompt failed, fall through to manual instructions
    }
  }, [deferredPrompt]);

  if (!visible) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ease-out ${
        closing ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'
      }`}
      style={{ paddingBottom: 'var(--sab, 0px)' }}
    >
      <div className="mx-3 mb-3">
        <div className="bg-cream/95 backdrop-blur-md rounded-2xl border border-gold-light/30 shadow-lg shadow-anthracite/8 overflow-hidden">
          {/* ─── Collapsed state: compact banner ─── */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            {/* App icon */}
            <div className="w-10 h-10 rounded-xl bg-sand flex items-center justify-center border border-gold-light/30 flex-shrink-0">
              <CompassIcon />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-sans font-medium text-anthracite leading-tight">
                Voeg toe aan je beginscherm
              </p>
              <p className="text-xs font-sans text-anthracite-soft/60 leading-tight mt-0.5">
                {platform === 'ios'
                  ? 'Open Inner Kompas als app op je iPhone'
                  : 'Open Inner Kompas als app op je telefoon'}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Show native install prompt on Android if available */}
              {platform === 'android' && deferredPrompt ? (
                <button
                  onClick={handleInstallAndroid}
                  className="px-3.5 py-2 rounded-xl bg-anthracite text-sand-light text-xs font-sans font-medium hover:bg-anthracite-light active:bg-anthracite transition-colors touch-target"
                >
                  Installeer
                </button>
              ) : (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="px-3.5 py-2 rounded-xl bg-gold-light/40 text-anthracite text-xs font-sans font-medium hover:bg-gold-light/60 active:bg-gold-light/50 transition-colors touch-target"
                >
                  {expanded ? 'Verberg' : 'Hoe?'}
                </button>
              )}

              {/* Dismiss */}
              <button
                onClick={handleDismiss}
                className="p-2 rounded-full hover:bg-sand-dark/15 transition-colors touch-target flex items-center justify-center text-anthracite-soft/50"
                aria-label="Sluiten"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* ─── Expanded state: step-by-step instructions ─── */}
          {expanded && (
            <div className="px-4 pb-4 pt-0.5 animate-gentle-fade">
              <div className="border-t border-sand-dark/15 pt-3.5">
                {platform === 'ios' ? (
                  <IOSInstructions />
                ) : (
                  <AndroidInstructions />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── iOS Instructions ───
const IOSInstructions: React.FC = () => (
  <div className="space-y-3">
    <p className="text-xs font-sans text-anthracite-soft/70 leading-relaxed">
      Voeg Inner Kompas toe aan je beginscherm voor snelle toegang:
    </p>
    <ol className="space-y-2.5">
      <li className="flex items-start gap-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-light/40 flex items-center justify-center text-xs font-sans font-semibold text-anthracite">
          1
        </span>
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-sm font-sans text-anthracite leading-snug">
            Tik op het
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sand border border-sand-dark/20">
            <ShareIcon className="text-blue-500" />
          </span>
          <span className="text-sm font-sans text-anthracite leading-snug">
            deel-icoon
          </span>
        </div>
      </li>
      <li className="flex items-start gap-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-light/40 flex items-center justify-center text-xs font-sans font-semibold text-anthracite">
          2
        </span>
        <div className="pt-0.5">
          <span className="text-sm font-sans text-anthracite leading-snug">
            Scroll naar beneden en tik op{' '}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sand border border-sand-dark/20 text-sm font-sans font-medium text-anthracite">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Zet op beginscherm
          </span>
        </div>
      </li>
      <li className="flex items-start gap-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-light/40 flex items-center justify-center text-xs font-sans font-semibold text-anthracite">
          3
        </span>
        <span className="text-sm font-sans text-anthracite leading-snug pt-0.5">
          Tik op <span className="font-medium">Voeg toe</span> rechtsboven
        </span>
      </li>
    </ol>
    <div className="flex items-center gap-2 pt-1">
      <div className="w-1 h-1 rounded-full bg-gold/40" />
      <p className="text-[11px] font-sans text-anthracite-soft/50 leading-relaxed italic">
        Inner Kompas opent dan als volledige app, zonder Safari-balk
      </p>
    </div>
  </div>
);

// ─── Android Instructions ───
const AndroidInstructions: React.FC = () => (
  <div className="space-y-3">
    <p className="text-xs font-sans text-anthracite-soft/70 leading-relaxed">
      Voeg Inner Kompas toe aan je beginscherm voor snelle toegang:
    </p>
    <ol className="space-y-2.5">
      <li className="flex items-start gap-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-light/40 flex items-center justify-center text-xs font-sans font-semibold text-anthracite">
          1
        </span>
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-sm font-sans text-anthracite leading-snug">
            Tik op het
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sand border border-sand-dark/20">
            <MoreVertIcon className="text-anthracite-soft" />
          </span>
          <span className="text-sm font-sans text-anthracite leading-snug">
            menu
          </span>
        </div>
      </li>
      <li className="flex items-start gap-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-light/40 flex items-center justify-center text-xs font-sans font-semibold text-anthracite">
          2
        </span>
        <div className="pt-0.5">
          <span className="text-sm font-sans text-anthracite leading-snug">
            Tik op{' '}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sand border border-sand-dark/20 text-sm font-sans font-medium text-anthracite">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Toevoegen aan startscherm
          </span>
        </div>
      </li>
      <li className="flex items-start gap-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-light/40 flex items-center justify-center text-xs font-sans font-semibold text-anthracite">
          3
        </span>
        <span className="text-sm font-sans text-anthracite leading-snug pt-0.5">
          Bevestig door op <span className="font-medium">Toevoegen</span> te tikken
        </span>
      </li>
    </ol>
    <div className="flex items-center gap-2 pt-1">
      <div className="w-1 h-1 rounded-full bg-gold/40" />
      <p className="text-[11px] font-sans text-anthracite-soft/50 leading-relaxed italic">
        Inner Kompas opent dan als volledige app, zonder adresbalk
      </p>
    </div>
  </div>
);

export default AddToHomeScreenBanner;
