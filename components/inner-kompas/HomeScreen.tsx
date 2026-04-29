import React, { useState, useEffect } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/contexts/AuthContext';

const HomeScreen: React.FC = () => {
  const { startSession, sessionHistory, setCurrentView } = useSession();
  const { isAuthenticated, isCoach, profile, user } = useAuth();
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const displayName = profile?.display_name || user?.email?.split('@')[0] || '';

  // ─── Coach home: redirect to coach sessions workspace ───
  if (isCoach && isAuthenticated) {
    return (
      <div className="flex flex-col min-h-content-mobile bg-sand">
        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16 max-w-2xl mx-auto w-full">
          {/* Compass symbol */}
          <div className={`mb-8 sm:mb-10 transition-all duration-1000 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gold-light/20 animate-breathe" />
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-gold-muted sm:w-[40px] sm:h-[40px]">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" className="fill-gold/20" />
                <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" className="fill-gold/30" stroke="none" />
                <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" />
              </svg>
            </div>
          </div>

          <div className={`text-center space-y-4 sm:space-y-6 transition-all duration-1000 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-anthracite tracking-wide leading-tight">
              Inner Kompas
            </h1>
            <p className="font-serif text-base sm:text-lg md:text-xl text-anthracite-light leading-relaxed italic">
              Coach omgeving
            </p>
          </div>

          <div className={`w-12 h-px bg-gold/40 my-8 sm:my-10 transition-all duration-1000 delay-500 ${showContent ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'}`} />

          <div className={`flex flex-col gap-3 sm:gap-4 w-full max-w-xs transition-all duration-1000 delay-700 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <button
              onClick={() => setCurrentView('coach-sessies')}
              className="group relative px-8 sm:px-10 py-4 rounded-2xl bg-cream border-2 border-gold-light/40 hover:border-gold/40 active:bg-gold-light/15 transition-all duration-300 hover:shadow-lg hover:shadow-gold-light/10 touch-target"
            >
              <span className="font-sans text-base text-anthracite font-medium tracking-wide flex items-center justify-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Sessies bekijken
              </span>
              <div className="absolute inset-0 rounded-2xl bg-gold-light/0 group-hover:bg-gold-light/10 transition-colors duration-300" />
            </button>

            <button
              onClick={() => setCurrentView('coach')}
              className="group relative px-8 sm:px-10 py-4 rounded-2xl bg-cream/50 border border-sand-dark/20 hover:border-gold-light/40 active:bg-sand-dark/10 transition-all duration-300 touch-target"
            >
              <span className="font-sans text-sm text-anthracite-soft font-medium tracking-wide flex items-center justify-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                Coach Dashboard
              </span>
            </button>
          </div>
        </div>

        <footer className="px-4 sm:px-6 py-6 sm:py-8 text-center border-t border-sand-dark/15 pb-safe">
          <p className="text-xs text-anthracite-soft/30 font-sans">
            Inner Kompas — Coach omgeving
          </p>
        </footer>
      </div>
    );
  }

  // ─── User home ───
  return (
    <div className="flex flex-col min-h-content-mobile bg-sand">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16 max-w-2xl mx-auto w-full">
        {/* Compass symbol */}
        <div className={`mb-8 sm:mb-10 transition-all duration-1000 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gold-light/20 animate-breathe" />
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-gold-muted sm:w-[40px] sm:h-[40px]">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" className="fill-gold/20" />
              <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" className="fill-gold/30" stroke="none" />
              <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" />
              <line x1="12" y1="2" x2="12" y2="5" className="text-gold-muted/40" />
              <line x1="12" y1="19" x2="12" y2="22" className="text-gold-muted/40" />
              <line x1="2" y1="12" x2="5" y2="12" className="text-gold-muted/40" />
              <line x1="19" y1="12" x2="22" y2="12" className="text-gold-muted/40" />
            </svg>
          </div>
        </div>

        {/* Title + personalized greeting */}
        <div className={`text-center space-y-6 sm:space-y-8 transition-all duration-1000 delay-200 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {isAuthenticated && displayName ? (
            <>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-anthracite tracking-wide leading-tight">
                Hallo {displayName}
              </h1>
              <p className="font-serif text-base sm:text-lg md:text-xl text-anthracite-light leading-relaxed italic">
                Welkom terug bij Inner Kompas
              </p>
            </>
          ) : (
            <>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-anthracite tracking-wide leading-tight">
                Inner Kompas
              </h1>
              <div className="space-y-1 sm:space-y-1.5">
                <p className="font-serif text-base sm:text-lg md:text-xl text-anthracite-light leading-relaxed italic">
                  Erken wat je voelt. Daar ligt je kompas.
                </p>
                <p className="font-serif text-base sm:text-lg md:text-xl text-anthracite-light leading-relaxed italic">
                  Van daaruit navigeer je als vanzelf.
                </p>
                <p className="font-serif text-base sm:text-lg md:text-xl text-anthracite-light leading-relaxed italic">
                  En je leven beweegt mee.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className={`w-12 h-px bg-gold/40 my-8 sm:my-10 transition-all duration-1000 delay-500 ${showContent ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'}`} />

        {/* Start button */}
        <div className={`w-full max-w-xs transition-all duration-1000 delay-700 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <button
            onClick={startSession}
            className="group relative w-full sm:w-auto px-10 py-4 rounded-2xl bg-cream border-2 border-gold-light/40 hover:border-gold/40 active:bg-gold-light/15 transition-all duration-300 hover:shadow-lg hover:shadow-gold-light/10 touch-target"
          >
            <span className="font-sans text-base text-anthracite font-medium tracking-wide">
              Begin een sessie
            </span>
            <div className="absolute inset-0 rounded-2xl bg-gold-light/0 group-hover:bg-gold-light/10 transition-colors duration-300" />
          </button>
        </div>

        {/* Description */}
        <div className={`mt-8 sm:mt-12 max-w-sm text-center px-4 transition-all duration-1000 delay-1000 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-sm text-anthracite-soft/60 font-sans leading-relaxed">
            Een rustige ruimte om te vertragen, te voelen, en te ontdekken wat er leeft.
            Geen oordeel. Geen haast. Alleen jij en wat er is.
          </p>
        </div>
      </div>

      {/* Recent sessions (only for logged-in users) */}
      {isAuthenticated && sessionHistory.length > 0 && (
        <div className={`px-4 sm:px-6 pb-8 sm:pb-12 max-w-2xl mx-auto w-full transition-all duration-1000 delay-1200 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
          <div className="border-t border-sand-dark/30 pt-6 sm:pt-8">
            <h3 className="font-serif text-lg text-anthracite-light mb-3 sm:mb-4">Eerdere sessies</h3>
            <div className="space-y-2 sm:space-y-3">
              {sessionHistory.slice(-3).reverse().map((s, i) => (
                <div key={s.id} className="p-3 sm:p-4 rounded-xl bg-cream/50 border border-sand-dark/15">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-anthracite-soft font-sans">
                      {s.startedAt.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' })}
                    </span>
                    <span className="text-xs text-anthracite-soft/50 font-sans">
                      {s.steps.length} stappen
                    </span>
                  </div>
                  {s.userEmotionWords.length > 0 && (
                    <div className="flex gap-1.5 sm:gap-2 mt-2 flex-wrap">
                      {s.userEmotionWords.map((word, j) => (
                        <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-gold-light/20 text-anthracite-soft">
                          {word}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="px-4 sm:px-6 py-6 sm:py-8 text-center border-t border-sand-dark/15 pb-safe">
        <div className="max-w-2xl mx-auto space-y-2 sm:space-y-3">
          <p className="text-xs text-anthracite-soft/40 font-sans leading-relaxed">
            Inner Kompas is geen medisch hulpmiddel, geen vervanging voor therapie, 
            geen diagnostisch systeem en geen crisisdienst.
          </p>
          <p className="text-xs text-anthracite-soft/30 font-sans">
            Bij acute nood: neem contact op met je zorgverlener, coach, of bel 113 (0900-0113).
          </p>
        </div>
      </footer>
    </div>
  );
};

export default HomeScreen;
