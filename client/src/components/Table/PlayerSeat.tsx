import React from 'react';
import { Player } from 'tractor-shared';
import { RANK_NAMES } from 'tractor-shared';
import './PlayerSeat.css';

interface PlayerSeatProps {
  player: Player;
  position: string;
  isCurrentTurn: boolean;
  isLeader: boolean;
  handSize: number;
  isMe: boolean;
  isConnected?: boolean;
}

const PlayerSeat: React.FC<PlayerSeatProps> = ({
  player, position, isCurrentTurn, isLeader, handSize, isMe, isConnected = true
}) => {
  if (isMe) return null; // "me" is shown by the hand area

  return (
    <div className={`player-seat seat-${position} ${isCurrentTurn ? 'active-turn' : ''} ${!isConnected ? 'seat-disconnected' : ''}`}>
      <div className="seat-avatar">
        <div className={`avatar-circle ${player.team === 'defending' ? 'team-defending' : 'team-attacking'}`}>
          {player.name.charAt(0).toUpperCase()}
        </div>
        {isLeader && <div className="leader-badge" title="Leader">&#9733;</div>}
      </div>
      <div className="seat-info">
        <div className="seat-name">{player.name}</div>
        <div className="seat-meta">
          {!isConnected ? (
            <span className="seat-offline">Offline</span>
          ) : (
            <>
              <span className="seat-level">Lv {RANK_NAMES[player.rank]}</span>
              <span className="seat-cards">{handSize} cards</span>
            </>
          )}
        </div>
      </div>
      {isCurrentTurn && isConnected && (
        <div className="seat-turn-badge">Their turn</div>
      )}
    </div>
  );
};

export default PlayerSeat;
