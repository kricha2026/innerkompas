import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSession } from '@/contexts/SessionContext';

interface CoachAccessGuardProps {
  children: React.ReactNode;
}

const CoachAccessGuard: React.FC<CoachAccessGuardProps> = ({ children }) => {
  const { isAuthenticated, isCoach, isLoading, setShowAuthModal, profile } = useAuth();
  const { setCurrentView } = useSession();

  // While auth is loading, show a subtle loading state
  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-72px)] bg-sand flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gold-light/30 animate-breathe" />
          <p className="text-sm text-anthracite-soft/50 font-sans">Toegang controleren...</p>
        </div>
      </div>
    );
  }

  // Not authenticated → show login prompt
  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-72px)] bg-sand flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-cream rounded-2xl border border-sand-dark/15 p-8 text-center shadow-sm">
            {/* Lock icon */}
            <div className="w-16 h-16 rounded-full bg-gold-light/30 flex items-center justify-center mx-auto mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold-muted">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <h2 className="font-serif text-2xl text-anthracite mb-3">
              Inloggen vereist
            </h2>
            <p className="text-sm text-anthracite-soft font-sans leading-relaxed mb-6">
              Het Coach Dashboard is alleen toegankelijk voor ingelogde coaches. 
              Log in met je coach-account om sessies te bekijken en te begeleiden.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full py-3 rounded-xl bg-anthracite text-sand-light text-sm font-sans hover:bg-anthracite-light transition-colors duration-200"
              >
                Inloggen
              </button>
              <button
                onClick={() => setCurrentView('home')}
                className="w-full py-3 rounded-xl border border-sand-dark/20 text-anthracite-soft text-sm font-sans hover:bg-sand-dark/5 transition-colors duration-200"
              >
                Terug naar home
              </button>
            </div>

            <p className="text-xs text-anthracite-soft/40 font-sans mt-6">
              Nog geen account? Klik op "Inloggen" en kies "Registreer hier" om een coach-account aan te maken.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated but not a coach → show access denied
  if (!isCoach) {
    return (
      <div className="min-h-[calc(100vh-72px)] bg-sand flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-cream rounded-2xl border border-sand-dark/15 p-8 text-center shadow-sm">
            {/* Shield icon */}
            <div className="w-16 h-16 rounded-full bg-red-50/60 flex items-center justify-center mx-auto mb-6 border border-red-200/30">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>

            <h2 className="font-serif text-2xl text-anthracite mb-3">
              Toegang geweigerd
            </h2>
            <p className="text-sm text-anthracite-soft font-sans leading-relaxed mb-2">
              Het Coach Dashboard is alleen beschikbaar voor gebruikers met een coach-rol.
            </p>
            <p className="text-sm text-anthracite-soft/60 font-sans leading-relaxed mb-6">
              Je bent ingelogd als <span className="font-medium text-anthracite">{profile?.display_name || 'gebruiker'}</span> met 
              de rol <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sand-dark/10 text-xs font-medium text-anthracite-soft ml-1">{profile?.role === 'user' ? 'Gebruiker' : profile?.role || 'Onbekend'}</span>.
              Coach-rechten zijn nodig om sessies van anderen te bekijken en te begeleiden.
            </p>

            <div className="bg-sand-light/50 rounded-xl p-4 mb-6 border border-sand-dark/10">
              <div className="flex items-start gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/50 mt-0.5 flex-shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p className="text-xs text-anthracite-soft/60 font-sans text-left leading-relaxed">
                  Als je denkt dat je coach-rechten zou moeten hebben, neem dan contact op met de beheerder 
                  of registreer een nieuw account met de coach-rol.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => setCurrentView('home')}
                className="w-full py-3 rounded-xl bg-anthracite text-sand-light text-sm font-sans hover:bg-anthracite-light transition-colors duration-200"
              >
                Terug naar home
              </button>
              <button
                onClick={() => setCurrentView('mijn-sessies')}
                className="w-full py-3 rounded-xl border border-sand-dark/20 text-anthracite-soft text-sm font-sans hover:bg-sand-dark/5 transition-colors duration-200"
              >
                Mijn sessies bekijken
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated and is a coach → render the dashboard
  return <>{children}</>;
};

export default CoachAccessGuard;
