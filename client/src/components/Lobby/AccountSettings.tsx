import React, { useState, useEffect } from 'react';
import './AccountSettings.css';

interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  roundsPlayed: number;
  roundsWonAsDefender: number;
  roundsWonAsAttacker: number;
  tricksPlayed: number;
  tricksWon: number;
  totalPointsScored: number;
  bidsMade: number;
  singlesPlayed: number;
  pairsPlayed: number;
  tractorsPlayed: number;
  throwPenalties: number;
  throwPenaltyPoints: number;
  friendsRevealed: number;
  timesAsLeader: number;
  timesDefending: number;
  timesAttacking: number;
  ranksAdvanced: number;
  highestTrickPoints: number;
  longestTractor: number;
  kittyMultipliersEarned: number;
  chatMessagesSent: number;
}

interface AccountSettingsProps {
  username: string;
  onClose: () => void;
  onChangeUsername: (newUsername: string) => Promise<{ error?: string }>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
  onGetAccountEmail: () => Promise<{ email: string | null; emailVerified: boolean; error?: string }>;
  onRequestEmailVerification: (email: string) => Promise<{ error?: string }>;
  onVerifyEmail: (code: string) => Promise<{ error?: string }>;
  onUnlinkEmail: () => Promise<{ error?: string }>;
  onGetStats: () => Promise<PlayerStats>;
}

type Category = 'account' | 'statistics';

