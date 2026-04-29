import React, { useState, useEffect } from 'react';
import { GROUNDING_PROMPTS, RegulationDomain, getRegulationPrompts, REGULATION_DOMAIN_LABELS, REGULATION_DOMAIN_DESCRIPTIONS } from '@/lib/types';
import { useSession } from '@/contexts/SessionContext';

interface CrisisHandlerProps {
  onResolved: () => void;
}

type Step =
  | 'ack1'
  | 'story'
  | 'ack2'
  | 'emotionCheck'
  | 'ackEmotion'
  | 'bodyIntro'
  | 'bodyCheck'
  | 'regulationChoice'
  | 'regulation';

const CrisisHandler: React.FC<CrisisHandlerProps> = ({ onResolved }) => {
  const [step, setStep] = useState<Step>('ack1');
  const [storyText, setStoryText] = useState('');
  const [emotionText, setEmotionText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [breathCount, setBreathCount] = useState(0);
  const [showContact, setShowContact] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<RegulationDomain | null>(null);

  const { setCurrentView, session, crisisDetected } = useSession();

  useEffect(() => {
  if (crisisDetected === true) {
    setShowContact(true);
  }
}, [crisisDetected]);


  const bodyKeywords = [
    'misselijk', 'buik', 'borst', 'hart', 'trillen', 'druk', 'knoop',
    'benauwd', 'hoofdpijn', 'spanning', 'pijn', 'adem'
  ];

  const storyAlreadyBodyLed = bodyKeywords.some(k =>
    storyText.toLowerCase().includes(k)
  );

  const goNextFlowStep = () => {
    setStep(prev => {
      switch (prev) {
        case 'ack1':
          return 'story';
        case 'story':
          return 'ack2';
        case 'ack2':
          return storyAlreadyBodyLed ? 'bodyIntro' : 'emotionCheck';
        case 'emotionCheck':
          return 'ackEmotion';
        case 'ackEmotion':
          return 'bodyIntro';
        case 'bodyIntro':
          return 'bodyCheck';
        case 'bodyCheck':
          return 'regulationChoice';
        default:
          return prev;
      }
    });
  };

  const handleDomainChoice = (domain: RegulationDomain) => {
    setSelectedDomain(domain);
    setCurrentPromptIndex(0);
    setBreathCount(0);
    setStep('regulation');
  };

  const regulationPrompts = selectedDomain
    ? getRegulationPrompts(selectedDomain)
    : GROUNDING_PROMPTS;

  const nextRegulationPrompt = () => {
    if (currentPromptIndex < regulationPrompts.length - 1) {
      setCurrentPromptIndex(prev => prev + 1);
      setBreathCount(prev => prev + 1);
      return;
    }
    onResolved?.();
  };

  const handleNext = () => {
    if (step === 'regulation') {
      nextRegulationPrompt();
      return;
    }
    goNextFlowStep();
  };

  const primaryButtonLabel =
    step === 'regulation'
      ? (currentPromptIndex < regulationPrompts.length - 1 ? 'Verder' : 'Klaar voor nu')
      : 'Verder';

  // Domain icon components
  const DomainIcon: React.FC<{ domain: RegulationDomain; className?: string }> = ({ domain, className = '' }) => {
    if (domain === 'cognitive') {
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 2a8 8 0 0 0-8 8c0 3.5 2.1 6.4 5 7.7V20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.3c2.9-1.3 5-4.2 5-7.7a8 8 0 0 0-8-8z" />
          <line x1="9" y1="22" x2="15" y2="22" />
          <line x1="10" y1="2" x2="10" y2="5" />
          <line x1="14" y1="2" x2="14" y2="5" />
        </svg>
      );
    }
    if (domain === 'emotional') {
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    }
    // somatic
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M6 8H5a4 4 0 0 0 0 8h1" />
        <path d="M8 6v12" />
        <path d="M16 6v12" />
        <path d="M12 2v4" />
        <path d="M12 18v4" />
        <path d="M8 12h8" />
      </svg>
    );
  };

  // Breathe animation for regulation
  const BreathAnimation: React.FC<{ domain: RegulationDomain | null }> = ({ domain }) => {
    const colorClass = domain === 'cognitive'
      ? 'bg-blue-300/30'
      : domain === 'emotional'
        ? 'bg-rose-300/30'
        : 'bg-gold-light/30';
    const innerColorClass = domain === 'cognitive'
      ? 'bg-blue-300/20'
      : domain === 'emotional'
        ? 'bg-rose-300/20'
        : 'bg-gold-light/20';
    const dotColorClass = domain === 'cognitive'
      ? 'bg-blue-400/50'
      : domain === 'emotional'
        ? 'bg-rose-400/50'
        : 'bg-gold/50';

    return (
      <div className="relative w-24 h-24 flex items-center justify-center">
        <div className={`absolute inset-0 rounded-full ${colorClass} animate-breathe`} />
        <div
          className={`absolute inset-3 rounded-full ${innerColorClass} animate-breathe`}
          style={{ animationDelay: '0.5s' }}
        />
        <div className={`w-4 h-4 rounded-full ${dotColorClass}`} />
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-12 animate-gentle-fade">
      <div className="max-w-md w-full flex flex-col items-center gap-8" data-mixed-content="true">

        {step === 'ack1' && (
          <div className="text-center space-y-4">
            <p className="font-serif text-xl text-anthracite leading-relaxed animate-gentle-fade">
              Ik ben bij je. Wat je nu voelt is begrijpelijk.
            </p>
            <p className="text-sm text-anthracite-soft font-sans leading-relaxed">
              We nemen dit stap voor stap. Je hoeft niets te forceren.
            </p>
          </div>
        )}

        {step === 'story' && (
          <div className="w-full space-y-4">
            <p className="font-serif text-xl text-anthracite leading-relaxed text-center animate-gentle-fade">
              Wat wil je erover kwijt?
            </p>
            <textarea
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              placeholder="Schrijf hier wat er speelt…"
              rows={6}
              className="w-full rounded-2xl bg-cream border-2 border-sand-dark/20 focus:border-gold-light/60 outline-none px-4 py-3 text-anthracite font-sans text-sm transition-colors"
            />
          </div>
        )}

        {step === 'ack2' && (
          <div className="text-center space-y-4">
            <p className="font-serif text-xl text-anthracite leading-relaxed animate-gentle-fade">
              Dankjewel. Ik hoor je.
            </p>
            <p className="text-sm text-anthracite-soft font-sans leading-relaxed">
              Het feit dat je dit onder woorden brengt, is al co-regulatie in actie.
            </p>
          </div>
        )}

        {step === 'emotionCheck' && (
          <div className="w-full space-y-4">
            <p className="font-serif text-xl text-anthracite leading-relaxed text-center animate-gentle-fade">
              En wat voel je hierbij?
            </p>
            <textarea
              value={emotionText}
              onChange={(e) => setEmotionText(e.target.value)}
              placeholder="Bijv. verdriet, boosheid, angst, schaamte…"
              rows={4}
              className="w-full rounded-2xl bg-cream border-2 border-sand-dark/20 focus:border-gold-light/60 outline-none px-4 py-3 text-anthracite font-sans text-sm transition-colors"
            />
          </div>
        )}

        {step === 'ackEmotion' && (
          <div className="text-center space-y-4">
            <p className="font-serif text-xl text-anthracite leading-relaxed animate-gentle-fade">
              {emotionText
                ? `Ja\u2026 ${emotionText.trim()} is logisch. Alleen erkennen is al regulerend.`
                : 'Dat mag er zijn. Alleen erkennen is al regulerend.'}
            </p>
            <p className="text-sm text-anthracite-soft font-sans leading-relaxed">
              Laten we kijken of je het ook ergens in je lichaam voelt.
            </p>
          </div>
        )}

        {step === 'bodyIntro' && (
          <div className="text-center space-y-4">
            <p className="font-serif text-xl text-anthracite leading-relaxed animate-gentle-fade">
              Zullen we naar je lichaam gaan?
            </p>
            <p className="text-sm text-anthracite-soft font-sans leading-relaxed">
              Niet om het weg te duwen—maar om te voelen waar het nu zit.
            </p>
          </div>
        )}

        {step === 'bodyCheck' && (
          <div className="w-full space-y-4">
            <p className="font-serif text-xl text-anthracite leading-relaxed text-center animate-gentle-fade">
              Wat voel je daar?
            </p>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Bijv. druk op borst, knoop in buik, spanning in kaken, tintelingen…"
              rows={5}
              className="w-full rounded-2xl bg-cream border-2 border-sand-dark/20 focus:border-gold-light/60 outline-none px-4 py-3 text-anthracite font-sans text-sm transition-colors"
            />
          </div>
        )}

        {/* ─── DRIE-INGANGEN KEUZE ─── */}
        {step === 'regulationChoice' && (
          <div className="w-full space-y-6 animate-gentle-fade">
            <div className="text-center space-y-3">
              <p className="font-serif text-xl text-anthracite leading-relaxed">
                Als je daar even bij stilstaat — waar merk je het nu het meest?
              </p>
              <p className="text-sm text-anthracite-soft font-sans leading-relaxed">
                Er is geen goed of fout. Kies wat nu het meest past.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {(['cognitive', 'emotional', 'somatic'] as RegulationDomain[]).map((domain) => (
                <button
                  key={domain}
                  onClick={() => handleDomainChoice(domain)}
                  className={`
                    flex items-center gap-4 w-full px-5 py-4 rounded-2xl border-2 transition-all duration-300
                    ${domain === 'cognitive'
                      ? 'bg-blue-50/40 border-blue-200/40 hover:border-blue-300/60 hover:bg-blue-50/60'
                      : domain === 'emotional'
                        ? 'bg-rose-50/40 border-rose-200/40 hover:border-rose-300/60 hover:bg-rose-50/60'
                        : 'bg-amber-50/40 border-amber-200/40 hover:border-amber-300/60 hover:bg-amber-50/60'
                    }
                  `}
                >
                  <div className={`
                    flex-shrink-0
                    ${domain === 'cognitive' ? 'text-blue-400' : domain === 'emotional' ? 'text-rose-400' : 'text-amber-500'}
                  `}>
                    <DomainIcon domain={domain} />
                  </div>
                  <div className="text-left">
                    <p className="font-sans text-base font-medium text-anthracite">
                      {domain === 'cognitive' ? 'In mijn denken' : domain === 'emotional' ? 'In mijn gevoel' : 'In mijn lichaam'}
                    </p>
                    <p className="font-sans text-xs text-anthracite-soft leading-relaxed">
                      {REGULATION_DOMAIN_DESCRIPTIONS[domain]}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}



        {/* ─── DOMAIN-SPECIFIC REGULATION ─── */}
        {step === 'regulation' && (
          <>
            <BreathAnimation domain={selectedDomain} />

            {selectedDomain && (
              <div className="flex items-center gap-2 mb-2">
                <span className={`
                  text-xs font-sans uppercase tracking-widest px-3 py-1 rounded-full
                  ${selectedDomain === 'cognitive'
                    ? 'bg-blue-100/50 text-blue-500'
                    : selectedDomain === 'emotional'
                      ? 'bg-rose-100/50 text-rose-500'
                      : 'bg-amber-100/50 text-amber-600'
                  }
                `}>
                  {REGULATION_DOMAIN_LABELS[selectedDomain]}
                </span>
              </div>
            )}

            <div className="text-center space-y-4">
              <p
                className="font-serif text-xl text-anthracite leading-relaxed animate-gentle-fade"
                key={`${selectedDomain}-${currentPromptIndex}`}
              >
                {regulationPrompts[currentPromptIndex]}
              </p>
            </div>
          </>
        )}

        {/* Main action button (not shown during regulationChoice — buttons are inline) */}
        {step !== 'regulationChoice' && (
          <button
            onClick={handleNext}
            className="px-8 py-4 rounded-2xl bg-cream border-2 border-sand-dark/20 hover:border-gold-light/50 transition-all duration-300 text-anthracite-light font-sans text-sm"
          >
            {primaryButtonLabel}
          </button>
        )}

        {showContact && (
          <div className="mt-4 p-6 rounded-2xl bg-cream/80 border border-sand-dark/20 text-center space-y-4 animate-gentle-fade">
            <p className="text-sm text-anthracite-soft font-sans leading-relaxed">
              Het is oké om hulp te vragen. Je hoeft dit niet alleen te doen.
            </p>
            <div className="space-y-2">
              <p className="text-sm text-anthracite font-sans font-medium">
                Neem contact op met je eigen zorgverlener of coach.
              </p>
              <p className="text-xs text-anthracite-soft font-sans">
                Bij acute nood: bel 113 Zelfmoordpreventie (0900-0113) of 112.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mt-4 items-center">
          {/* Return to conversation — primary action */}
          <button
            onClick={() => onResolved?.()}
            className="px-6 py-2.5 rounded-full text-sm text-anthracite font-sans font-medium transition-all duration-200 border border-gold-light/30 hover:border-gold/40 bg-cream/60 hover:bg-cream"
          >
            Terug naar gesprek
          </button>
          <button
            onClick={() => { onResolved?.(); setCurrentView('home'); }}
            className="px-5 py-2.5 rounded-full text-sm text-anthracite-soft hover:text-anthracite font-sans transition-colors duration-200"
          >
            Ik wil stoppen
          </button>
        </div>


      </div>
    </div>
  );
};

export default CrisisHandler;
