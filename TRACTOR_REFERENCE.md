# Tractor Website — Claude Reference File

> **Purpose:** This file gives Claude all the context needed to make edits without re-reading every file. **Update this file whenever any edit is made to the website.**

---

## Project Overview

**Tractor** is a full-stack multiplayer web implementation of the Chinese card game "Sheng Ji" (Tractor / Finding Friends). Supports 2–6 players in real-time via WebSocket.

---

## Tech Stack

| Layer    | Tech                          | Notes                          |
|----------|-------------------------------|--------------------------------|
| Frontend | React 18.2, TypeScript 5.4    | SPA, no router library         |
| Build    | Vite 5.1                      | Port 8080, proxies to server   |
| Backend  | Express 4.18, ws 8.16         | Port 8081                      |
| Styling  | Vanilla CSS + CSS variables   | No framework                   |
| Fonts    | Inter (Google Fonts)          | Weights 400–700                |
| Monorepo | npm workspaces                | `shared`, `server`, `client`   |

---

## Directory Structure

```
tractor/
├── client/src/
│   ├── main.tsx                    # React entry point
│   ├── App.tsx                     # Root component, routing logic (connected → lobby → room → game)
│   ├── App.css
│   ├── components/
│   │   ├── Lobby/
│   │   │   ├── LobbyScreen.tsx     # Name input, create/join room, room list
│   │   │   ├── RoomLobby.tsx       # Pre-game room: player list, settings, chat, start button
│   │   │   ├── SettingsPanel.tsx   # 30+ game rule settings (host-only editable)
│   │   │   └── *.css
│   │   ├── Table/
│   │   │   ├── GameTable.tsx       # Main game board container
│   │   │   ├── Card.tsx            # Card rendering (pips, face symbols, jokers)
│   │   │   ├── PlayerSeat.tsx      # Opponent display around table
│   │   │   ├── TrickArea.tsx       # Current trick cards display
│   │   │   ├── ActionBar.tsx       # Bid/Play/Clear/Skip buttons
│   │   │   ├── ScoreBoard.tsx      # Points, levels, friend declarations
│   │   │   ├── TrumpIndicator.tsx  # Trump rank/suit display
│   │   │   ├── KittyExchange.tsx   # Leader kitty card swap UI
│   │   │   ├── FriendDeclarationUI.tsx  # Finding Friends mode friend selection
│   │   │   └── *.css
│   │   └── Chat/
│   │       └── ChatPanel.tsx       # Chat messages, input, timestamps
│   ├── hooks/
│   │   ├── useWebSocket.ts         # WS connection, auto-reconnect (2s), message registry
│   │   ├── useGame.ts              # All game state + action functions, localStorage session (2hr expiry)
│   │   └── useSound.ts             # Web Audio API procedural sound effects
│   ├── styles/
│   │   └── global.css              # CSS variables, responsive scaling, layout
│   ├── index.html                  # Loads Inter font, single root div
│   ├── vite.config.ts              # Port 3000, proxy /api & /ws to :3001
│   └── tsconfig.json
│
├── server/src/
│   ├── index.ts                    # Express + WebSocket server setup
│   ├── room.ts                     # RoomManager, Room class, player/spectator management
│   ├── game.ts                     # Game engine (~651 lines), all game phases
│   ├── accounts.ts                 # Account system: register/login/token, JSON persistence
│   └── tsconfig.json
│
├── data/
│   └── accounts.json               # Persistent account storage (auto-created)
│
├── shared/src/
│   ├── index.ts                    # Re-exports
│   ├── types.ts                    # All TypeScript interfaces (GameState, Card, etc.)
│   ├── constants.ts                # Point values, rank/suit names, scoring thresholds
│   ├── card.ts                     # Card utilities (sort, order, effective suit)
│   ├── deck.ts                     # Deck creation, shuffling, dealing
│   ├── tractor.ts                  # Tractor detection & trick component logic
│   ├── trick.ts                    # Play validation, trick winner determination
│   ├── scoring.ts                  # Round results & rank advancement
│   └── tsconfig.json
│
├── package.json                    # Monorepo root with workspace scripts
└── tsconfig.base.json              # ES2020, strict mode
```

