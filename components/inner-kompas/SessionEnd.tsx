import React, { useState, useEffect } from 'react';
import { useSession } from '@/contexts/SessionContext';

const CLOSING_MESSAGES = [
  {
    recognition: 'Je hebt geluisterd naar wat er leeft.',
    direction: 'Nu kan je inner kompas zijn werk doen.',
  },
  {
    recognition: 'Er is ruimte ontstaan.',
    direction: 'Vanuit die ruimte beweegt alles als vanzelf.',
  },
  {
    recognition: 'Je hebt erkend wat er is.',
    direction: 'Dat is genoeg. De rest volgt.',
  },
  {
    recognition: 'Je bent dichterbij jezelf gekomen.',
    direction: 'Vanuit hier navigeer je als vanzelf.',
  },
  {
    recognition: 'Wat er mocht zijn, is er geweest.',
    direction: 'Je kompas wijst de weg. Vertrouw het.',
  },
];

const SessionEnd: React.FC = () => {
  const { setCurrentView, session } = useSession();

  const [phase, setPhase] = useState<'recognition' | 'direction' | 'silence' | 'complete'>('recognition');
  const [message] = useState(() => CLOSING_MESSAGES[Math.floor(Math.random() * CLOSING_MESSAGES.length)]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    
    timers.push(setTimeout(() => setPhase('direction'), 3000));
    timers.push(setTimeout(() => setPhase('silence'), 6000));
    timers.push(setTimeout(() => setPhase('complete'), 10000));

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-content-mobile px-4 sm:px-6 py-8 sm:py-12">
      <div className="w-full max-w-md flex flex-col items-center gap-8 sm:gap-12">
        
        {/* Recognition */}
        <div className={`text-center transition-all duration-1000 ${
          phase === 'recognition' || phase === 'direction' || phase === 'silence' || phase === 'complete'
            ? 'opacity-100 translate-y-0' 
            : 'opacity-0 translate-y-4'
        }`}>
          <p className="font-serif text-xl sm:text-2xl text-anthracite leading-relaxed">
            {message.recognition}
          </p>
        </div>

        {/* Emotion words used */}
        {session && session.userEmotionWords.length > 0 && (
          <div className={`flex flex-wrap justify-center gap-1.5 sm:gap-2 transition-all duration-1000 delay-500 ${
            phase === 'direction' || phase === 'silence' || phase === 'complete'
              ? 'opacity-100' 
              : 'opacity-0'
          }`}>
            {session.userEmotionWords.map((word, i) => (
              <span key={i} className="text-xs px-3 py-1 rounded-full bg-gold-light/20 text-anthracite-soft font-sans">
                {word}
              </span>
            ))}
          </div>
        )}

        {/* Direction */}
        <div className={`text-center transition-all duration-1000 ${
          phase === 'direction' || phase === 'silence' || phase === 'complete'
            ? 'opacity-100 translate-y-0' 
            : 'opacity-0 translate-y-4'
        }`}>
          <p className="font-serif text-base sm:text-lg text-anthracite-light italic leading-relaxed">
            {message.direction}
          </p>
        </div>

        {/* Silence indicator */}
        <div className={`transition-all duration-1000 ${
          phase === 'silence' || phase === 'complete'
            ? 'opacity-100' 
            : 'opacity-0'
        }`}>
          <div className="w-12 h-px bg-gold/30" />
        </div>

        {/* Spacious silence */}
        <div className="h-6 sm:h-12" />

        {/* Compass icon */}
        <div className={`transition-all duration-1000 ${
          phase === 'silence' || phase === 'complete'
            ? 'opacity-100' 
            : 'opacity-0'
        }`}>
          <div className="w-12 h-12 rounded-full bg-gold-light/15 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-gold-muted/60">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" className="fill-gold/15" stroke="none" />
              <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" />
            </svg>
          </div>
        </div>

        {/* Return button */}
        <div className={`w-full max-w-xs transition-all duration-1000 ${
          phase === 'complete' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
          <button
            onClick={() => setCurrentView('home')}
            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-cream/60 border-2 border-sand-dark/15 hover:border-gold-light/30 active:bg-sand-dark/10 transition-all duration-300 text-anthracite-soft font-sans text-sm touch-target"
          >
            Terug naar begin
          </button>
        </div>

        {/* Dots */}
        <div className={`text-center transition-all duration-1000 delay-300 ${
          phase === 'complete' ? 'opacity-60' : 'opacity-0'
        }`}>
          <p className="text-anthracite-soft/20 font-serif text-2xl tracking-widest">
            . . .
          </p>
        </div>
      </div>
    </div>
  );
};

export default SessionEnd;
