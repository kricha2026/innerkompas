import React, { useState, useEffect } from 'react';

interface LiveCoachToggleProps {
  isLive: boolean;
  onToggle: () => void;
}

const LiveCoachToggle: React.FC<LiveCoachToggleProps> = ({ isLive, onToggle }) => {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Show brief confirmation when toggled ON
  useEffect(() => {
    if (isLive) {
      setShowConfirmation(true);
      const timer = setTimeout(() => setShowConfirmation(false), 2500);
      return () => clearTimeout(timer);
    } else {
      setShowConfirmation(false);
    }
  }, [isLive]);

  return (
    <div className="fixed top-[80px] right-4 z-40 flex flex-col items-end gap-1.5">
      {/* Toggle button */}
      <button
        onClick={onToggle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full backdrop-blur-sm border shadow-sm transition-all duration-300 ${
          isLive
            ? 'bg-emerald-50/80 border-emerald-300/40 hover:bg-emerald-50'
            : 'bg-cream/80 border-sand-dark/15 hover:bg-cream/95'
        }`}
        aria-label={isLive ? 'Live coach-weergave uitschakelen' : 'Live coach-weergave inschakelen'}
      >
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
          isLive ? 'bg-emerald-500 animate-slow-pulse' : 'bg-red-400/60'
        }`} />
        
        {/* Eye icon */}
        {isLive ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        )}
      </button>

      {/* Desktop tooltip on hover */}
      {showTooltip && !showConfirmation && (
        <div className="hidden md:block absolute right-0 top-full mt-1 px-3 py-1.5 rounded-lg bg-anthracite/90 text-sand-light text-xs font-sans whitespace-nowrap shadow-lg animate-gentle-fade">
          {isLive ? 'Coach kijkt live mee' : 'Coach kan live meekijken'}
        </div>
      )}

      {/* Mobile/desktop confirmation when toggled ON */}
      {showConfirmation && (
        <div className="px-3 py-1.5 rounded-lg bg-emerald-500/90 text-white text-xs font-sans whitespace-nowrap shadow-lg animate-gentle-fade">
          Coach kijkt nu mee
        </div>
      )}
    </div>
  );
};

export default LiveCoachToggle;
