import React, { useState } from 'react';
import { BodyArea, BODY_AREA_LABELS } from '@/lib/types';

interface BodyMapProps {
  onSelect: (area: BodyArea) => void;
  selectedArea?: BodyArea | null;
}

interface BodyRegion {
  area: BodyArea;
  path: string;
  cx: number;
  cy: number;
}

const bodyRegions: BodyRegion[] = [
  { area: 'hoofd', path: '', cx: 100, cy: 32 },
  { area: 'keel', path: '', cx: 100, cy: 62 },
  { area: 'schouders', path: '', cx: 100, cy: 78 },
  { area: 'borst', path: '', cx: 100, cy: 105 },
  { area: 'buik', path: '', cx: 100, cy: 140 },
  { area: 'bekken', path: '', cx: 100, cy: 170 },
  { area: 'armen', path: '', cx: 55, cy: 130 },
  { area: 'benen', path: '', cx: 100, cy: 220 },
  { area: 'rug', path: '', cx: 145, cy: 120 },
];

const BodyMap: React.FC<BodyMapProps> = ({ onSelect, selectedArea }) => {
  const [hoveredArea, setHoveredArea] = useState<BodyArea | null>(null);

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-6">
      <p className="text-sm text-anthracite-soft font-sans text-center">
        Waar voel je het het meest?
      </p>
      
      {/* Body map with larger touch targets on mobile */}
      <div className="relative w-[200px] h-[270px] sm:w-[220px] sm:h-[300px]">
        {/* Body silhouette SVG */}
        <svg viewBox="0 0 200 280" className="w-full h-full" fill="none">
          {/* Body outline */}
          <ellipse cx="100" cy="30" rx="22" ry="26" 
            className="fill-sand-dark/30 stroke-anthracite-soft/20" strokeWidth="1" />
          
          {/* Neck */}
          <rect x="92" y="54" width="16" height="12" rx="4"
            className="fill-sand-dark/30 stroke-anthracite-soft/20" strokeWidth="1" />
          
          {/* Shoulders & torso */}
          <path d="M60 70 Q60 66 92 66 L108 66 Q140 66 140 70 L145 90 Q146 100 140 105 L138 170 Q136 180 120 182 L80 182 Q64 180 62 170 L60 105 Q54 100 55 90 Z"
            className="fill-sand-dark/30 stroke-anthracite-soft/20" strokeWidth="1" />
          
          {/* Left arm */}
          <path d="M60 72 L42 78 Q34 82 30 100 L26 140 Q24 150 28 152 L34 150 Q38 148 40 138 L50 105 L55 90"
            className="fill-sand-dark/30 stroke-anthracite-soft/20" strokeWidth="1" />
          
          {/* Right arm */}
          <path d="M140 72 L158 78 Q166 82 170 100 L174 140 Q176 150 172 152 L166 150 Q162 148 160 138 L150 105 L145 90"
            className="fill-sand-dark/30 stroke-anthracite-soft/20" strokeWidth="1" />
          
          {/* Left leg */}
          <path d="M80 182 L76 220 Q74 240 72 255 Q70 265 76 268 L84 268 Q88 266 86 255 L90 220 L92 182"
            className="fill-sand-dark/30 stroke-anthracite-soft/20" strokeWidth="1" />
          
          {/* Right leg */}
          <path d="M108 182 L110 220 Q112 240 114 255 Q116 266 120 268 L128 268 Q132 265 128 255 L124 220 L120 182"
            className="fill-sand-dark/30 stroke-anthracite-soft/20" strokeWidth="1" />
        </svg>

        {/* Interactive hotspots — larger on mobile for better touch targets */}
        {bodyRegions.map((region) => {
          const isSelected = selectedArea === region.area;
          const isHovered = hoveredArea === region.area;
          
          return (
            <button
              key={region.area}
              onClick={() => onSelect(region.area)}
              onMouseEnter={() => setHoveredArea(region.area)}
              onMouseLeave={() => setHoveredArea(null)}
              onTouchStart={() => setHoveredArea(region.area)}
              onTouchEnd={() => {
                // Small delay so the label is visible briefly
                setTimeout(() => setHoveredArea(null), 300);
              }}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 group touch-target"
              style={{ 
                left: `${(region.cx / 200) * 100}%`, 
                top: `${(region.cy / 280) * 100}%` 
              }}
              aria-label={BODY_AREA_LABELS[region.area]}
            >
              {/* Larger hit area on mobile (48px), normal on desktop (40px) */}
              <div className={`
                w-12 h-12 sm:w-10 sm:h-10 rounded-full flex items-center justify-center
                transition-all duration-300 ease-out
                ${isSelected 
                  ? 'bg-gold/40 ring-2 ring-gold scale-110' 
                  : isHovered 
                    ? 'bg-gold-light/50 scale-105' 
                    : 'bg-transparent hover:bg-gold-light/30 active:bg-gold-light/40'
                }
              `}>
                <div className={`
                  w-3.5 h-3.5 sm:w-3 sm:h-3 rounded-full transition-all duration-300
                  ${isSelected 
                    ? 'bg-gold animate-breathe' 
                    : isHovered 
                      ? 'bg-gold-muted/60' 
                      : 'bg-anthracite-soft/20'
                  }
                `} />
              </div>
              
              {/* Label tooltip */}
              {(isHovered || isSelected) && (
                <div className="absolute left-1/2 -translate-x-1/2 -top-9 sm:-top-8 whitespace-nowrap animate-gentle-fade z-10">
                  <span className="text-xs font-sans px-2.5 py-1.5 sm:px-2 sm:py-1 rounded-full bg-anthracite text-sand-light shadow-sm">
                    {BODY_AREA_LABELS[region.area]}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Quick-select buttons for mobile — alternative to tapping the body map */}
      <div className="flex flex-wrap justify-center gap-1.5 sm:hidden px-2 max-w-[280px]">
        {bodyRegions.map((region) => (
          <button
            key={region.area}
            onClick={() => onSelect(region.area)}
            className={`px-3 py-1.5 rounded-full text-xs font-sans transition-all duration-200 touch-target ${
              selectedArea === region.area
                ? 'bg-gold/30 text-anthracite border border-gold/30'
                : 'bg-cream/60 text-anthracite-soft border border-sand-dark/15 active:bg-gold-light/20'
            }`}
          >
            {BODY_AREA_LABELS[region.area]}
          </button>
        ))}
      </div>
    </div>
  );
};

export default BodyMap;