---

## NPM Scripts

```bash
# Root
npm run dev          # concurrently runs server + client
npm run dev:server   # server only (tsx watch)
npm run dev:client   # client only (vite)
npm run build        # builds shared → server → client

# Client: dev, build, preview
# Server: dev, build, start
# Shared: build, watch
```

---

## App Flow / Routing

No router library — state-driven rendering in `App.tsx`:

```
Connecting spinner (ws not connected)
  → LobbyScreen (no roomId)
    → RoomLobby (roomId, no gameState)
      → GameTable (gameState exists)
        → Phases: Drawing → KittyPickup → KittyExchange → FriendDeclaration → ReadyToPlay → Playing → Scoring
          → Next Round (loops back to Drawing)
          → GameOver
```

Back navigation: Leave button → clears session, reloads page.

---

## Styling / Theme

**CSS Variables** (in `client/src/styles/global.css`):

| Variable        | Value       | Usage                  |
|-----------------|-------------|------------------------|
| `--bg-dark`     | `#1a1a2e`   | Page background        |
| `--bg-card`     | `#1e2a4a`   | Panel backgrounds      |
| `--accent`      | `#e94560`   | Red accent             |
| `--gold`        | `#f0c040`   | Buttons, highlights    |
| `--green-felt`  | `#1a5c3a`   | Card table surface     |
| `--red-suit`    | `#e53e3e`   | Hearts/diamonds        |
| `--card-bg`     | `#faf8f0`   | Card face background   |

**Responsive scaling:** `--scale: clamp(0.7, ..., 1.3)`, `--card-w: clamp(56px, 5vw, 90px)`

**Layout:** CSS Grid for table, Flexbox for components, absolute positioning for seat arrangement.

---

## WebSocket Protocol

### Client → Server Messages
| Message             | Payload                              |
|---------------------|--------------------------------------|
| `create_room`       | `{ playerName }`                     |
| `join_room`         | `{ roomId, playerName }`             |
| `rejoin_room`       | `{ roomId, playerName }`             |
| `update_settings`   | `{ settings: Partial<GameSettings> }`|
| `swap_position`     | `{ targetPlayerId }`                 |
| `ready`             | `{}`                                 |
| `start_game`        | `{}`                                 |
| `bid`               | `{ cards: Card[] }`                  |
| `skip_bid`          | `{}`                                 |
| `vote_random_kitty` | `{}`                                 |
| `pickup_kitty`      | `{}`                                 |
| `exchange_kitty`    | `{ kitty: Card[] }`                  |
| `declare_friends`   | `{ declarations: FriendDeclaration[] }` |
| `confirm_ready`     | `{}`                                 |
| `play_cards`        | `{ cards: Card[] }`                  |
| `takeback`          | `{}`                                 |
| `next_round`        | `{}`                                 |
| `chat`              | `{ message: string }`               |

### Server → Client Messages
| Message             | Payload                              |
|---------------------|--------------------------------------|
| `room_created`      | `{ roomId }`                         |
| `room_joined`       | `{ roomId, playerId }`               |
| `game_state`        | `PlayerView`                         |
| `card_drawn`        | `{ playerIdx, card }`                |
| `bid_made`          | `{ playerIdx, cards }`               |
| `trick_completed`   | `{ trick, winnerIdx }`               |
| `round_result`      | `RoundResult`                        |
| `chat`              | `ChatMessage`                        |
| `error`             | `{ message }`                        |
| `room_update`       | `{ players, settings, hostId, chatMessages }` |
| `room_list`         | `RoomListItem[]`                     |
| `sound`             | `{ sound }`                          |

---

## REST Endpoints

| Method | Path         | Description           |
|--------|--------------|-----------------------|
| GET    | `/api/rooms` | List all active rooms |

---

## Game Modes

1. **Tractor (Fixed Teams)** — 2 or 4 player teams, defending vs attacking
2. **Finding Friends** — Landlord calls friend cards, teams revealed during play

---

