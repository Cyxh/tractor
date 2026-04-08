import React from 'react';
import { Card as CardType, Suit, Rank, JokerType, TrumpInfo } from 'tractor-shared';
import { RANK_NAMES, SUIT_SYMBOLS } from 'tractor-shared';
import './Card.css';

interface CardProps {
  card: CardType;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  faceDown?: boolean;
  style?: React.CSSProperties;
  isTrump?: boolean;
  isPointCard?: boolean;
}

function getSuitColor(suit: Suit): string {
  return suit === Suit.Hearts || suit === Suit.Diamonds ? 'red' : 'black';
}

function getSuitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit] || '';
}

function getRankDisplay(rank: Rank): string {
  return RANK_NAMES[rank] || String(rank);
}

// Face card symbols
const FACE_SYMBOLS: Record<number, string> = {
  [Rank.Jack]: '\u265E',
  [Rank.Queen]: '\u2655',
  [Rank.King]: '\u2654',
};

const FACE_LABELS: Record<number, string> = {
  [Rank.Jack]: 'JACK',
  [Rank.Queen]: 'QUEEN',
  [Rank.King]: 'KING',
};

// Pip layout positions for number cards (normalized 0-1 coordinates)
function getPipPositions(rank: Rank): [number, number][] {
  switch (rank) {
    case Rank.Ace: return [[0.5, 0.5]];
    case Rank.Two: return [[0.5, 0.25], [0.5, 0.75]];
    case Rank.Three: return [[0.5, 0.2], [0.5, 0.5], [0.5, 0.8]];
    case Rank.Four: return [[0.3, 0.25], [0.7, 0.25], [0.3, 0.75], [0.7, 0.75]];
    case Rank.Five: return [[0.3, 0.25], [0.7, 0.25], [0.5, 0.5], [0.3, 0.75], [0.7, 0.75]];
    case Rank.Six: return [[0.3, 0.2], [0.7, 0.2], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]];
    case Rank.Seven: return [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]];
    case Rank.Eight: return [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.5, 0.65], [0.3, 0.8], [0.7, 0.8]];
    case Rank.Nine: return [[0.3, 0.18], [0.7, 0.18], [0.3, 0.39], [0.7, 0.39], [0.5, 0.5], [0.3, 0.61], [0.7, 0.61], [0.3, 0.82], [0.7, 0.82]];
    case Rank.Ten: return [[0.3, 0.18], [0.7, 0.18], [0.5, 0.29], [0.3, 0.39], [0.7, 0.39], [0.3, 0.61], [0.7, 0.61], [0.5, 0.71], [0.3, 0.82], [0.7, 0.82]];
    default: return [[0.5, 0.5]];
  }
}

function isFaceCard(rank: Rank): boolean {
  return rank === Rank.Jack || rank === Rank.Queen || rank === Rank.King;
}

function isPointCardRank(rank: Rank): boolean {
  return rank === Rank.Five || rank === Rank.Ten || rank === Rank.King;
}

export const CardComponent: React.FC<CardProps> = ({
  card, selected, onClick, small, faceDown, style, isTrump, isPointCard
}) => {
  if (faceDown) {
    return (
      <div
        className={`card card-back ${small ? 'card-small' : ''}`}
        style={style}
      >
        <div className="card-back-pattern" />
      </div>
    );
  }

  const isJoker = card.kind === 'joker';
  const isBigJoker = isJoker && card.jokerType === JokerType.Big;

  let colorClass = '';
  let rankText = '';
  let suitSymbol = '';
  let suit: Suit | null = null;
  let rank: Rank | null = null;

  if (isJoker) {
    colorClass = isBigJoker ? 'red' : 'black';
    rankText = '';
    suitSymbol = '';
  } else {
    const suited = card as { suit: Suit; rank: Rank };
    suit = suited.suit;
    rank = suited.rank;
    colorClass = getSuitColor(suited.suit);
    rankText = getRankDisplay(suited.rank);
    suitSymbol = getSuitSymbol(suited.suit);
  }

  // Auto-detect point card
  const isPoint = isPointCard || (rank !== null && isPointCardRank(rank));

  const auraClass = [
    isTrump && !isJoker ? 'card-trump-aura' : '',
    isPoint ? 'card-point-aura' : '',
  ].filter(Boolean).join(' ');

  const renderCenter = () => {
    if (isJoker) {
      return (
        <div className={`card-joker-full ${isBigJoker ? 'big-joker-full' : 'little-joker-full'}`}>
          <div className="joker-symbol">{isBigJoker ? '\u2605' : '\u2606'}</div>
          <div className="joker-shimmer" />
        </div>
      );
    }

    if (rank !== null && isFaceCard(rank)) {
      return (
        <div className="card-face">
          <div className="face-symbol">{FACE_SYMBOLS[rank]}</div>
          <div className="face-label">{FACE_LABELS[rank]}</div>
          <div className="face-suit">{suitSymbol}</div>
        </div>
      );
    }

    if (rank !== null && rank === Rank.Ace) {
      return <span className="card-ace-pip">{suitSymbol}</span>;
    }

    // Number cards: render pip layout (both full and small cards)
    if (rank !== null) {
      const pips = getPipPositions(rank);
      return (
        <div className="card-pips">
          {pips.map(([x, y], i) => (
            <span
              key={i}
              className={`card-pip ${y > 0.5 ? 'pip-inverted' : ''}`}
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            >
              {suitSymbol}
            </span>
          ))}
        </div>
      );
    }

    return <span className="card-suit-large">{suitSymbol}</span>;
  };

  return (
    <div
      className={`card ${small ? 'card-small' : ''} ${selected ? 'card-selected' : ''} card-${colorClass} ${auraClass} ${isJoker ? 'card-joker-type' : ''}`}
      onClick={onClick}
      style={style}
    >
      {/* Jokers don't get corner indicators */}
      {!isJoker && (
        <>
          <div className="card-corner card-corner-top">
            <span className="card-rank">{rankText}</span>
            <span className="card-suit-small">{suitSymbol}</span>
          </div>
          <div className="card-corner card-corner-bottom">
            <span className="card-rank">{rankText}</span>
            <span className="card-suit-small">{suitSymbol}</span>
          </div>
        </>
      )}
      <div className={`card-center ${isJoker ? 'card-center-joker' : ''}`}>
        {renderCenter()}
      </div>
    </div>
  );
};

export default CardComponent;
