import React from 'react';
import { GameSettings, Rank } from 'tractor-shared';
import { RANK_NAMES } from 'tractor-shared';
import './SettingsPanel.css';

interface SettingsPanelProps {
  settings: GameSettings;
  onUpdate: (settings: Partial<GameSettings>) => void;
  disabled: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onUpdate, disabled }) => {
  const set = (key: keyof GameSettings, value: any) => {
    if (!disabled) onUpdate({ [key]: value });
  };

  return (
    <div className="settings-panel">
      <h3>Game Settings</h3>

      <div className="settings-group">
        <div className="settings-group-title">General</div>

        <div className="setting-row">
          <label>Game Mode</label>
          <select value={settings.gameMode} onChange={e => set('gameMode', e.target.value)} disabled={disabled}>
            <option value="tractor">Tractor (Fixed Teams)</option>
            <option value="findingFriends">Finding Friends</option>
          </select>
        </div>

        <div className="setting-row">
          <label>Number of Decks</label>
          <select value={settings.numDecks} onChange={e => set('numDecks', Number(e.target.value))} disabled={disabled}>
            {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="setting-row">
          <label>Kitty Size</label>
          <input type="number" min={1} max={20} value={settings.kittySize}
            onChange={e => set('kittySize', Number(e.target.value))} disabled={disabled} />
        </div>

        <div className="setting-row">
          <label>Max Rank</label>
          <select value={settings.maxRank} onChange={e => set('maxRank', e.target.value)} disabled={disabled}>
            <option value="A">Ace</option>
            <option value="NT">No Trump (Beyond Ace)</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Deck</div>

        <div className="setting-row checkbox">
          <label>Include Big Joker</label>
          <input type="checkbox" checked={settings.includeBigJoker}
            onChange={e => set('includeBigJoker', e.target.checked)} disabled={disabled} />
        </div>

        <div className="setting-row checkbox">
          <label>Include Little Joker</label>
          <input type="checkbox" checked={settings.includeLittleJoker}
            onChange={e => set('includeLittleJoker', e.target.checked)} disabled={disabled} />
        </div>

        <div className="setting-row">
          <label>Minimum Card</label>
          <select value={settings.minimumCard} onChange={e => set('minimumCard', Number(e.target.value))} disabled={disabled}>
            {[Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six, Rank.Seven, Rank.Eight].map(r => (
              <option key={r} value={r}>{RANK_NAMES[r]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Bidding</div>

        <div className="setting-row">
          <label>Bid Policy</label>
          <select value={settings.bidPolicy} onChange={e => set('bidPolicy', e.target.value)} disabled={disabled}>
            <option value="jokerOrHigherSuit">Joker or Higher Suit</option>
            <option value="jokerOrGreaterLength">Joker or Greater Length</option>
            <option value="greaterLength">Greater Length Only</option>
          </select>
        </div>

        <div className="setting-row">
          <label>Bid Reinforcement</label>
          <select value={settings.bidReinforcementPolicy} onChange={e => set('bidReinforcementPolicy', e.target.value)} disabled={disabled}>
            <option value="reinforceWhileWinning">Reinforce While Winning</option>
            <option value="reinforceWhileEquivalent">Reinforce While Equivalent</option>
            <option value="overturnOrReinforce">Overturn or Reinforce</option>
          </select>
        </div>

        <div className="setting-row">
          <label>Joker Bid Policy</label>
          <select value={settings.jokerBidPolicy} onChange={e => set('jokerBidPolicy', e.target.value)} disabled={disabled}>
            <option value="bothTwoOrMore">Both (2+)</option>
            <option value="bothNumDecks">Both (Num Decks)</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        <div className="setting-row">
          <label>Landlord Selection</label>
          <select value={settings.landlordSelectionPolicy} onChange={e => set('landlordSelectionPolicy', e.target.value)} disabled={disabled}>
            <option value="byWinningBid">By Winning Bid</option>
            <option value="byFirstBid">By First Bid</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Kitty</div>

        <div className="setting-row">
          <label>Kitty Theft</label>
          <select value={settings.kittyTheftPolicy} onChange={e => set('kittyTheftPolicy', e.target.value)} disabled={disabled}>
            <option value="allow">Allow</option>
            <option value="noTheft">No Theft</option>
          </select>
        </div>

        <div className="setting-row">
          <label>Kitty Bid Policy</label>
          <select value={settings.kittyBidPolicy} onChange={e => set('kittyBidPolicy', e.target.value)} disabled={disabled}>
            <option value="firstCard">First Card</option>
            <option value="firstCardOfLevelOrHighest">First Card of Level or Highest</option>
          </select>
        </div>

        <div className="setting-row">
          <label>Kitty Penalty</label>
          <select value={settings.kittyPenalty} onChange={e => set('kittyPenalty', e.target.value)} disabled={disabled}>
            <option value="times">Times (2x size)</option>
            <option value="power">Power (2^size)</option>
          </select>
        </div>

        <div className="setting-row checkbox">
          <label>Reveal Kitty at End</label>
          <input type="checkbox" checked={settings.revealKittyAtEnd}
            onChange={e => set('revealKittyAtEnd', e.target.checked)} disabled={disabled} />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Play Rules</div>

        <div className="setting-row">
          <label>Card Protection</label>
          <select value={settings.cardProtectionPolicy} onChange={e => set('cardProtectionPolicy', e.target.value)} disabled={disabled}>
            <option value="noProtections">No Protections</option>
            <option value="longerTuplesProtected">Longer Tuples Protected</option>
            <option value="onlyDrawTractorOnTractor">Only Draw Tractor on Tractor</option>
            <option value="longerAndTractor">Longer Tuples + Tractor</option>
            <option value="noFormatBasedDraw">No Format-Based Draw</option>
          </select>
        </div>

        <div className="setting-row">
          <label>Throw Evaluation</label>
          <select value={settings.throwEvaluationPolicy} onChange={e => set('throwEvaluationPolicy', e.target.value)} disabled={disabled}>
            <option value="all">All Components</option>
            <option value="highest">Highest Component</option>
            <option value="trickUnitLength">Trick Unit Length</option>
          </select>
        </div>

        <div className="setting-row">
          <label>Throw Penalty</label>
          <select value={settings.throwPenalty} onChange={e => set('throwPenalty', e.target.value)} disabled={disabled}>
            <option value="none">None</option>
            <option value="tenPoints">10 Points per Attempt</option>
          </select>
        </div>

        <div className="setting-row checkbox">
          <label>Hide Throw-Halting Player</label>
          <input type="checkbox" checked={settings.hideThrowHaltingPlayer}
            onChange={e => set('hideThrowHaltingPlayer', e.target.checked)} disabled={disabled} />
        </div>
      </div>

      {settings.gameMode === 'findingFriends' && (
        <div className="settings-group">
          <div className="settings-group-title">Finding Friends</div>

          <div className="setting-row">
            <label>Friend Selection</label>
            <select value={settings.friendSelectionRestriction} onChange={e => set('friendSelectionRestriction', e.target.value)} disabled={disabled}>
              <option value="unrestricted">Unrestricted</option>
              <option value="trumpsIncluded">Trumps Included</option>
              <option value="highestCardNotAllowed">Highest Card Not Allowed</option>
              <option value="pointCardNotAllowed">Point Card Not Allowed</option>
            </select>
          </div>

          <div className="setting-row">
            <label>Number of Friends</label>
            <select
              value={settings.numFriends ?? 'auto'}
              onChange={e => set('numFriends', e.target.value === 'auto' ? null : Number(e.target.value))}
              disabled={disabled}
            >
              <option value="auto">Auto</option>
              {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="settings-group">
        <div className="settings-group-title">Advancement</div>

        <div className="setting-row">
          <label>Advancement Policy</label>
          <select value={settings.advancementPolicy} onChange={e => set('advancementPolicy', e.target.value)} disabled={disabled}>
            <option value="unrestricted">Unrestricted</option>
            <option value="fullyUnrestricted">Fully Unrestricted</option>
            <option value="defendPoints">Defend Points</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Tractors</div>

        <div className="setting-row">
          <label>Min Tractor Width</label>
          <select value={settings.tractorMinWidth} onChange={e => set('tractorMinWidth', Number(e.target.value))} disabled={disabled}>
            {[2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="setting-row">
          <label>Min Tractor Length</label>
          <select value={settings.tractorMinLength} onChange={e => set('tractorMinLength', Number(e.target.value))} disabled={disabled}>
            {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="setting-row">
          <label>Bomb Policy</label>
          <select value={settings.bombPolicy} onChange={e => set('bombPolicy', e.target.value)} disabled={disabled}>
            <option value="noBombs">No Bombs</option>
            <option value="allowBombs">Allow Bombs</option>
            <option value="allowBombsSuitFollowing">Allow Bombs (Suit Following)</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Other</div>

        <div className="setting-row">
          <label>Point Visibility</label>
          <select value={settings.pointVisibility} onChange={e => set('pointVisibility', e.target.value)} disabled={disabled}>
            <option value="all">Show All</option>
            <option value="hideDefending">Hide Defending</option>
          </select>
        </div>

        <div className="setting-row checkbox">
          <label>Allow Play Takeback</label>
          <input type="checkbox" checked={settings.playTakeback}
            onChange={e => set('playTakeback', e.target.checked)} disabled={disabled} />
        </div>

        <div className="setting-row checkbox">
          <label>Allow Bid Takeback</label>
          <input type="checkbox" checked={settings.bidTakeback}
            onChange={e => set('bidTakeback', e.target.checked)} disabled={disabled} />
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
