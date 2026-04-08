import React from 'react';
import { TrumpInfo, Suit } from 'tractor-shared';
import { RANK_NAMES, SUIT_SYMBOLS, SUIT_NAMES } from 'tractor-shared';
import './TrumpIndicator.css';

interface TrumpIndicatorProps {
  trumpInfo: TrumpInfo;
}

const TrumpIndicator: React.FC<TrumpIndicatorProps> = ({ trumpInfo }) => {
  const suitColor = trumpInfo.trumpSuit === Suit.Hearts || trumpInfo.trumpSuit === Suit.Diamonds
    ? 'var(--red-suit)'
    : 'var(--text-bright)';

  return (
    <div className="trump-indicator">
      <div className="trump-label">Trump</div>
      <div className="trump-display">
        <span className="trump-rank">{RANK_NAMES[trumpInfo.trumpRank]}</span>
        {trumpInfo.trumpSuit ? (
          <span className="trump-suit" style={{ color: suitColor }}>
            {SUIT_SYMBOLS[trumpInfo.trumpSuit]}
          </span>
        ) : (
          <span className="trump-notrump">NT</span>
        )}
      </div>
    </div>
  );
};

export default TrumpIndicator;
