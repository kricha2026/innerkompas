import React from 'react';
import { EmotionOption } from '@/lib/types';

interface EmotionPillsProps {
  options: EmotionOption[];
  selected: EmotionOption | null;
  onSelect: (option: EmotionOption) => void;
  prompt?: string;
}

const EmotionPills: React.FC<EmotionPillsProps> = ({ options, selected, onSelect, prompt }) => {
  return (
    <div className="flex flex-col gap-4 w-full animate-gentle-fade">
      {prompt && (
        <p className="text-base text-anthracite-soft font-sans text-center leading-relaxed px-2">
          {prompt}
        </p>
      )}
      
      <div className="flex flex-col gap-3 w-full">
        {options.map((option, index) => {
          const isSelected = selected?.id === option.id;
          const isOther = option.id === 'iets-anders';
          
          return (
            <button
              key={option.id}
              onClick={() => onSelect(option)}
              className={`
                w-full text-left px-5 py-4 rounded-2xl
                transition-all duration-300 ease-out
                ${isSelected 
                  ? 'bg-gold-light/50 border-2 border-gold/40 shadow-sm' 
                  : 'bg-cream/60 border-2 border-transparent hover:bg-cream hover:border-sand-dark/30'
                }
                ${isOther ? 'border-dashed' : ''}
              `}
              style={{ 
                animationDelay: `${index * 0.1}s`,
                animation: 'gentle-fade 0.5s ease-out forwards',
                opacity: 0,
              }}
            >
              <div className="flex items-center gap-3">
                <div className={`
                  w-3 h-3 rounded-full flex-shrink-0 transition-all duration-300
                  ${isSelected ? 'bg-gold scale-110' : 'bg-sand-dark/30'}
                `} />
                <div className="flex flex-col gap-0.5">
                  <span className={`
                    text-base font-sans font-medium transition-colors duration-200
                    ${isSelected ? 'text-anthracite' : 'text-anthracite-light'}
                  `}>
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="text-sm text-anthracite-soft/70 font-sans font-light leading-snug">
                      {option.description}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default EmotionPills;
