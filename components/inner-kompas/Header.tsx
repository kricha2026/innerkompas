import React, { useState, useRef, useEffect } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTesterMode } from '@/hooks/useTesterMode';
import { Phase } from '@/lib/types';

// ─── Inline Auth Modal ───
const AuthModal: React.FC<{
  onClose: () => void;
}> = ({
  onClose
}) => {
  const {
    signIn,
    signUp
  } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        const result = await signIn(email, password);
        if (result.error) setError(result.error);
      } else {
        const result = await signUp(email, password, displayName, role);
        if (result.error) setError(result.error);
      }
    } catch {
      setError('Er is een fout opgetreden.');
    }
    setLoading(false);
  };
  return <div className="fixed inset-0 bg-anthracite/25 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-cream rounded-2xl p-6 max-w-sm w-full shadow-xl animate-gentle-fade" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-xl text-anthracite">
            {mode === 'signin' ? 'Inloggen' : 'Account aanmaken'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-sand-dark/15 transition-colors touch-target flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && <div>
              <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1">Naam</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Je naam" className="w-full px-3 py-3 rounded-xl bg-warm-white border border-sand-dark/20 text-base text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/50 transition-colors" />
            </div>}

          <div>
            <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1">E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="naam@voorbeeld.nl" required className="w-full px-3 py-3 rounded-xl bg-warm-white border border-sand-dark/20 text-base text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/50 transition-colors" />
          </div>

          <div>
            <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1">Wachtwoord</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Minimaal 6 tekens' : 'Je wachtwoord'} required minLength={mode === 'signup' ? 6 : undefined} className="w-full px-3 py-3 rounded-xl bg-warm-white border border-sand-dark/20 text-base text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/50 transition-colors" />
          </div>

          {error && <div className="px-3 py-2 rounded-xl bg-red-50/60 border border-red-200/40">
              <p className="text-xs text-red-600 font-sans">{error}</p>
            </div>}

          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-anthracite text-sand-light text-sm font-sans hover:bg-anthracite-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target">
            {loading ? <span className="flex items-center justify-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-sand-light/30 border-t-sand-light animate-spin" />
                Even geduld...
              </span> : mode === 'signin' ? 'Inloggen' : 'Registreren'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError('');
        }} className="text-xs text-anthracite-soft/60 hover:text-anthracite-soft font-sans underline underline-offset-2 py-2 touch-target">
            {mode === 'signin' ? 'Nog geen account? Registreer hier' : 'Al een account? Log hier in'}
          </button>
        </div>
      </div>
    </div>;
};

