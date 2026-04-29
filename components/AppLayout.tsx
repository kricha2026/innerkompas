import React, { useRef, useEffect } from 'react';
import { SessionProvider, useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTesterMode } from '@/hooks/useTesterMode';
import Header from './inner-kompas/Header';
import HomeScreen from './inner-kompas/HomeScreen';
import RegulationPhase from './inner-kompas/RegulationPhase';
import HoldingPhase from './inner-kompas/HoldingPhase';
import KernPhase from './inner-kompas/KernPhase';
import AlignmentPhase from './inner-kompas/AlignmentPhase';
import SessionEnd from './inner-kompas/SessionEnd';
import CoachDashboard from './inner-kompas/CoachDashboard';
import CrisisHandler from './inner-kompas/CrisisHandler';
import MijnSessies from './inner-kompas/MijnSessies';
import CoachAccessGuard from './inner-kompas/CoachAccessGuard';
import UserProfile from './inner-kompas/UserProfile';
import LiveCoachToggle from './inner-kompas/LiveCoachToggle';
import CoachSessionsWorkspace from './inner-kompas/CoachSessionsWorkspace';
import DiagnosticPanel from './inner-kompas/DiagnosticPanel';
import AddToHomeScreenBanner from './inner-kompas/AddToHomeScreenBanner';


const AppContent: React.FC = () => {
  const { currentView, setCurrentView, crisisDetected, resetCrisis, session, toggleCoachVisible } = useSession();
  const { isAuthenticated, isCoach, isTesterMode: contextTesterMode } = useAuth();

  
  // ─── TRIPLE-LAYER tester mode detection ───
  const hookTesterMode = useTesterMode();
  const globalTesterMode = !!(window as any).__IK_TESTER_MODE__;
  const isTesterMode = contextTesterMode || hookTesterMode || globalTesterMode;

  // Remember which conversation phase the user was in before crisis was detected
  const preCrisisViewRef = useRef(currentView);

  // Update the ref whenever we're in a non-crisis conversation phase
  if (!crisisDetected && (currentView === 'regulation' || currentView === 'holding' || currentView === 'kern' || currentView === 'alignment')) {
    preCrisisViewRef.current = currentView;
  }

  useEffect(() => {
    // Placeholder for future route-level redirects
  }, [currentView, isAuthenticated, isCoach]);

  const handleCrisisResolved = () => {
    resetCrisis();
  };

  if (crisisDetected && currentView !== 'home' && currentView !== 'ending' && currentView !== 'coach' && currentView !== 'mijn-sessies' && currentView !== 'profile' && currentView !== 'coach-sessies') {
    return (
      <div className="min-h-screen-mobile bg-sand">
        <Header />
        <CrisisHandler onResolved={handleCrisisResolved} />
      </div>
    );
  }

  // ─── Restricted views in tester mode ───
  const TESTER_RESTRICTED_VIEWS = ['coach', 'mijn-sessies', 'profile', 'coach-sessies'] as const;
  const isRestrictedInTesterMode = isTesterMode && (TESTER_RESTRICTED_VIEWS as readonly string[]).includes(currentView);

  // ─── Tester mode block screen ───
  const TesterModeBlocked = () => (
    <div className="min-h-content-mobile bg-sand flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-cream rounded-2xl border border-sand-dark/15 p-6 sm:p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-amber-50/80 flex items-center justify-center mx-auto mb-6 border border-amber-200/40">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl text-anthracite mb-3">Niet beschikbaar in preview</h2>
          <p className="text-sm text-anthracite-soft font-sans leading-relaxed mb-6">
            Dit scherm is niet beschikbaar in de preview-modus. 
            Je kunt wel een sessie starten en de gesprekservaring uitproberen.
          </p>
          <button
            onClick={() => setCurrentView('home')}
            className="w-full py-3 rounded-xl bg-anthracite text-sand-light text-sm font-sans hover:bg-anthracite-light transition-colors duration-200 touch-target"
          >
            Terug naar home
          </button>
        </div>
      </div>
    </div>
  );

  const renderView = () => {
    if (isRestrictedInTesterMode) {
      return <TesterModeBlocked />;
    }

    switch (currentView) {
      case 'home': return <HomeScreen />;
      case 'regulation': return <RegulationPhase />;
      case 'holding': return <HoldingPhase />;
      case 'kern': return <KernPhase />;
      case 'alignment': return <AlignmentPhase />;
      case 'ending': return <SessionEnd />;
      case 'coach':
        return (
          <CoachAccessGuard>
            <CoachDashboard />
          </CoachAccessGuard>
        );
      case 'coach-sessies':
        return (
          <CoachAccessGuard>
            <CoachSessionsWorkspace />
          </CoachAccessGuard>
        );
      case 'mijn-sessies': return <MijnSessies />;
      case 'profile': return <UserProfile />;
      default: return <HomeScreen />;
    }
  };

  const isConversation = currentView === 'regulation' || currentView === 'holding' || currentView === 'kern' || currentView === 'alignment';

  return (
    <div className={`${isConversation ? 'h-screen-mobile flex flex-col' : 'min-h-screen-mobile'} bg-sand`}>
      <Header />
      {isConversation ? (
        <div className="flex-1 overflow-hidden">
          {renderView()}
        </div>
      ) : (
        <main className="w-full">{renderView()}</main>
      )}
      {/* Live Coach Toggle - positioned top-right during conversation */}
      {isConversation && !isTesterMode && (
        <LiveCoachToggle
          isLive={session?.coachVisible ?? false}
          onToggle={toggleCoachVisible}
        />
      )}
      {/* Diagnostic Panel — hidden, toggle with Ctrl+Shift+D */}
      {!isTesterMode && <DiagnosticPanel />}

      {/* Add to Home Screen banner — only shows on mobile browsers (not PWA) */}
      {!isConversation && <AddToHomeScreenBanner />}
    </div>
  );
};


const AppLayout: React.FC = () => (
  <SessionProvider>
    <AppContent />
  </SessionProvider>
);

export default AppLayout;
