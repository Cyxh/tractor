import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { PlayerView, Card, GamePhase, cardId, cardEquals, ChatMessage, Trick, determineTrickWinner } from 'tractor-shared';
import { RANK_NAMES, SUIT_SYMBOLS, SUIT_NAMES } from 'tractor-shared';
import { cardOrder as getCardOrder } from 'tractor-shared';
import CardComponent from './Card';
import PlayerSeat from './PlayerSeat';
import TrickArea from './TrickArea';
import ActionBar from './ActionBar';
import ScoreBoard from './ScoreBoard';
import TrumpIndicator from './TrumpIndicator';
// KittyExchange is now inline in the hand area
import FriendDeclarationUI from './FriendDeclarationUI';
import ChatPanel from '../Chat/ChatPanel';
import './GameTable.css';

interface GameTableProps {
  gameState: PlayerView;
  playerId: string | null;
  onPlayCards: (cards: Card[]) => void;
  onBid: (cards: Card[]) => void;
  onExchangeKitty: (kitty: Card[]) => void;
  onDeclareFriends: (declarations: any[]) => void;
  onNextRound: () => void;
  onVoteRandomKitty: () => void;
  onPickupKitty: () => void;
  onConfirmReady: () => void;
  onSendChat: (message: string) => void;
  chatMessages: ChatMessage[];
  error: string | null;
  spectators?: { id: string; name: string }[];
  onSpectateAs?: (playerId: string) => void;
  onDevSwitchPlayer?: (targetPlayerId: string) => void;
  onLeave?: () => void;
  isConnected?: boolean;
}

