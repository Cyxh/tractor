import React, { useState } from 'react';
import { GameSettings, TrumpInfo, Suit, Rank, FriendDeclaration, Card } from 'tractor-shared';
import { RANK_NAMES, SUIT_SYMBOLS } from 'tractor-shared';
import './FriendDeclarationUI.css';

interface Props {
  settings: GameSettings;
  trumpInfo: TrumpInfo;
  onDeclare: (declarations: FriendDeclaration[]) => void;
  hand: Card[];
}

const ALL_SUITS: Suit[] = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];
const ALL_RANKS: Rank[] = [
  Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six, Rank.Seven,
  Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace,
];

const FriendDeclarationUI: React.FC<Props> = ({ settings, trumpInfo, onDeclare }) => {
  const numFriends = settings.numFriends ?? Math.floor(settings.numPlayers / 2) - 1;
  const [declarations, setDeclarations] = useState<{ suit: Suit; rank: Rank; ordinal: number }[]>(
    Array.from({ length: numFriends }, () => ({
      suit: Suit.Spades,
      rank: Rank.Ace,
      ordinal: 1,
    }))
  );

  const updateDeclaration = (idx: number, field: string, value: any) => {
    setDeclarations(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleConfirm = () => {
    const result: FriendDeclaration[] = declarations.map(d => ({
      card: { suit: d.suit, rank: d.rank },
      ordinal: d.ordinal,
      found: false,
    }));
    onDeclare(result);
  };

  // Filter out trump rank cards (can't be declared as friends)
  const availableRanks = ALL_RANKS.filter(r => r !== trumpInfo.trumpRank);

  return (
    <div className="friend-declaration">
      <h3>Declare {numFriends} Friend{numFriends > 1 ? 's' : ''}</h3>
      <div className="friend-list">
        {declarations.map((d, i) => (
          <div key={i} className="friend-row-input">
            <span className="friend-ordinal">Friend {i + 1}:</span>
            <select
              value={d.ordinal}
              onChange={e => updateDeclaration(i, 'ordinal', Number(e.target.value))}
              className="friend-select"
            >
              {[1, 2, 3].map(n => (
                <option key={n} value={n}>{n === 1 ? '1st' : n === 2 ? '2nd' : '3rd'} person to play</option>
              ))}
            </select>
            <select
              value={d.rank}
              onChange={e => updateDeclaration(i, 'rank', Number(e.target.value))}
              className="friend-select"
            >
              {availableRanks.map(r => (
                <option key={r} value={r}>{RANK_NAMES[r]}</option>
              ))}
            </select>
            <select
              value={d.suit}
              onChange={e => updateDeclaration(i, 'suit', e.target.value)}
              className="friend-select"
            >
              {ALL_SUITS.map(s => (
                <option key={s} value={s}>{SUIT_SYMBOLS[s]} {s}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" onClick={handleConfirm}>
        Confirm Friends
      </button>
    </div>
  );
};

export default FriendDeclarationUI;
