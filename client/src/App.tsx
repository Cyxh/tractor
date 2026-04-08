import React, { useState, useEffect, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useGame } from './hooks/useGame';
import { useSound } from './hooks/useSound';
import LobbyScreen from './components/Lobby/LobbyScreen';
import RoomLobby from './components/Lobby/RoomLobby';
import GameTable from './components/Table/GameTable';
import './App.css';

const SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'] as const;
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
const FACE_SYM: Record<string, string> = { J: '\u265E', Q: '\u2655', K: '\u2654' };
const PIP_POS: Record<string, [number,number][]> = {
  'A': [[50,50]],
  '2': [[50,25],[50,75]],
  '3': [[50,20],[50,50],[50,80]],
  '4': [[30,25],[70,25],[30,75],[70,75]],
  '5': [[30,25],[70,25],[50,50],[30,75],[70,75]],
  '6': [[30,20],[70,20],[30,50],[70,50],[30,80],[70,80]],
  '7': [[30,20],[70,20],[50,35],[30,50],[70,50],[30,80],[70,80]],
  '8': [[30,20],[70,20],[50,35],[30,50],[70,50],[50,65],[30,80],[70,80]],
  '9': [[30,18],[70,18],[30,39],[70,39],[50,50],[30,61],[70,61],[30,82],[70,82]],
  '10':[[30,18],[70,18],[50,29],[30,39],[70,39],[30,61],[70,61],[50,71],[30,82],[70,82]],
};

type SpinnerCard = { rank: string; suit: string; isRed: boolean; isJoker: boolean; isBig: boolean; isTrump: boolean };

function randomCard(prev?: SpinnerCard): SpinnerCard {
  let card: SpinnerCard;
  do {
    // Draw from a 54-card deck: 52 suited + 1 small joker + 1 big joker
    const draw = Math.floor(Math.random() * 54);
    if (draw === 52) {
      card = { rank: '', suit: '', isRed: false, isJoker: true, isBig: false, isTrump: false };
    } else if (draw === 53) {
      card = { rank: '', suit: '', isRed: true, isJoker: true, isBig: true, isTrump: false };
    } else {
      const si = draw % 4;
      const ri = Math.floor(draw / 4);
      const trump = Math.random() < 0.10;
      card = { rank: RANKS[ri], suit: SUITS[si], isRed: si === 1 || si === 2, isJoker: false, isBig: false, isTrump: trump };
    }
  } while (prev && card.rank === prev.rank && card.suit === prev.suit && card.isJoker === prev.isJoker && card.isBig === prev.isBig);
  return card;
}

