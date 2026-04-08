import React from 'react';
import { GamePhase } from 'tractor-shared';
import './ActionBar.css';

interface ActionBarProps {
  phase: GamePhase;
  isMyTurn: boolean;
  isLeader: boolean;
  selectedCount: number;
  canBid: boolean;
  kittyPickedUp: boolean;
  onPlay: () => void;
  onBid: () => void;
  onClear: () => void;
  onReorganize?: () => void;
  showReorganize?: boolean;
}

const ActionBar: React.FC<ActionBarProps> = ({
  phase, isMyTurn, isLeader, selectedCount, canBid, kittyPickedUp,
  onPlay, onBid, onClear, onReorganize, showReorganize
}) => {
  // Can bid during drawing, kitty pickup (non-leader or leader who hasn't picked up), and no-bid selection
  const biddingPhases = [GamePhase.Drawing, GamePhase.KittyPickup, GamePhase.NoBidKittySelection];
  const canShowBid = biddingPhases.includes(phase) && canBid;
  // Leader can't bid after picking up kitty
  const bidDisabledForLeader = phase === GamePhase.KittyPickup && isLeader && kittyPickedUp;

  return (
    <div className="action-bar">
      {canShowBid && !bidDisabledForLeader && (
        <button
          className="btn btn-gold"
          onClick={onBid}
          disabled={selectedCount === 0}
        >
          Bid Trump
        </button>
      )}

      {phase === GamePhase.Playing && (
        <button
          className="btn btn-primary"
          onClick={onPlay}
          disabled={!isMyTurn || selectedCount === 0}
        >
          {isMyTurn ? `Play ${selectedCount} Card${selectedCount !== 1 ? 's' : ''}` : 'Waiting...'}
        </button>
      )}

      <button className="btn btn-secondary" onClick={onClear} disabled={selectedCount === 0}>
        Deselect
      </button>

      {showReorganize && onReorganize && (
        <button className="btn btn-secondary btn-reorganize" onClick={onReorganize}>
          Sort
        </button>
      )}

      {phase === GamePhase.Playing && isMyTurn && (
        <div className="turn-hint">Your turn</div>
      )}
    </div>
  );
};

export default ActionBar;