## Game Settings (30+ options in SettingsPanel)

Key settings: number of players (2–6), number of decks, joker inclusion, bid policy, landlord selection, kitty theft policy, card protection, throw evaluation, friend selection restrictions, advancement policy, bomb policy, max rank (Ace or No-Trump).

---

## Card Rendering (Card.tsx)

- Number cards: 10-pip system (2–10)
- Face cards: Unicode chess symbols (♞ ♕ ♔)
- Jokers: Star symbols
- Suits: Unicode ♠ ♥ ♦ ♣
- Visual effects: selected glow, trump highlight, point card indicator

---

## State Management

- **Client:** `useGame` hook holds all state (playerId, roomId, gameState, roomInfo, roomList). Session persisted in localStorage with 2hr expiry.
- **Server:** `RoomManager` (map of rooms), `Room` (players + game + settings + chat), `Game` (authoritative game state + phase logic).
- No external state library (Redux, Zustand, etc.) — just React hooks.

---

## Key Technical Details

- Server is authoritative for all game logic
- Cards sorted/ordered via `card.ts` utilities
- Tractor detection in `tractor.ts` (consecutive pairs/triples of same suit)
- Play validation in `trick.ts` (must follow suit, match format)
- Scoring in `scoring.ts` (5s=5pts, 10s/Kings=10pts)
- Disconnect/reconnect handled via `rejoin_room` message
- Sound: procedural tones via Web Audio API (no audio files)
- No static images — all card graphics rendered in React/CSS

---

## Changelog

_Record all edits below so future sessions know what changed._

