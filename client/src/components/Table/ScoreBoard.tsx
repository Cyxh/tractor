import React from 'react';
import { PlayerView } from 'tractor-shared';
import { RANK_NAMES, getScoreThresholds } from 'tractor-shared';
import './ScoreBoard.css';

interface ScoreBoardProps {
  gameState: PlayerView;
  scoreAnimation?: { attacking: number; defending: number } | null;
}

const ScoreBoard: React.FC<ScoreBoardProps> = ({ gameState, scoreAnimation }) => {
  const atkDelta = scoreAnimation ? gameState.attackingPoints - scoreAnimation.attacking : 0;
  const defDelta = scoreAnimation ? gameState.defendingPoints - scoreAnimation.defending : 0;

  const thresholds = getScoreThresholds(gameState.settings.numDecks);
  // Attacking needs to reach base*2 (e.g. 80 for 2 decks) to prevent defenders advancing
  const targetPoints = thresholds.find(t => t.defendingAdvance === 0 && t.attackingAdvance === 0)?.threshold ?? 80;

  return (
    <div className="scoreboard">
      <div className="score-title">Score</div>
      <div className="score-teams">
        <div className="score-team">
          <div className="team-label team-atk">Attacking</div>
          <div className={`team-points ${scoreAnimation && atkDelta > 0 ? 'score-pop' : ''}`}>
            {gameState.attackingPoints}
            {scoreAnimation && atkDelta > 0 && (
              <span className="score-delta score-delta-atk">+{atkDelta}</span>
            )}
          </div>
        </div>
        <div className="score-divider">vs</div>
        <div className="score-team">
          <div className="team-label team-def">Defending</div>
          <div className={`team-points ${scoreAnimation && defDelta > 0 ? 'score-pop' : ''}`}>
            {gameState.defendingPoints}
            {scoreAnimation && defDelta > 0 && (
              <span className="score-delta score-delta-def">+{defDelta}</span>
            )}
          </div>
        </div>
      </div>
      <div className="score-target">
        <div className="score-target-bar">
          <div
            className="score-target-fill"
            style={{ width: `${Math.min(100, (gameState.attackingPoints / targetPoints) * 100)}%` }}
          />
        </div>
        <div className="score-target-label">{gameState.attackingPoints} / {targetPoints} to break even</div>
      </div>

      <div className="player-levels">
        <div className="levels-title">Levels</div>
        {gameState.players.map(p => (
          <div key={p.id} className="level-row">
            <span className={`level-name ${p.team === 'defending' ? 'defending' : 'attacking'}`}>
              {p.name}
            </span>
            <span className="level-rank">{RANK_NAMES[p.rank]}</span>
          </div>
        ))}
      </div>

      {gameState.friendDeclarations.length > 0 && (
        <div className="friend-declarations">
          <div className="levels-title">Friends</div>
          {gameState.friendDeclarations.map((fd, i) => (
            <div key={i} className={`friend-row ${fd.found ? 'found' : ''}`}>
              <span>{fd.ordinal === 1 ? '1st' : fd.ordinal === 2 ? '2nd' : `${fd.ordinal}th`}</span>
              <span>{RANK_NAMES[fd.card.rank]}{fd.card.suit}</span>
              <span>{fd.found ? '(Found)' : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div className="round-info">Round {gameState.roundNumber}</div>
    </div>
  );
};

export default ScoreBoard;