const GameTable: React.FC<GameTableProps> = ({
  gameState, playerId, onPlayCards, onBid, onExchangeKitty, onDeclareFriends,
  onNextRound, onVoteRandomKitty, onPickupKitty, onConfirmReady,
  onSendChat, chatMessages, error, spectators, onSpectateAs, onDevSwitchPlayer,
  onLeave, isConnected = true
}) => {
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const prevHandRef = useRef<Set<string>>(new Set());
  const [newCardIds, setNewCardIds] = useState<Set<string>>(new Set());
  const [exitingCards, setExitingCards] = useState<{ card: Card; id: string; left: number }[]>([]);
  const [hoveredCardIdx, setHoveredCardIdx] = useState<number | null>(null);
  const [cardOrder, setCardOrder] = useState<Card[]>([]);
  const [hasManualOrder, setHasManualOrder] = useState(false);

  // Vote overlay fade-out state
  const [showVoteOverlay, setShowVoteOverlay] = useState(false);
  const [voteOverlayFading, setVoteOverlayFading] = useState(false);
  const prevPhaseRef = useRef<GamePhase | null>(null);
  const phase = gameState.phase;

  useEffect(() => {
    const isNoBid = phase === GamePhase.NoBidKittySelection;
    const wasNoBid = prevPhaseRef.current === GamePhase.NoBidKittySelection;

    if (isNoBid && !showVoteOverlay) {
      setShowVoteOverlay(true);
      setVoteOverlayFading(false);
    } else if (!isNoBid && wasNoBid && showVoteOverlay) {
      setVoteOverlayFading(true);
      const timer = setTimeout(() => {
        setShowVoteOverlay(false);
        setVoteOverlayFading(false);
      }, 400);
      return () => clearTimeout(timer);
    } else if (!isNoBid && !wasNoBid) {
      setShowVoteOverlay(false);
    }

    prevPhaseRef.current = phase;
  }, [phase, showVoteOverlay]);

  // Mobile sidebar toggles
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);

  // Trick completion delay state
  const [completedTrick, setCompletedTrick] = useState<Trick | null>(null);
  const [trickWinnerIdx, setTrickWinnerIdx] = useState<number | null>(null);
  const prevTricksLenRef = useRef<number>(-1);
  const [scoreAnimation, setScoreAnimation] = useState<{ attacking: number; defending: number } | null>(null);
  const prevScoresRef = useRef<{ attacking: number; defending: number }>({ attacking: 0, defending: 0 });

  // Detect trick completion and buffer it
  useEffect(() => {
    const prevLen = prevTricksLenRef.current;
    const curLen = gameState.tricks.length;

    if (prevLen >= 0 && curLen > prevLen) {
      // A trick just completed
      const lastTrick = gameState.tricks[curLen - 1];
      setCompletedTrick(lastTrick);
      setTrickWinnerIdx(lastTrick.winner ?? null);

      // Animate score change
      const prevAtk = prevScoresRef.current.attacking;
      const prevDef = prevScoresRef.current.defending;
      if (gameState.attackingPoints !== prevAtk || gameState.defendingPoints !== prevDef) {
        setScoreAnimation({ attacking: prevAtk, defending: prevDef });
      }

      const timer = setTimeout(() => {
        // Don't clear the completed trick during scoring — keep it visible
        if (gameState.phase !== GamePhase.Scoring) {
          setCompletedTrick(null);
          setTrickWinnerIdx(null);
        }
        setScoreAnimation(null);
      }, 2000);
      return () => clearTimeout(timer);
    }

    prevTricksLenRef.current = curLen;
    prevScoresRef.current = { attacking: gameState.attackingPoints, defending: gameState.defendingPoints };
  }, [gameState.tricks.length, gameState.attackingPoints, gameState.defendingPoints]);

  // Drag state for custom drag animation
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const handCardsRef = useRef<HTMLDivElement>(null);
  const cardWrappersRef = useRef<(HTMLDivElement | null)[]>([]);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDragRef = useRef<{ idx: number; x: number; y: number } | null>(null);
  const dragActiveRef = useRef(false);

  // Sync card order with hand
  useEffect(() => {
    const handIds = new Set(gameState.hand.map(c => cardId(c)));
    const currentIds = new Set(cardOrder.map(c => cardId(c)));
    const added = gameState.hand.filter(c => !currentIds.has(cardId(c)));
    const removed = cardOrder.filter(c => !handIds.has(cardId(c)));
    const cardsChanged = added.length > 0 || removed.length > 0;

    if (!cardsChanged && cardOrder.length > 0) {
      // Same cards, just different sort from server (e.g. bid changed trump) — keep current order
      return;
    }

    const phase = gameState.phase;
    const isDrawing = phase === GamePhase.Drawing;

    if (isDrawing || !hasManualOrder) {
      // During drawing or without manual reorder, follow server's sorted order
      setCardOrder(gameState.hand);
    } else {
      // Preserve manual order, add new cards, remove gone cards
      const remaining = cardOrder.filter(c => handIds.has(cardId(c)));
      if (added.length > 0 || remaining.length !== cardOrder.length) {
        setCardOrder([...remaining, ...added]);
      }
    }
  }, [gameState.hand, gameState.phase]);

  // Reset manual order on new round
  useEffect(() => {
    if (gameState.phase === GamePhase.Drawing) {
      setHasManualOrder(false);
      setCompletedTrick(null);
      setTrickWinnerIdx(null);
    }
  }, [gameState.phase]);

  // Track newly dealt cards and exiting cards for animation
  const prevHandCardsRef = useRef<Map<string, Card>>(new Map());
  // FLIP animation: snapshot card positions keyed by card ID
  const cardPositionSnapshot = useRef<Map<string, DOMRect>>(new Map());
  const pendingFlip = useRef(false);

  // Snapshot current card positions into ref (call before hand changes)
  const snapshotCardPositions = useCallback(() => {
    const positions = new Map<string, DOMRect>();
    cardWrappersRef.current.forEach((el, idx) => {
      if (el) {
        const cards = cardOrder.length > 0 ? cardOrder : gameState.hand;
        const card = cards[idx];
        if (card) positions.set(cardId(card), el.getBoundingClientRect());
      }
    });
    cardPositionSnapshot.current = positions;
  }, [cardOrder, gameState.hand]);

  // Detect new/removed cards and trigger animations
  useEffect(() => {
    const currentIds = new Set(gameState.hand.map(c => cardId(c)));
    const newIds = new Set<string>();
    currentIds.forEach(id => {
      if (!prevHandRef.current.has(id)) newIds.add(id);
    });

    // Detect removed cards for exit animation, capturing their last positions
    const removed: { card: Card; id: string; left: number }[] = [];
    const containerRect = handCardsRef.current?.getBoundingClientRect();
    prevHandRef.current.forEach(id => {
      if (!currentIds.has(id)) {
        const card = prevHandCardsRef.current.get(id);
        if (card) {
          const snap = cardPositionSnapshot.current.get(id);
          const left = snap && containerRect ? snap.left - containerRect.left : -1;
          removed.push({ card, id, left });
        }
      }
    });

    prevHandRef.current = currentIds;
    prevHandCardsRef.current = new Map(gameState.hand.map(c => [cardId(c), c]));

    if (removed.length > 0) {
      setExitingCards(removed);
      pendingFlip.current = true;
      const timer = setTimeout(() => setExitingCards([]), 250);
      return () => clearTimeout(timer);
    }
    if (newIds.size > 0 && gameState.phase !== GamePhase.Scoring && gameState.phase !== GamePhase.GameOver) {
      setNewCardIds(newIds);
      pendingFlip.current = true;
      const timer = setTimeout(() => setNewCardIds(new Set()), 350);
      return () => clearTimeout(timer);
    }
  }, [gameState.hand]);

  // FLIP: after DOM updates with new cards, animate existing cards from old to new positions
  useLayoutEffect(() => {
    if (!pendingFlip.current) {
      // No pending animation — just snapshot for next time
      snapshotCardPositions();
      return;
    }
    pendingFlip.current = false;
    const oldPositions = cardPositionSnapshot.current;

    // Read new positions and apply inverse transforms
    const animations: { el: HTMLDivElement; dx: number }[] = [];
    const cards = cardOrder.length > 0 ? cardOrder : gameState.hand;
    cardWrappersRef.current.forEach((el, idx) => {
      if (!el) return;
      const card = cards[idx];
      if (!card) return;
      const cid = cardId(card);
      const oldRect = oldPositions.get(cid);
      if (!oldRect) return; // New card, skip (uses deal-in animation)
      const newRect = el.getBoundingClientRect();
      const dx = oldRect.left - newRect.left;
      if (Math.abs(dx) > 1) {
        animations.push({ el, dx });
      }
    });

    if (animations.length > 0) {
      // Apply inverse transform immediately (before paint)
      for (const { el, dx } of animations) {
        el.style.transition = 'none';
        el.style.transform = `translateX(${dx}px)`;
      }
      // Force reflow so the transform is applied
      void document.body.offsetHeight;
      // Animate to final position
      for (const { el } of animations) {
        el.style.transition = 'transform 0.3s ease';
        el.style.transform = '';
      }
    }

    // Snapshot new positions for next change
    snapshotCardPositions();
  });

  // Arrange players around the table relative to current player
  const seatPositions = useMemo(() => {
    const n = gameState.players.length;
    const layoutMap: Record<number, string[]> = {
      2: ['bottom', 'top'],
      3: ['bottom', 'right', 'left'],
      4: ['bottom', 'right', 'top', 'left'],
      5: ['bottom', 'bottom-right', 'top-right', 'top-left', 'bottom-left'],
      6: ['bottom', 'bottom-right', 'right', 'top', 'left', 'bottom-left'],
    };
    return layoutMap[n] || layoutMap[4];
  }, [gameState.players.length]);

  const orderedPlayers = useMemo(() => {
    const n = gameState.players.length;
    const result = [];
    for (let i = 0; i < n; i++) {
      const idx = (gameState.myIndex + i) % n;
      result.push({ player: gameState.players[idx], originalIdx: idx });
    }
    return result;
  }, [gameState.players, gameState.myIndex]);

  const toggleCard = useCallback((card: Card) => {
    const idx = selectedCards.findIndex(c => cardId(c) === cardId(card));
    if (idx >= 0) {
      setSelectedCards(prev => prev.filter((_, i) => i !== idx));
    } else {
      setSelectedCards(prev => [...prev, card]);
    }
  }, [selectedCards]);

  const handlePlay = () => {
    if (selectedCards.length > 0) {
      onPlayCards(selectedCards);
      setSelectedCards([]);
    }
  };

  const handleBid = () => {
    if (selectedCards.length > 0) {
      onBid(selectedCards);
      setSelectedCards([]);
    }
  };

  // Custom drag handlers with delay - only activates after holding 150ms
  const handleMouseDown = useCallback((idx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    pendingDragRef.current = { idx, x: e.clientX, y: e.clientY };
    dragActiveRef.current = false;

    dragTimerRef.current = setTimeout(() => {
      if (pendingDragRef.current) {
        dragActiveRef.current = true;
        setDragIdx(pendingDragRef.current.idx);
        setDragPos({ x: pendingDragRef.current.x, y: pendingDragRef.current.y });
        setDropIdx(pendingDragRef.current.idx);
      }
    }, 150);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Update pending position if drag hasn't activated yet
      if (pendingDragRef.current && !dragActiveRef.current) {
        pendingDragRef.current = { ...pendingDragRef.current, x: e.clientX, y: e.clientY };
      }
      if (dragIdx === null) return;
      setDragPos({ x: e.clientX, y: e.clientY });

      // Calculate drop index based on cursor position
      if (handCardsRef.current) {
        const wrappers = cardWrappersRef.current;
        let newDropIdx = dragIdx;
        for (let i = 0; i < wrappers.length; i++) {
          const el = wrappers[i];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const midX = rect.left + rect.width / 2;
          if (e.clientX < midX) {
            newDropIdx = i;
            break;
          }
          newDropIdx = i + 1;
        }
        newDropIdx = Math.max(0, Math.min(newDropIdx, cardOrder.length - 1));
        setDropIdx(newDropIdx);
      }
    };

    const handleMouseUp = () => {
      // Clear the delay timer
      if (dragTimerRef.current) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
      }

      if (!dragActiveRef.current && pendingDragRef.current) {
        // Drag never activated - this was a click, toggle the card
        const clickIdx = pendingDragRef.current.idx;
        const card = (cardOrder.length > 0 ? cardOrder : gameState.hand)[clickIdx];
        if (card) {
          toggleCard(card);
        }
      } else if (dragIdx !== null && dropIdx !== null && dragIdx !== dropIdx) {
        const newOrder = [...cardOrder];
        const [moved] = newOrder.splice(dragIdx, 1);
        const insertAt = dropIdx > dragIdx ? dropIdx - 1 : dropIdx;
        newOrder.splice(insertAt, 0, moved);
        setCardOrder(newOrder);
        setHasManualOrder(true);
      }

      pendingDragRef.current = null;
      dragActiveRef.current = false;
      setDragIdx(null);
      setDragPos(null);
      setDropIdx(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragIdx, dropIdx, cardOrder, gameState.hand, toggleCard]);

  const [sortAnimating, setSortAnimating] = useState(false);

  const handleReorganize = () => {
    setSortAnimating(true);
    setTimeout(() => {
      setCardOrder(gameState.hand);
      setHasManualOrder(false);
      setTimeout(() => setSortAnimating(false), 300);
    }, 200);
  };

  // Resizable hand area: resize bar controls zoom level, not flex split
  const [handZoom, setHandZoom] = useState(1.0);
  const resizingRef = useRef(false);
  const resizeStartRef = useRef<{ y: number; zoom: number }>({ y: 0, zoom: 1.0 });
  const handAreaRef = useRef<HTMLDivElement>(null);

  const ZOOM_MIN = 0.7;
  const ZOOM_MAX = 1.4;

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = resizeStartRef.current.y - e.clientY;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, resizeStartRef.current.zoom + delta / window.innerHeight));
      setHandZoom(newZoom);
    };
    const handleResizeUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeUp);
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeUp);
    };
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    resizeStartRef.current = {
      y: e.clientY,
      zoom: handZoom,
    };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [handZoom]);

  const isMyTurn = gameState.currentTurnIdx === gameState.myIndex;
  const isLeader = gameState.currentLeaderIdx === gameState.myIndex;
  const myPlayer = gameState.players[gameState.myIndex];
  const myId = myPlayer?.id;

  // Determine who is currently winning the in-progress trick
  const activeTrick = completedTrick || gameState.currentTrick;
  const currentTrickWinnerPlayerIdx = useMemo(() => {
    if (!activeTrick || activeTrick.plays.length === 0) return null;
    const winnerPlayIdx = determineTrickWinner(activeTrick, gameState.trumpInfo, gameState.settings);
    return activeTrick.plays[winnerPlayIdx]?.playerIdx ?? null;
  }, [activeTrick, gameState.trumpInfo, gameState.settings]);

  // Determine which cards to display
  const displayCards = cardOrder.length > 0 ? cardOrder : gameState.hand;

  // Split cards into trump-rank/joker category vs normal during bidding phases
  const biddingPhases = [GamePhase.Drawing, GamePhase.KittyPickup, GamePhase.NoBidKittySelection];
  const showTrumpCategory = biddingPhases.includes(phase);

  const trumpCategoryCards = useMemo(() => {
    if (!showTrumpCategory) return [];
    const filtered = displayCards.filter(c =>
      c.kind === 'joker' ||
      (c.kind === 'suited' && c.rank === gameState.trumpInfo.trumpRank)
    );
    return filtered.sort((a, b) => getCardOrder(b, gameState.trumpInfo) - getCardOrder(a, gameState.trumpInfo));
  }, [displayCards, showTrumpCategory, gameState.trumpInfo.trumpRank]);

  const normalCards = useMemo(() => {
    if (!showTrumpCategory) return displayCards;
    return displayCards.filter(c =>
      c.kind !== 'joker' &&
      !(c.kind === 'suited' && c.rank === gameState.trumpInfo.trumpRank)
    );
  }, [displayCards, showTrumpCategory, gameState.trumpInfo.trumpRank]);

  // For drag: determine insertion gap position
  const getCardClass = (idx: number, isTrumpSection: boolean) => {
    if (dragIdx === null) return '';
    // Only show drag gap in the same section context (simplified: works on full displayCards)
    if (!isTrumpSection) {
      if (dropIdx !== null && idx === dropIdx && idx !== dragIdx) {
        return 'card-drag-over-left';
      }
    }
    return '';
  };

  const renderCardWrapper = (card: Card, idx: number, isTrumpSection: boolean, globalIdx: number) => {
    const cid = cardId(card);
    const isHovered = hoveredCardIdx === globalIdx;

    return (
      <div
        key={cid}
        ref={el => { cardWrappersRef.current[globalIdx] = el; }}
        className={`hand-card-wrapper ${newCardIds.has(cid) ? 'card-deal-in' : ''} ${isHovered && phase !== GamePhase.Drawing ? 'card-hovered' : ''}`}
        onMouseEnter={() => { if (phase !== GamePhase.Drawing) setHoveredCardIdx(globalIdx); }}
        onMouseLeave={() => setHoveredCardIdx(null)}
        onClick={() => { if (phase !== GamePhase.Drawing) toggleCard(card); }}
      >
        <CardComponent
          card={card}
          selected={selectedCards.some(c => cardId(c) === cid)}
          isTrump={
            card.kind === 'joker' ||
            (card.kind === 'suited' && card.rank === gameState.trumpInfo.trumpRank) ||
            (card.kind === 'suited' && card.suit === gameState.trumpInfo.trumpSuit)
          }
        />
      </div>
    );
  };

  // Floating drag card
  const dragCard = dragIdx !== null && dragPos ? displayCards[dragIdx] : null;

  return (
    <div className="game-table-container">
      {/* Mobile toggle buttons */}
      <button className="mobile-toggle mobile-toggle-left" onClick={() => { setShowLeftSidebar(v => !v); setShowRightSidebar(false); }} aria-label="Toggle info panel">
        {showLeftSidebar ? '\u2716' : '\u2630'}
      </button>
      <button className="mobile-toggle mobile-toggle-right" onClick={() => { setShowRightSidebar(v => !v); setShowLeftSidebar(false); }} aria-label="Toggle chat">
        {showRightSidebar ? '\u2716' : '\uD83D\uDCAC'}
      </button>
      {(showLeftSidebar || showRightSidebar) && (
        <div className="mobile-sidebar-backdrop" onClick={() => { setShowLeftSidebar(false); setShowRightSidebar(false); }} />
      )}

      {/* Score and info panel */}
      <div className={`table-sidebar ${showLeftSidebar ? 'sidebar-open' : ''}`}>
        {onLeave && (
          <button className="btn btn-secondary btn-leave-game" onClick={onLeave}>
            Leave Room
          </button>
        )}
        <TrumpIndicator trumpInfo={gameState.trumpInfo} />
        <ScoreBoard gameState={gameState} scoreAnimation={scoreAnimation} />
        {/* Dev mode player switcher */}
        {gameState.devMode && gameState.devPlayerIds && onDevSwitchPlayer && (
          <div className="dev-switcher">
            <div className="dev-switcher-title">Dev Mode</div>
            {gameState.devPlayerIds.map(p => (
              <button
                key={p.id}
                className={`btn btn-small dev-switcher-btn ${gameState.devPlayingAs === p.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onDevSwitchPlayer(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        {/* Spectator section */}
        {gameState.isSpectator && (
          <div className="spectator-banner">
            <div className="spectator-banner-title">Spectating</div>
            <div className="spectator-perspective-buttons">
              {gameState.players.map(p => (
                <button
                  key={p.id}
                  className={`btn btn-small ${gameState.spectatorOf === p.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onSpectateAs?.(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {(spectators?.length ?? 0) > 0 && (
          <div className="sidebar-spectators">
            <div className="sidebar-spectators-title">Spectators</div>
            {spectators!.map(s => (
              <div key={s.id} className="sidebar-spectator-name">{s.name}</div>
            ))}
          </div>
        )}
        {gameState.bids.length > 0 && (
          <div className="bid-info">
            <div className="bid-info-title">Current Bid</div>
            <div className="bid-info-cards">
              {gameState.bids[gameState.bids.length - 1].cards.map((c, i) => (
                <CardComponent key={i} card={c} small />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main table area */}
      <div className="table-area">
        <div className="felt-table" style={{ flex: '1' }}>
          <div className="felt-center-glow" />

          {/* My player info (bottom center, above hand) */}
          <div className={`my-player-info ${isMyTurn && phase === GamePhase.Playing ? 'my-turn-active' : ''}`}>
            <div className={`my-avatar ${myPlayer?.team === 'defending' ? 'team-defending' : 'team-attacking'}`}>
              {myPlayer?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="my-info-text">
              <div className="my-name">{myPlayer?.name}</div>
              <div className="my-meta">
                <span className="my-level">Lv {RANK_NAMES[myPlayer?.rank]}</span>
                <span className="my-cards">{gameState.hand.length} cards</span>
                {currentTrickWinnerPlayerIdx === gameState.myIndex && <span className="my-leader-badge">&#9733; Winning</span>}
              </div>
            </div>
          </div>

          {/* Player seats */}
          {orderedPlayers.map((op, seatIdx) => (
            <PlayerSeat
              key={op.player.id}
              player={op.player}
              position={seatPositions[seatIdx]}
              isCurrentTurn={op.originalIdx === gameState.currentTurnIdx}
              isLeader={currentTrickWinnerPlayerIdx !== null && op.originalIdx === currentTrickWinnerPlayerIdx}
              handSize={gameState.handSizes[op.player.id] || 0}
              isMe={seatIdx === 0}
              isConnected={!gameState.connectedPlayers || gameState.connectedPlayers.includes(op.player.id)}
            />
          ))}

          {/* Turn indicator for me on table */}
          {phase === GamePhase.Playing && isMyTurn && (
            <div className="table-turn-indicator turn-near-bottom">
              <div className="turn-arrow">&#9654;</div>
              <span className="turn-label">Your turn</span>
            </div>
          )}

          {/* Center trick area */}
          <TrickArea
            currentTrick={completedTrick || gameState.currentTrick}
            players={gameState.players}
            myIndex={gameState.myIndex}
            trumpInfo={gameState.trumpInfo}
            settings={gameState.settings}
          />

          {/* Trick winner indicator */}
          {completedTrick && trickWinnerIdx !== null && (
            <div className="trick-winner-overlay">
              <div className="trick-winner-badge">
                {gameState.players[trickWinnerIdx]?.name} wins!
                {completedTrick.points > 0 && (
                  <span className={`trick-winner-points ${gameState.players[trickWinnerIdx]?.team === 'defending' ? 'points-defended' : ''}`}>
                    {gameState.players[trickWinnerIdx]?.team === 'attacking'
                      ? `+${completedTrick.points} pts`
                      : `${completedTrick.points} pts defended`}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Phase-specific overlays */}
          {phase === GamePhase.Drawing && (
            <div className="table-status">
              <div className="status-badge drawing">
                Drawing Cards... ({gameState.drawPileSize} remaining)
              </div>
            </div>
          )}

          {showVoteOverlay && (
            <div className={`table-overlay ${voteOverlayFading ? 'overlay-fade-out' : ''}`}>
              <div className="no-bid-panel">
                <h2>No Bids Made</h2>
                <p className="no-bid-desc">
                  All players must vote to randomly select a kitty player.
                </p>
                <div className="vote-status">
                  {gameState.players.map(p => (
                    <div key={p.id} className={`vote-player ${gameState.noBidVotes.includes(p.id) ? 'voted' : ''}`}>
                      <span>{p.name}</span>
                      <span>{gameState.noBidVotes.includes(p.id) ? 'Voted' : 'Waiting...'}</span>
                    </div>
                  ))}
                </div>
                <button
                  className={`btn ${gameState.noBidVotes.includes(myId) ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={onVoteRandomKitty}
                >
                  {gameState.noBidVotes.includes(myId) ? 'Cancel Vote' : 'Vote for Random Selection'}
                </button>
                {gameState.noBidSelectionCard && (
                  <div className="random-card-reveal">
                    <div className="reveal-label">Selected Card</div>
                    <CardComponent card={gameState.noBidSelectionCard} />
                    <div className="reveal-result">
                      Player {gameState.players[gameState.currentLeaderIdx]?.name} gets the kitty!
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {phase === GamePhase.KittyPickup && isLeader && !gameState.kittyPickedUp && (
            <div className="table-status kitty-pickup-status">
              <div className="kitty-pickup-panel">
                <div className="status-badge kitty-ready">You have the kitty!</div>
                <button className="btn btn-primary" onClick={onPickupKitty}>
                  Pick Up Kitty ({gameState.kittySize} cards)
                </button>
              </div>
            </div>
          )}

          {phase === GamePhase.KittyPickup && !isLeader && (
            <div className="table-status">
              <div className="status-badge waiting">
                Waiting for {gameState.players[gameState.currentLeaderIdx]?.name} to pick up kitty...
              </div>
            </div>
          )}

          {phase === GamePhase.KittyExchange && !isLeader && (
            <div className="table-status">
              <div className="status-badge waiting">
                {gameState.players[gameState.currentLeaderIdx]?.name} is selecting kitty cards...
              </div>
            </div>
          )}

          {phase === GamePhase.ReadyToPlay && (
            <div className="table-overlay ready-overlay">
              <div className="ready-panel">
                <h2>Ready to Play?</h2>
                <div className="ready-status">
                  {gameState.players.map(p => (
                    <div key={p.id} className={`ready-player ${gameState.readyPlayers.includes(p.id) ? 'is-ready' : ''}`}>
                      <span className="ready-dot">{gameState.readyPlayers.includes(p.id) ? '\u2713' : '\u25CB'}</span>
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
                <button
                  className={`btn ${gameState.readyPlayers.includes(myId) ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={onConfirmReady}
                >
                  {gameState.readyPlayers.includes(myId) ? 'Cancel Ready' : 'Ready!'}
                </button>
              </div>
            </div>
          )}

          {phase === GamePhase.Scoring && (
            <div className="table-overlay">
              <div className="round-result">
                <h2>Round Complete</h2>
                <div className="result-scores">
                  <div className="result-row">
                    <span>Attacking Points</span>
                    <span className="result-value">{gameState.attackingPoints}</span>
                  </div>
                  <div className="result-row">
                    <span>Defending Points</span>
                    <span className="result-value">{gameState.defendingPoints}</span>
                  </div>
                </div>
                {gameState.kitty && (
                  <div className="kitty-reveal">
                    <div className="kitty-label">Kitty Cards</div>
                    <div className="kitty-cards-row">
                      {gameState.kitty.map((c, i) => (
                        <CardComponent key={i} card={c} small />
                      ))}
                    </div>
                  </div>
                )}
                <button className="btn btn-primary" onClick={onNextRound}>
                  Next Round
                </button>
              </div>
            </div>
          )}

          {phase === GamePhase.GameOver && (
            <div className="table-overlay">
              <div className="game-over">
                <h2>Game Over!</h2>
                <div className="winner-info">
                  {gameState.players.map(p => (
                    <div key={p.id} className="player-rank-final">
                      {p.name}: Level {RANK_NAMES[p.rank]}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Resize handle */}
        <div className="hand-resize-handle" onMouseDown={handleResizeStart}>
          <div className="hand-resize-line" />
        </div>

        {/* My hand */}
        <div className="my-hand-area" ref={handAreaRef}>
         <div className="hand-scale-wrapper" style={{ zoom: handZoom }}>
          {phase === GamePhase.FriendDeclaration && isLeader ? (
            <FriendDeclarationUI
              settings={gameState.settings}
              trumpInfo={gameState.trumpInfo}
              onDeclare={onDeclareFriends}
              hand={gameState.hand}
            />
          ) : (
            <>
              {phase === GamePhase.KittyExchange && isLeader && (
                <div className="kitty-discard-header">
                  <span className="kitty-discard-title">Select {gameState.kittySize} cards to discard to kitty</span>
                  <span className="kitty-discard-count">{selectedCards.length}/{gameState.kittySize}</span>
                </div>
              )}
              {showTrumpCategory && trumpCategoryCards.length > 0 && (
                <div className="trump-category-section">
                  <div className="trump-category-label">Trump Rank / Jokers</div>
                  <div className="trump-category-cards">
                    {trumpCategoryCards.map((card, idx) => {
                      const cid = cardId(card);
                      const globalIdx = displayCards.findIndex(c => cardId(c) === cid);
                      return (
                        <div
                          key={cid}
                          ref={el => { cardWrappersRef.current[globalIdx] = el; }}
                          className={`hand-card-wrapper ${newCardIds.has(cid) ? 'card-deal-in' : ''}`}
                        >
                          <CardComponent
                            card={card}
                            selected={selectedCards.some(c => cardId(c) === cid)}
                            onClick={() => toggleCard(card)}
                            isTrump
                          />
                        </div>
                      );
                    })}
                  </div>
                  {gameState.canBid && (
                    <button
                      className="btn btn-gold btn-bid-trump"
                      onClick={handleBid}
                      disabled={selectedCards.length === 0 || !selectedCards.some(c =>
                        c.kind === 'joker' || (c.kind === 'suited' && c.rank === gameState.trumpInfo.trumpRank)
                      )}
                    >
                      Bid Trump
                    </button>
                  )}
                </div>
              )}
              <div className="hand-cards-area">
                {exitingCards.length > 0 && (
                  <div className="hand-exit-overlay">
                    {exitingCards.map(({ card, id, left }) => (
                      <div
                        key={`exit-${id}`}
                        className="hand-card-wrapper card-play-out"
                        style={left >= 0 ? { position: 'absolute', left: `${left}px` } : undefined}
                      >
                        <CardComponent card={card} />
                      </div>
                    ))}
                  </div>
                )}
                <div className={`hand-cards ${sortAnimating ? 'sort-animating' : ''}`} ref={handCardsRef}>
                  {(showTrumpCategory ? normalCards : displayCards).map((card, idx) => {
                    const globalIdx = showTrumpCategory
                      ? displayCards.findIndex(c => cardId(c) === cardId(card))
                      : idx;
                    return renderCardWrapper(card, idx, false, globalIdx);
                  })}
                </div>
              </div>
              {phase === GamePhase.KittyExchange && isLeader ? (
                <div className="action-bar">
                  <button className="btn btn-secondary" onClick={() => setSelectedCards([])} disabled={selectedCards.length === 0}>
                    Deselect
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => { onExchangeKitty(selectedCards); setSelectedCards([]); }}
                    disabled={selectedCards.length !== gameState.kittySize}
                  >
                    Confirm Kitty ({selectedCards.length}/{gameState.kittySize})
                  </button>
                </div>
              ) : (
                <ActionBar
                  phase={phase}
                  isMyTurn={isMyTurn}
                  isLeader={isLeader}
                  selectedCount={selectedCards.length}
                  canBid={showTrumpCategory ? false : gameState.canBid}
                  kittyPickedUp={gameState.kittyPickedUp}
                  onPlay={handlePlay}
                  onBid={handleBid}
                  onClear={() => setSelectedCards([])}
                  showReorganize={false}
                />
              )}
            </>
          )}
         </div>
        </div>
      </div>

      {/* Chat sidebar */}
      <div className={`chat-sidebar ${showRightSidebar ? 'sidebar-open' : ''}`}>
        <ChatPanel messages={chatMessages} onSend={onSendChat} compact />
      </div>

      {/* Floating drag card */}
      {dragCard && dragPos && (
        <div
          className="floating-drag-card"
          style={{
            left: dragPos.x,
            top: dragPos.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <CardComponent card={dragCard} />
        </div>
      )}

      {/* Connection warning */}
      {!isConnected && (
        <div className="error-toast connection-warning">
          Reconnecting to server...
        </div>
      )}

      {/* Error toast */}
      {error && error !== dismissedError && (
        <div className="error-toast">
          {error}
          <button className="error-toast-close" onClick={() => setDismissedError(error)}>&times;</button>
        </div>
      )}
    </div>
  );
};

export default GameTable;