const ConnectingSpinner: React.FC = () => {
  const [cards, setCards] = useState(() => [randomCard(), randomCard()]);
  const [rotation, setRotation] = useState(0);

  // The currently visible face is determined by rotation: even multiples of 180 = slot 0, odd = slot 1
  const visibleSlot = (rotation / 180) % 2 === 0 ? 0 : 1;

  useEffect(() => {
    const interval = setInterval(() => {
      // Replace the hidden card (ensuring no repeat of current visible card), then flip
      setCards(prev => {
        const next = [...prev];
        next[1 - visibleSlot] = randomCard(prev[visibleSlot]);
        return next;
      });
      setRotation(r => r + 180);
    }, 1600);
    return () => clearInterval(interval);
  }, [visibleSlot]);

  const renderCardFace = (c: ReturnType<typeof randomCard>) => {
    if (c.isJoker) {
      return (
        <div className={`cs-card-inner cs-joker ${c.isBig ? 'cs-joker-big' : 'cs-joker-little'}`}>
          <span className="cs-joker-star">{c.isBig ? '\u2605' : '\u2606'}</span>
        </div>
      );
    }
    const colorCls = c.isRed ? 'cs-red' : 'cs-black';
    const isFace = c.rank === 'J' || c.rank === 'Q' || c.rank === 'K';
    const isAce = c.rank === 'A';
    return (
      <div className={`cs-card-inner cs-face ${colorCls} ${c.isTrump ? 'cs-trump' : ''}`}>
        <div className="cs-corner cs-corner-tl">
          <span className="cs-corner-rank">{c.rank}</span>
          <span className="cs-corner-suit">{c.suit}</span>
        </div>
        <div className="cs-corner cs-corner-br">
          <span className="cs-corner-rank">{c.rank}</span>
          <span className="cs-corner-suit">{c.suit}</span>
        </div>
        <div className="cs-center">
          {isAce && <span className="cs-ace-pip">{c.suit}</span>}
          {isFace && (
            <div className="cs-face-group">
              <span className="cs-face-sym">{FACE_SYM[c.rank]}</span>
              <span className="cs-face-suit">{c.suit}</span>
            </div>
          )}
          {!isAce && !isFace && PIP_POS[c.rank] && (
            <div className="cs-pips">
              {PIP_POS[c.rank].map(([x, y], i) => (
                <span key={i} className={`cs-pip ${y > 50 ? 'cs-pip-inv' : ''}`}
                  style={{ left: `${x}%`, top: `${y}%` }}>{c.suit}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="connecting-spinner">
      <div className="cs-flipper" style={{ transform: `rotateY(${rotation}deg)` }}>
        <div className="cs-side cs-front">{renderCardFace(cards[0])}</div>
        <div className="cs-side cs-back-side">{renderCardFace(cards[1])}</div>
      </div>
    </div>
  );
};

type Screen = 'connecting' | 'lobby' | 'room' | 'game';

function getTargetScreen(connected: boolean, gameState: any, roomId: string | null, roomInfo: any, playerId: string | null): Screen {
  if (!connected) return 'connecting';
  if (gameState) return 'game';
  if (roomId && roomInfo && playerId) return 'room';
  return 'lobby';
}

const App: React.FC = () => {
  const ws = useWebSocket();
  const game = useGame(ws);
  useSound(ws, false);

  const target = getTargetScreen(ws.stableConnected, game.gameState, game.roomId, game.roomInfo, game.playerId);

  // Track previous screen for transition direction
  const [displayedScreen, setDisplayedScreen] = useState<Screen>(target);
  const [transitionPhase, setTransitionPhase] = useState<'out' | 'in' | null>(null);
  const prevTargetRef = React.useRef(target);
  // Snapshot room data so we can still render room lobby during exit animation
  const roomSnapshot = React.useRef<{ roomId: string; playerId: string; roomInfo: any; chatMessages: any } | null>(null);

  // Keep a ref of the last valid room data (captured before state clears)
  const lastRoomData = React.useRef<{ roomId: string; playerId: string; roomInfo: any; chatMessages: any } | null>(null);
  if (game.roomId && game.playerId && game.roomInfo) {
    lastRoomData.current = {
      roomId: game.roomId,
      playerId: game.playerId,
      roomInfo: game.roomInfo,
      chatMessages: game.chatMessages,
    };
  }

  useEffect(() => {
    if (target === prevTargetRef.current) return;
    const prev = prevTargetRef.current;
    prevTargetRef.current = target;

    // Animate transitions between screens
    const shouldAnimate =
      (prev === 'lobby' && target === 'room') ||
      (prev === 'room' && target === 'lobby') ||
      (prev === 'room' && target === 'game') ||
      (prev === 'connecting' && target === 'lobby');

    if (shouldAnimate) {
      // Use the last valid room data for the exit animation
      if (prev === 'room' && lastRoomData.current) {
        roomSnapshot.current = { ...lastRoomData.current };
      }
      setTransitionPhase('out');
      const exitTimer = setTimeout(() => {
        setDisplayedScreen(target);
        roomSnapshot.current = null;
        setTransitionPhase('in');
        const enterTimer = setTimeout(() => {
          setTransitionPhase(null);
        }, 500);
        return () => clearTimeout(enterTimer);
      }, 400);
      return () => clearTimeout(exitTimer);
    } else {
      setDisplayedScreen(target);
    }
  }, [target]);

  const transitionClass = transitionPhase === 'out'
    ? 'screen-exit'
    : transitionPhase === 'in'
    ? 'screen-enter'
    : '';

  const showFooter = displayedScreen !== 'game';

  const footer = showFooter ? (
    <div className="site-footer">
      <span className="site-footer-left">
        If you liked this, consider buying Revin a boba — <a href="https://account.venmo.com/u/revinjun" target="_blank" rel="noopener noreferrer">@revinjun</a> on Venmo
      </span>
      <span className="site-footer-right">Beta Version 1.2.8</span>
    </div>
  ) : null;

  if (displayedScreen === 'connecting') {
    return (
      <>
        <div className={`screen-transition ${transitionClass}`}>
          <div className="connecting-screen">
            <ConnectingSpinner />
            <p>Connecting to server...</p>
          </div>
        </div>
        {footer}
      </>
    );
  }

  if (displayedScreen === 'game' && game.gameState) {
    return (
      <div className={`screen-transition ${transitionClass}`}>
      <GameTable
        gameState={game.gameState}
        playerId={game.playerId}
        onPlayCards={game.playCards}
        onBid={game.bid}
        onExchangeKitty={game.exchangeKitty}
        onDeclareFriends={game.declareFriends}
        onNextRound={game.nextRound}
        onVoteRandomKitty={game.voteRandomKitty}
        onPickupKitty={game.pickupKitty}
        onConfirmReady={game.confirmReady}
        onSendChat={game.sendChat}
        chatMessages={game.chatMessages}
        error={game.error}
        spectators={game.spectators}
        onSpectateAs={game.spectateAs}
        onDevSwitchPlayer={game.devSwitchPlayer}
        onLeave={game.leaveRoom}
        isConnected={ws.connected}
      />
      </div>
    );
  }

  if (displayedScreen === 'room') {
    // Use live data if available, otherwise use snapshot during exit animation
    const roomId = game.roomId || roomSnapshot.current?.roomId;
    const playerId = game.playerId || roomSnapshot.current?.playerId;
    const roomInfo = game.roomInfo || roomSnapshot.current?.roomInfo;
    const chatMsgs = game.chatMessages.length > 0 ? game.chatMessages : (roomSnapshot.current?.chatMessages || []);

    if (roomId && playerId && roomInfo) {
      return (
        <>
          <div className={`screen-transition ${transitionClass}`}>
            <RoomLobby
              roomId={roomId}
              playerId={playerId}
              roomInfo={roomInfo}
              onUpdateSettings={game.updateSettings}
              onStartGame={game.startGame}
              onSwapPosition={game.swapPosition}
              onSendChat={game.sendChat}
              chatMessages={chatMsgs}
              onLeave={game.leaveRoom}
              onLockRoom={game.lockRoom}
              onToggleDevMode={game.toggleDevMode}
              showDevModeToggle={game.authUser?.username === 'cyxh'}
            />
          </div>
          {footer}
        </>
      );
    }
    // Room data cleared but displayedScreen hasn't updated yet — render nothing
    // to avoid a one-frame flash of the lobby at full opacity
    return null;
  }

  return (
    <>
    <div className={`screen-transition ${transitionClass}`}>
      <LobbyScreen
        roomList={game.roomList}
        onCreateRoom={game.createRoom}
        onJoinRoom={game.joinRoom}
        authUser={game.authUser}
        onLogin={game.authLogin}
        onRegister={game.authRegister}
        onLogout={game.authLogout}
        onChangeUsername={game.changeUsername}
        onChangePassword={game.changePassword}
        onGetAccountEmail={game.getAccountEmail}
        onRequestEmailVerification={game.requestEmailVerification}
        onVerifyEmail={game.verifyEmail}
        onUnlinkEmail={game.unlinkEmail}
        onGetStats={game.fetchStats}
        onRequestPasswordReset={game.requestPasswordReset}
        onResetPassword={game.resetPassword}
      />
    </div>
    {footer}
    </>
  );
};

export default App;