// ─── Mobile Menu Overlay ───
const MobileMenu: React.FC<{
  onClose: () => void;
  onNav: (view: Phase) => void;
  currentView: string;
  isCoach: boolean;
  isAuthenticated: boolean;
  isTesterMode: boolean;
  onSignOut: () => void;
  onShowAuth: () => void;
  profile: any;
  user: any;
}> = ({ onClose, onNav, currentView, isCoach, isAuthenticated, isTesterMode, onSignOut, onShowAuth, profile, user }) => {
  const handleNavClick = (view: Phase) => {
    onNav(view);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 sm:hidden" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-anthracite/20 backdrop-blur-sm" />
      
      {/* Menu panel - slides in from right */}
      <div 
        className="absolute right-0 top-0 bottom-0 w-72 bg-cream shadow-2xl animate-gentle-fade"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sand-dark/15">
          <span className="font-serif text-lg text-anthracite">Menu</span>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-sand-dark/15 transition-colors touch-target flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* User info */}
        {isAuthenticated && (
          <div className="px-5 py-4 border-b border-sand-dark/10">
            <p className="text-sm font-sans font-medium text-anthracite truncate">
              {profile?.display_name || user?.email?.split('@')[0]}
            </p>
            <p className="text-xs font-sans text-anthracite-soft/50 truncate">{user?.email}</p>
            <p className="text-[10px] font-sans text-anthracite-soft/40 mt-0.5">
              {profile?.role === 'coach' ? 'Coach' : profile?.role === 'admin' ? 'Beheerder' : 'Gebruiker'}
            </p>
          </div>
        )}

        {/* Nav items */}
        <div className="py-2">
          <button
            onClick={() => handleNavClick('home')}
            className={`w-full text-left px-5 py-3.5 text-sm font-sans flex items-center gap-3 transition-colors touch-target ${
              currentView === 'home' ? 'text-anthracite bg-gold-light/20' : 'text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/8'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Home
          </button>

          {!isTesterMode && (
            <>
              {/* User nav */}
              {(!isAuthenticated || !isCoach) && (
                <button
                  onClick={() => handleNavClick('mijn-sessies')}
                  className={`tester-hide w-full text-left px-5 py-3.5 text-sm font-sans flex items-center gap-3 transition-colors touch-target ${
                    currentView === 'mijn-sessies' ? 'text-anthracite bg-gold-light/20' : 'text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/8'
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  Mijn sessies
                </button>
              )}

              {/* Coach nav */}
              {isAuthenticated && isCoach && (
                <>
                  <button
                    onClick={() => handleNavClick('coach-sessies')}
                    className={`tester-hide w-full text-left px-5 py-3.5 text-sm font-sans flex items-center gap-3 transition-colors touch-target ${
                      currentView === 'coach-sessies' ? 'text-anthracite bg-gold-light/20' : 'text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/8'
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Sessies
                  </button>
                  <button
                    onClick={() => handleNavClick('coach')}
                    className={`tester-hide w-full text-left px-5 py-3.5 text-sm font-sans flex items-center gap-3 transition-colors touch-target ${
                      currentView === 'coach' ? 'text-anthracite bg-gold-light/20' : 'text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/8'
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    Coach Dashboard
                  </button>
                </>
              )}

              {/* Profile */}
              {isAuthenticated && (
                <button
                  onClick={() => handleNavClick('profile')}
                  className={`tester-hide w-full text-left px-5 py-3.5 text-sm font-sans flex items-center gap-3 transition-colors touch-target ${
                    currentView === 'profile' ? 'text-anthracite bg-gold-light/20' : 'text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/8'
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Mijn profiel
                </button>
              )}
            </>
          )}
        </div>

        {/* Auth section */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-sand-dark/15 p-5 pb-safe-extra bg-cream">
          {isAuthenticated ? (
            <button
              onClick={() => {
                onSignOut();
                onClose();
              }}
              className="w-full text-left px-4 py-3 rounded-xl text-sm font-sans text-red-600/70 hover:text-red-600 hover:bg-red-50/30 flex items-center gap-3 transition-colors touch-target"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Uitloggen
            </button>
          ) : (
            <button
              onClick={() => {
                onShowAuth();
                onClose();
              }}
              className="w-full py-3 rounded-xl bg-anthracite text-sand-light text-sm font-sans font-medium hover:bg-anthracite-light transition-colors touch-target"
            >
              Inloggen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Header Component ───
const Header: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    session
  } = useSession();
  const {
    user,
    profile,
    isAuthenticated,
    isCoach,
    isTesterMode: contextTesterMode,
    signOut,
    showAuthModal,
    setShowAuthModal
  } = useAuth();

  // ─── TRIPLE-LAYER tester mode detection ───
  const hookTesterMode = useTesterMode();
  const globalTesterMode = !!(window as any).__IK_TESTER_MODE__;
  const isTesterMode = contextTesterMode || hookTesterMode || globalTesterMode;
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  // Ensure CSS class stays in sync with React detection
  useEffect(() => {
    if (isTesterMode) {
      document.documentElement.classList.add('tester-mode');
    }
  }, [isTesterMode]);

  // Close avatar dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setShowAvatarMenu(false);
      }
    };
    if (showAvatarMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAvatarMenu]);

  // Close mobile menu on view change
  useEffect(() => {
    setShowMobileMenu(false);
  }, [currentView]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (showMobileMenu) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showMobileMenu]);

  const handleNav = (view: Phase) => {
    setCurrentView(view);
    setShowAvatarMenu(false);
    setShowMobileMenu(false);
  };

  // Get initials for avatar
  const getInitials = () => {
    if (profile?.display_name) {
      const parts = profile.display_name.split(' ');
      return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.email) return user.email[0].toUpperCase();
    return '?';
  };

  // ─── Role-based navigation items ───
  const isInConversation = currentView === 'regulation' || currentView === 'holding' || currentView === 'kern' || currentView === 'alignment';
  const showBackButton = isInConversation || currentView === 'ending' || currentView === 'profile';

  return <>
      {/* ─── HEADER ─── */}
      <header className="w-full px-4 sm:px-6 py-3 sm:py-5 flex items-center justify-between bg-warm-white/60 backdrop-blur-sm border-b border-sand-dark/30" style={{ paddingTop: `max(${isInConversation ? '0.75rem' : '0.75rem'}, var(--sat))` }}>
        {/* Logo */}
        <button onClick={() => handleNav('home')} className="flex items-center gap-2 sm:gap-3 group touch-target">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gold-light/50 flex items-center justify-center group-hover:bg-gold-light transition-colors duration-300 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold-muted sm:w-[18px] sm:h-[18px]">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" opacity="0.3" />
              <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" />
            </svg>
          </div>
          <span className="font-serif text-lg sm:text-xl text-anthracite tracking-wide">
            Inner Kompas
          </span>
          {isTesterMode && <span className="px-2 py-0.5 rounded-full bg-amber-100/80 border border-amber-300/40 text-[10px] font-sans font-medium text-amber-700 uppercase tracking-wider hidden sm:inline">
              Preview
            </span>}
        </button>

        {/* ─── Desktop Navigation (hidden on mobile) ─── */}
        <nav className="hidden sm:flex items-center gap-1.5">
          {/* Back button during conversation */}
          {showBackButton && <button onClick={() => handleNav('home')} className="px-3 py-2 text-sm text-anthracite-soft hover:text-anthracite transition-colors duration-200">
              Terug
            </button>}

          {/* ─── Role-based navigation ─── */}
          {!isTesterMode && <>
              {/* For USER role: Home + Sessies */}
              {(!isAuthenticated || !isCoach) && <>
                  {currentView !== 'home' && !isInConversation && <button onClick={() => handleNav('home')} className={`px-3 py-2 text-sm rounded-full transition-all duration-200 ${currentView === 'home' ? 'bg-gold-light/60 text-anthracite' : 'text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/30'}`}>
                      Home
                    </button>}
                  <button onClick={() => handleNav('mijn-sessies')} className={`tester-hide px-3 py-2 text-sm rounded-full transition-all duration-200 ${currentView === 'mijn-sessies' ? 'bg-gold-light/60 text-anthracite' : 'text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/30'}`}>
                    <span className="flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      Sessies
                    </span>
                  </button>
                </>}

              {/* For COACH role: Sessies + Coach */}
              {isAuthenticated && isCoach && <>
                  <button onClick={() => handleNav('coach-sessies')} className={`tester-hide px-3 py-2 text-sm rounded-full transition-all duration-200 ${currentView === 'coach-sessies' ? 'bg-gold-light/60 text-anthracite' : 'text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/30'}`}>
                    <span className="flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Sessies
                    </span>
                  </button>
                  <button onClick={() => handleNav('coach')} className={`tester-hide px-3 py-2 text-sm rounded-full transition-all duration-200 ${currentView === 'coach' ? 'bg-gold-light/60 text-anthracite' : 'text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/30'}`}>
                    <span className="flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                      Coach
                    </span>
                  </button>
                </>}
            </>}

          {/* Session progress dots */}
          {session && isInConversation && <div className="flex items-center gap-1 ml-2 px-3 py-1.5 rounded-full bg-sand-dark/20">
              <div className={`w-2 h-2 rounded-full ${currentView === 'regulation' ? 'bg-gold' : 'bg-sand-dark/40'}`} />
              <div className={`w-2 h-2 rounded-full ${currentView === 'holding' ? 'bg-gold' : 'bg-sand-dark/40'}`} />
              <div className={`w-2 h-2 rounded-full ${currentView === 'kern' ? 'bg-gold' : 'bg-sand-dark/40'}`} />
            </div>}

          {/* ─── Auth section (desktop) ─── */}
          <div className="ml-2 pl-2 border-l border-sand-dark/20 flex items-center gap-2 text-black bg-white">
            {isAuthenticated ? <div className="relative" ref={avatarMenuRef}>
                <button onClick={() => setShowAvatarMenu(!showAvatarMenu)} className="flex items-center gap-2 px-1.5 py-1 rounded-xl hover:bg-sand-dark/10 transition-colors">
                  <div className={`w-8 h-8 rounded-full bg-gold-light/50 flex items-center justify-center border ${currentView === 'profile' ? 'border-gold' : 'border-gold/20'}`}>
                    <span className="text-xs font-sans font-medium text-anthracite">{getInitials()}</span>
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-sans font-medium text-anthracite leading-tight">{profile?.display_name || user?.email?.split('@')[0]}</p>
                    <p className="text-[10px] font-sans text-anthracite-soft/50 leading-tight">
                      {profile?.role === 'coach' ? 'Coach' : profile?.role === 'admin' ? 'Beheerder' : 'Gebruiker'}
                    </p>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-anthracite-soft/40 transition-transform duration-200 ${showAvatarMenu ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* ─── Avatar dropdown menu (desktop) ─── */}
                {showAvatarMenu && <div className="absolute right-0 top-full mt-2 w-56 bg-cream rounded-2xl shadow-xl border border-sand-dark/15 overflow-hidden z-50 animate-gentle-fade">
                    <div className="px-4 py-3 border-b border-sand-dark/10">
                      <p className="text-sm font-sans font-medium text-anthracite truncate">{profile?.display_name || user?.email?.split('@')[0]}</p>
                      <p className="text-xs font-sans text-anthracite-soft/50 truncate">{user?.email}</p>
                    </div>

                    <div className="py-1.5">
                      {!isTesterMode && <button onClick={() => handleNav('profile')} className={`tester-hide w-full text-left px-4 py-2.5 text-sm font-sans flex items-center gap-3 transition-colors ${currentView === 'profile' ? 'text-anthracite bg-gold-light/20' : 'text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/8'}`}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          Mijn profiel
                        </button>}

                      {/* Role-appropriate session link in dropdown */}
                      {!isTesterMode && !isCoach && <button onClick={() => handleNav('mijn-sessies')} className="tester-hide w-full text-left px-4 py-2.5 text-sm font-sans text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/8 flex items-center gap-3 transition-colors">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                          Mijn sessies
                        </button>}

                      <button onClick={() => handleNav('home')} className="w-full text-left px-4 py-2.5 text-sm font-sans text-anthracite-soft hover:text-anthracite hover:bg-sand-dark/8 flex items-center gap-3 transition-colors">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                        Home
                      </button>
                    </div>

                    <div className="border-t border-sand-dark/10 py-1.5">
                      <button onClick={() => {
                  signOut();
                  setShowAvatarMenu(false);
                }} className="w-full text-left px-4 py-2.5 text-sm font-sans text-red-600/70 hover:text-red-600 hover:bg-red-50/30 flex items-center gap-3 transition-colors">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Uitloggen
                      </button>
                    </div>
                  </div>}
              </div> : <button onClick={() => setShowAuthModal(true)} className="px-4 py-2 text-sm rounded-full bg-anthracite text-sand-light hover:bg-anthracite-light transition-colors font-sans font-medium">
                Inloggen
              </button>}
          </div>
        </nav>

        {/* ─── Mobile right side ─── */}
        <div className="flex sm:hidden items-center gap-2">
          {/* Session progress dots (mobile) */}
          {session && isInConversation && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-sand-dark/20">
              <div className={`w-1.5 h-1.5 rounded-full ${currentView === 'regulation' ? 'bg-gold' : 'bg-sand-dark/40'}`} />
              <div className={`w-1.5 h-1.5 rounded-full ${currentView === 'holding' ? 'bg-gold' : 'bg-sand-dark/40'}`} />
              <div className={`w-1.5 h-1.5 rounded-full ${currentView === 'kern' ? 'bg-gold' : 'bg-sand-dark/40'}`} />
            </div>
          )}

          {/* Back button (mobile, during conversation) */}
          {showBackButton && (
            <button 
              onClick={() => handleNav('home')} 
              className="p-2 rounded-full hover:bg-sand-dark/15 transition-colors touch-target flex items-center justify-center"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          {/* Hamburger menu button */}
          {!isInConversation && (
            <button
              onClick={() => setShowMobileMenu(true)}
              className="p-2 rounded-full hover:bg-sand-dark/15 transition-colors touch-target flex items-center justify-center"
              aria-label="Menu openen"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* ─── Mobile Menu Overlay ─── */}
      {showMobileMenu && (
        <MobileMenu
          onClose={() => setShowMobileMenu(false)}
          onNav={handleNav}
          currentView={currentView}
          isCoach={isCoach}
          isAuthenticated={isAuthenticated}
          isTesterMode={isTesterMode}
          onSignOut={signOut}
          onShowAuth={() => setShowAuthModal(true)}
          profile={profile}
          user={user}
        />
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>;
};
export default Header;
