import React, { useMemo } from 'react';
import { Trick, Player, TrumpInfo, GameSettings, Card } from 'tractor-shared';
import { decomposePlay, TrickComponent } from 'tractor-shared';
import CardComponent from './Card';
import './TrickArea.css';

interface TrickAreaProps {
  currentTrick: Trick | null;
  players: Player[];
  myIndex: number;
  trumpInfo: TrumpInfo;
  settings: GameSettings;
}

function getComponentLabel(comp: TrickComponent): string {
  if (comp.length >= 2) return 'Tractor';
  if (comp.groupSize >= 3) return 'Triple';
  if (comp.groupSize === 2) return 'Pair';
  return 'Single';
}

function describePlay(components: TrickComponent[]): string {
  if (components.length === 0) return '';

  // Sort by component size descending (total cards in component)
  const sorted = [...components].sort(
    (a, b) => (b.groupSize * b.length) - (a.groupSize * a.length)
  );

  // Group identical types
  const groups: { label: string; count: number }[] = [];
  for (const comp of sorted) {
    const label = getComponentLabel(comp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.count++;
    } else {
      groups.push({ label, count: 1 });
    }
  }

  return groups.map(g => g.count > 1 ? `${g.label} x${g.count}` : g.label).join(' + ');
}

/** Group components by type: tractors, triples, pairs, singles — each type in its own row */
function groupComponentsByType(components: TrickComponent[]): TrickComponent[][] {
  const tractors: TrickComponent[] = [];
  const triples: TrickComponent[] = [];
  const pairs: TrickComponent[] = [];
  const singles: TrickComponent[] = [];

  for (const comp of components) {
    if (comp.length >= 2) tractors.push(comp);
    else if (comp.groupSize >= 3) triples.push(comp);
    else if (comp.groupSize === 2) pairs.push(comp);
    else singles.push(comp);
  }

  const rows: TrickComponent[][] = [];
  if (tractors.length > 0) rows.push(tractors);
  if (triples.length > 0) rows.push(triples);
  if (pairs.length > 0) rows.push(pairs);
  if (singles.length > 0) rows.push(singles);
  return rows;
}

const TrickArea: React.FC<TrickAreaProps> = ({ currentTrick, players, myIndex, trumpInfo, settings }) => {
  if (!currentTrick || currentTrick.plays.length === 0) {
    return <div className="trick-area" />;
  }

  const n = players.length;

  const getPlayPosition = (playerIdx: number): string => {
    const relativeIdx = (playerIdx - myIndex + n) % n;
    const positions: Record<number, Record<number, string>> = {
      2: { 0: 'trick-bottom', 1: 'trick-top' },
      3: { 0: 'trick-bottom', 1: 'trick-right', 2: 'trick-left' },
      4: { 0: 'trick-bottom', 1: 'trick-right', 2: 'trick-top', 3: 'trick-left' },
      5: { 0: 'trick-bottom', 1: 'trick-bottom-right', 2: 'trick-top-right', 3: 'trick-top-left', 4: 'trick-bottom-left' },
      6: { 0: 'trick-bottom', 1: 'trick-bottom-right', 2: 'trick-right', 3: 'trick-top', 4: 'trick-left', 5: 'trick-bottom-left' },
    };
    return positions[n]?.[relativeIdx] || 'trick-bottom';
  };

  // Decompose the lead play for description
  const leadPlay = currentTrick.plays[0];
  const leadComponents = useMemo(
    () => decomposePlay(leadPlay.cards, trumpInfo, settings),
    [leadPlay.cards, trumpInfo, settings]
  );
  const leadDescription = useMemo(() => describePlay(leadComponents), [leadComponents]);

  // Scale cards based on number of cards in the lead play
  const maxCardsInPlay = Math.max(...currentTrick.plays.map(p => p.cards.length), 1);
  const cardScale = maxCardsInPlay <= 4 ? 1 : maxCardsInPlay <= 6 ? 0.85 : maxCardsInPlay <= 8 ? 0.75 : 0.65;

  return (
    <div className="trick-area" style={{ '--trick-card-scale': cardScale } as React.CSSProperties}>
      {/* Lead play description */}
      <div className="trick-description">
        <span className="trick-description-text">{leadDescription}</span>
      </div>

      {currentTrick.plays.map((play, i) => {
        const components = decomposePlay(play.cards, trumpInfo, settings);
        const rows = groupComponentsByType(components);
        return (
          <div key={i} className={`trick-play ${getPlayPosition(play.playerIdx)}`}>
            <div className="trick-play-cards">
              {rows.map((row, ri) => (
                <div key={ri} className="trick-component-row">
                  {row.map((comp, ci) => (
                    <div key={ci} className="trick-component-group">
                      {comp.cards.map((card, j) => (
                        <div
                          key={j}
                          className={`trick-card-wrapper ${j > 0 ? 'trick-card-overlap' : ''}`}
                        >
                          <CardComponent card={card} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TrickArea;