| Date       | What Changed                          | Files Modified                |
|------------|---------------------------------------|-------------------------------|
| 2026-04-06 | Initial reference file created        | TRACTOR_REFERENCE.md (this)   |
| 2026-04-06 | Hover spacing: only expand right, not left | GameTable.css |
| 2026-04-06 | Fix selected card top-edge clipping (overflow visible, more padding) | GameTable.css |
| 2026-04-06 | Trick area cards positioned near player names, scales with viewport | TrickArea.css |
| 2026-04-06 | Sound disabled (implementation kept) | App.tsx |
| 2026-04-06 | Cards dealt in sorted order during Drawing phase | GameTable.tsx |
| 2026-04-06 | Added "Sort" reorganize button in ActionBar | GameTable.tsx, ActionBar.tsx |
| 2026-04-06 | Bid area cards now render full pip/face design at small size | Card.tsx, Card.css |
| 2026-04-06 | Dark box background added to all opponent player seats | PlayerSeat.css |
| 2026-04-06 | Chat sidebar fills vertical space (removed max-height cap) | ChatPanel.css |
| 2026-04-06 | Custom drag: card follows cursor, insertion gap shown | GameTable.tsx, GameTable.css |
| 2026-04-06 | Trump/point card aura animations (glow pulse) | Card.css |
| 2026-04-06 | Trump rank cards & jokers in separate category during bidding; bid button there only | GameTable.tsx, GameTable.css |
| 2026-04-06 | Kitty exchange reworked: inline discard from normal hand instead of separate view | GameTable.tsx, GameTable.css |
| 2026-04-06 | Turn indicator shown on felt table near current player during Playing phase | GameTable.tsx, GameTable.css |
| 2026-04-06 | Trump/joker bidding cards sorted by card order | GameTable.tsx |
| 2026-04-06 | Hand order preserved when bid changes trump (no re-sort on same cards) | GameTable.tsx |
| 2026-04-06 | Turn indicator moved below opponent seat boxes; "Your turn" badge for self on felt | PlayerSeat.tsx, PlayerSeat.css, GameTable.tsx, GameTable.css |
| 2026-04-06 | Jokers redesigned: dark gradient bg, large glowing symbol, crown, shimmer animation | Card.tsx, Card.css |
| 2026-04-06 | Jokers: no gold trump aura, full-card dark bg; little joker white/silver instead of blue | Card.tsx, Card.css |
| 2026-04-06 | Big joker now same design as little joker but red; same symbols, same dark bg | Card.tsx, Card.css |
| 2026-04-06 | Jokers: big=★ solid red star, little=☆ outlined white star, same size/animations; ace pip vertical centering fix | Card.tsx, Card.css |
| 2026-04-06 | Chat input/send button scaling fix (min-width:0, overflow hidden, flex-shrink) | ChatPanel.css, GameTable.css |
| 2026-04-06 | Trick completion delay: 2s pause showing cards + winner badge + points; score pop animation with floating +delta | GameTable.tsx, GameTable.css, ScoreBoard.tsx, ScoreBoard.css |
| 2026-04-06 | Format obligations enforced when following (must play pairs before singles, tractors before pairs, etc.) | trick.ts |
| 2026-04-06 | Scoring thresholds fixed: 0/5/40/80/120/160/200 for 2 decks (base=numDecks*20, multipliers 1-5) | constants.ts |
| 2026-04-06 | Removed player names from trick area cards | TrickArea.tsx, TrickArea.css |
| 2026-04-06 | Fix: prevHandRef updated before return so deal-in animation doesn't replay on unrelated state updates | GameTable.tsx |
| 2026-04-07 | Skip +points animation when defending team wins trick (only show winner name) | GameTable.tsx |
| 2026-04-07 | Fix first trick missing winner indicator (prevTricksLenRef init -1 for first-render detection) | GameTable.tsx |
| 2026-04-07 | Resizable hand area via draggable gold line between felt table and hand | GameTable.tsx, GameTable.css |
| 2026-04-07 | Fix throw penalties for attacking team (subtract from attackingPoints) | game.ts |
| 2026-04-07 | Trick cards grouped by component with overlap (pairs, tractors overlap within group) | TrickArea.tsx, TrickArea.css |
| 2026-04-07 | Lead play description text box in center ("Tractor + Pair + Single" etc.) | TrickArea.tsx, TrickArea.css |
| 2026-04-07 | Vertical stacking of trick components when play has >6 cards | TrickArea.tsx, TrickArea.css |
| 2026-04-07 | More vertical padding on trump rank/jokers section | GameTable.css |
| 2026-04-07 | Fixed hand area min-height so it doesn't grow when first card is dealt | GameTable.css |
| 2026-04-07 | Smooth slide-in animation when trump/joker section first appears | GameTable.css |
| 2026-04-07 | Trump rank/jokers section centered horizontally | GameTable.css |
| 2026-04-07 | Account system: register/login/guest, JSON-persisted, auto-rejoin on login | accounts.ts, index.ts, LobbyScreen.tsx, useGame.ts, App.tsx, types.ts |
| 2026-04-07 | Dynamic player count: removed fixed numPlayers cap, host can lock room | room.ts, index.ts, RoomLobby.tsx, useGame.ts |
| 2026-04-07 | Spectator system: mid-game joiners become spectators, can watch from any perspective, chat | room.ts, index.ts, GameTable.tsx, GameTable.css, useGame.ts, App.tsx, types.ts |
| 2026-04-07 | Resize bar now scales cards via CSS transform on hand content wrapper | GameTable.tsx, GameTable.css |
| 2026-04-07 | Account settings: change username/password when logged in (gear icon in lobby) | accounts.ts, index.ts, useGame.ts, LobbyScreen.tsx, LobbyScreen.css, App.tsx |
| 2026-04-07 | Lobby visual effects: floating cards (full replica of in-game cards), sparkles, title shimmer, glow border, entrance animations, card-flip connecting spinner | LobbyScreen.tsx, LobbyScreen.css, App.css |
| 2026-04-07 | Screen transitions: fade+scale between connecting/lobby/room screens; room exit snapshots via lastRoomData ref | App.tsx, App.css |
| 2026-04-07 | Room list animations: slide-in for new rooms, slide-out for deleted rooms; server room cleanup on leave/disconnect | LobbyScreen.tsx, LobbyScreen.css, index.ts, useGame.ts |
| 2026-04-07 | Panel transition system: unified animated switching between auth-select/login/register/guest-lobby/settings panels; "Back to Login" button for guests | LobbyScreen.tsx, LobbyScreen.css |