const AccountSettings: React.FC<AccountSettingsProps> = ({
  username, onClose, onChangeUsername, onChangePassword,
  onGetAccountEmail, onRequestEmailVerification, onVerifyEmail, onUnlinkEmail,
  onGetStats,
}) => {
  const [category, setCategory] = useState<Category>('account');
  const [tab, setTab] = useState<'username' | 'password' | 'email'>('username');

  // Account fields
  const [newUsername, setNewUsername] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Email fields
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);

  // Stats
  const [stats, setStats] = useState<PlayerStats | null>(null);

  // Load email info on mount
  useEffect(() => {
    onGetAccountEmail().then(info => {
      if (!info.error) {
        setAccountEmail(info.email);
        setEmailVerified(info.emailVerified);
      }
    });
  }, [onGetAccountEmail]);

  // Load stats when switching to statistics
  useEffect(() => {
    if (category === 'statistics' && !stats) {
      onGetStats().then(setStats);
    }
  }, [category, stats, onGetStats]);

  const clearMessages = () => { setError(''); setSuccess(''); };

  const handleChangeUsername = async () => {
    if (!newUsername.trim()) return;
    setLoading(true); clearMessages();
    const result = await onChangeUsername(newUsername.trim());
    setLoading(false);
    if (result.error) setError(result.error);
    else { setSuccess('Username changed successfully'); setNewUsername(''); }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) return;
    setLoading(true); clearMessages();
    const result = await onChangePassword(currentPw, newPw);
    setLoading(false);
    if (result.error) setError(result.error);
    else { setSuccess('Password changed successfully'); setCurrentPw(''); setNewPw(''); }
  };

  const handleSendVerification = async () => {
    if (!emailInput.trim()) return;
    setLoading(true); clearMessages();
    const result = await onRequestEmailVerification(emailInput.trim());
    setLoading(false);
    if (result.error) setError(result.error);
    else setEmailCodeSent(true);
  };

  const handleVerifyCode = async () => {
    if (!emailCode.trim()) return;
    setLoading(true); clearMessages();
    const result = await onVerifyEmail(emailCode.trim());
    setLoading(false);
    if (result.error) setError(result.error);
    else {
      setAccountEmail(emailInput.trim().toLowerCase());
      setEmailVerified(true);
      setEmailCodeSent(false);
      setSuccess('Email verified and linked!');
    }
  };

  const handleUnlinkEmail = async () => {
    setLoading(true); clearMessages();
    const result = await onUnlinkEmail();
    setLoading(false);
    if (result.error) setError(result.error);
    else { setAccountEmail(null); setEmailVerified(false); setSuccess('Email unlinked'); }
  };

  const renderAccountContent = () => (
    <div className="as-account">
      <div className="as-tabs">
        <button className={`as-tab ${tab === 'username' ? 'active' : ''}`}
          onClick={() => { setTab('username'); clearMessages(); }}>Username</button>
        <button className={`as-tab ${tab === 'password' ? 'active' : ''}`}
          onClick={() => { setTab('password'); clearMessages(); }}>Password</button>
        <button className={`as-tab ${tab === 'email' ? 'active' : ''}`}
          onClick={() => { setTab('email'); clearMessages(); }}>Email</button>
      </div>

      <div className="as-tab-content">
        {tab === 'username' && (
          <div className="as-section">
            <label className="as-label">Current Username</label>
            <div className="as-value">{username}</div>
            <label className="as-label">New Username</label>
            <input className="as-input" type="text" placeholder="Enter new username..."
              value={newUsername} onChange={e => setNewUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChangeUsername()}
              maxLength={20} autoFocus />
            <button className="as-btn as-btn-primary" onClick={handleChangeUsername}
              disabled={loading || !newUsername.trim()}>
              {loading ? 'Saving...' : 'Change Username'}
            </button>
          </div>
        )}

        {tab === 'password' && (
          <div className="as-section">
            <label className="as-label">Current Password</label>
            <input className="as-input" type="password" placeholder="Enter current password..."
              value={currentPw} onChange={e => setCurrentPw(e.target.value)} autoFocus />
            <label className="as-label">New Password</label>
            <input className="as-input" type="password" placeholder="Enter new password..."
              value={newPw} onChange={e => setNewPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChangePassword()} />
            <button className="as-btn as-btn-primary" onClick={handleChangePassword}
              disabled={loading || !currentPw || !newPw}>
              {loading ? 'Saving...' : 'Change Password'}
            </button>
          </div>
        )}

        {tab === 'email' && (
          <div className="as-section">
            {accountEmail && emailVerified ? (
              <>
                <label className="as-label">Linked Email</label>
                <div className="as-value">{accountEmail}</div>
                <button className="as-btn as-btn-secondary" onClick={handleUnlinkEmail}
                  disabled={loading}>
                  {loading ? 'Unlinking...' : 'Unlink Email'}
                </button>
              </>
            ) : !emailCodeSent ? (
              <>
                <label className="as-label">Link Email (for password recovery)</label>
                <input className="as-input" type="email" placeholder="Enter email address..."
                  value={emailInput} onChange={e => setEmailInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendVerification()} autoFocus />
                <button className="as-btn as-btn-primary" onClick={handleSendVerification}
                  disabled={loading || !emailInput.trim()}>
                  {loading ? 'Sending...' : 'Send Verification Code'}
                </button>
              </>
            ) : (
              <>
                <label className="as-label">Verification code sent to {emailInput}</label>
                <input className="as-input" type="text" placeholder="Enter 6-digit code..."
                  value={emailCode} onChange={e => setEmailCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyCode()}
                  maxLength={6} autoFocus />
                <button className="as-btn as-btn-primary" onClick={handleVerifyCode}
                  disabled={loading || !emailCode.trim()}>
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
              </>
            )}
          </div>
        )}

        {error && <div className="as-error">{error}</div>}
        {success && <div className="as-success">{success}</div>}
      </div>
    </div>
  );

  const statRow = (label: string, value: number | string) => (
    <div className="as-stat-row">
      <span className="as-stat-label">{label}</span>
      <span className="as-stat-value">{value}</span>
    </div>
  );

  const renderStatisticsContent = () => {
    if (!stats) return <div className="as-loading">Loading statistics...</div>;

    const winRate = stats.gamesPlayed > 0
      ? `${((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(1)}%`
      : '-';
    const trickWinRate = stats.tricksPlayed > 0
      ? `${((stats.tricksWon / stats.tricksPlayed) * 100).toFixed(1)}%`
      : '-';

    return (
      <div className="as-statistics">
        <div className="as-stat-group">
          <h3 className="as-stat-group-title">Games</h3>
          {statRow('Games Played', stats.gamesPlayed)}
          {statRow('Games Won', stats.gamesWon)}
          {statRow('Win Rate', winRate)}
          {statRow('Rounds Played', stats.roundsPlayed)}
        </div>

        <div className="as-stat-group">
          <h3 className="as-stat-group-title">Roles</h3>
          {statRow('Times as Leader', stats.timesAsLeader)}
          {statRow('Times Defending', stats.timesDefending)}
          {statRow('Times Attacking', stats.timesAttacking)}
          {statRow('Rounds Won (Defending)', stats.roundsWonAsDefender)}
          {statRow('Rounds Won (Attacking)', stats.roundsWonAsAttacker)}
        </div>

        <div className="as-stat-group">
          <h3 className="as-stat-group-title">Tricks & Points</h3>
          {statRow('Tricks Played', stats.tricksPlayed)}
          {statRow('Tricks Won', stats.tricksWon)}
          {statRow('Trick Win Rate', trickWinRate)}
          {statRow('Total Points Scored', stats.totalPointsScored)}
          {statRow('Highest Trick Points', stats.highestTrickPoints)}
        </div>

        <div className="as-stat-group">
          <h3 className="as-stat-group-title">Plays</h3>
          {statRow('Singles Played', stats.singlesPlayed)}
          {statRow('Pairs Played', stats.pairsPlayed)}
          {statRow('Tractors Played', stats.tractorsPlayed)}
          {statRow('Longest Tractor', stats.longestTractor > 0 ? `${stats.longestTractor} groups` : '-')}
          {statRow('Bids Made', stats.bidsMade)}
        </div>

        <div className="as-stat-group">
          <h3 className="as-stat-group-title">Other</h3>
          {statRow('Throw Penalties', stats.throwPenalties)}
          {statRow('Friends Revealed', stats.friendsRevealed)}
          {statRow('Ranks Advanced', stats.ranksAdvanced)}
          {statRow('Chat Messages Sent', stats.chatMessagesSent)}
        </div>
      </div>
    );
  };

  return (
    <div className="as-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="as-container">
        <div className="as-sidebar">
          <h2 className="as-sidebar-title">Settings</h2>
          <nav className="as-nav">
            <button className={`as-nav-item ${category === 'account' ? 'active' : ''}`}
              onClick={() => { setCategory('account'); clearMessages(); }}>
              <span className="as-nav-icon">&#9881;</span> Account
            </button>
            <button className={`as-nav-item ${category === 'statistics' ? 'active' : ''}`}
              onClick={() => { setCategory('statistics'); clearMessages(); }}>
              <span className="as-nav-icon">&#9733;</span> Statistics
            </button>
          </nav>
          <button className="as-close-btn" onClick={onClose}>&larr; Back to Lobby</button>
        </div>
        <div className="as-main">
          <h2 className="as-main-title">
            {category === 'account' ? 'Account Settings' : 'Player Statistics'}
          </h2>
          <div className="as-main-content">
            {category === 'account' ? renderAccountContent() : renderStatisticsContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;
