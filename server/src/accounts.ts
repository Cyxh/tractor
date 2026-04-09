import { randomBytes, createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');

export interface PlayerStats {
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
  longestTractor: number; // longest tractor length played
  kittyMultipliersEarned: number;
  chatMessagesSent: number;
}

const defaultStats: PlayerStats = {
  gamesPlayed: 0, gamesWon: 0,
  roundsPlayed: 0, roundsWonAsDefender: 0, roundsWonAsAttacker: 0,
  tricksPlayed: 0, tricksWon: 0, totalPointsScored: 0,
  bidsMade: 0, singlesPlayed: 0, pairsPlayed: 0, tractorsPlayed: 0,
  throwPenalties: 0, throwPenaltyPoints: 0,
  friendsRevealed: 0, timesAsLeader: 0, timesDefending: 0, timesAttacking: 0,
  ranksAdvanced: 0, highestTrickPoints: 0, longestTractor: 0,
  kittyMultipliersEarned: 0, chatMessagesSent: 0,
};

interface Account {
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  // Active session tracking
  currentRoomId: string | null;
  currentPlayerName: string | null;
  // Email (optional)
  email: string | null;
  emailVerified: boolean;
  // Statistics
  stats: PlayerStats;
}

interface TokenEntry {
  username: string;
  createdAt: number;
}

// Verification/reset codes: key = email or username, value = { code, expiresAt, username? }
interface PendingCode {
  code: string;
  expiresAt: number;
  username: string;
  email?: string;
}
const pendingEmailCodes = new Map<string, PendingCode>(); // key = username (for verify)
const pendingResetCodes = new Map<string, PendingCode>();  // key = email (for reset)

// SMTP transporter — configured via env vars
function createMailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const mailFrom = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@tractor.game';

async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const transporter = createMailTransporter();
  if (!transporter) {
    console.error('SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)');
    return false;
  }
  try {
    await transporter.sendMail({ from: mailFrom, to, subject, text });
    return true;
  } catch (e) {
    console.error('Failed to send email:', e);
    return false;
  }
}

const TOKENS_FILE = join(DATA_DIR, 'tokens.json');
const tokens = new Map<string, TokenEntry>();

function loadTokens(): void {
  try {
    if (existsSync(TOKENS_FILE)) {
      const data = JSON.parse(readFileSync(TOKENS_FILE, 'utf-8')) as Record<string, TokenEntry>;
      const now = Date.now();
      for (const [token, entry] of Object.entries(data)) {
        // Skip expired tokens
        if (now - entry.createdAt <= 30 * 24 * 60 * 60 * 1000) {
          tokens.set(token, entry);
        }
      }
    }
  } catch (e) {
    console.error('Failed to load tokens:', e);
  }
}

function saveTokens(): void {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    const obj: Record<string, TokenEntry> = {};
    tokens.forEach((v, k) => { obj[k] = v; });
    writeFileSync(TOKENS_FILE, JSON.stringify(obj));
  } catch (e) {
    console.error('Failed to save tokens:', e);
  }
}

let accounts: Map<string, Account> = new Map();

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(salt + password).digest('hex');
}

function loadAccounts(): void {
  try {
    if (existsSync(ACCOUNTS_FILE)) {
      const data = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf-8'));
      accounts = new Map(Object.entries(data));
    }
  } catch (e) {
    console.error('Failed to load accounts:', e);
    accounts = new Map();
  }
}

function saveAccounts(): void {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    const obj: Record<string, Account> = {};
    accounts.forEach((v, k) => { obj[k] = v; });
    writeFileSync(ACCOUNTS_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('Failed to save accounts:', e);
  }
}

// Initialize
loadAccounts();
loadTokens();

export function register(username: string, password: string): { success: boolean; error?: string; token?: string } {
  const normalized = username.trim().toLowerCase();
  if (normalized.length < 1 || normalized.length > 20) {
    return { success: false, error: 'Username must be 1-20 characters' };
  }
  if (password.length < 3) {
    return { success: false, error: 'Password must be at least 3 characters' };
  }
  if (accounts.has(normalized)) {
    return { success: false, error: 'Username already taken' };
  }

  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);

  accounts.set(normalized, {
    username: normalized,
    passwordHash,
    salt,
    createdAt: Date.now(),
    currentRoomId: null,
    currentPlayerName: null,
    email: null,
    emailVerified: false,
    stats: { ...defaultStats },
  });
  saveAccounts();

  const token = generateToken(normalized);
  return { success: true, token };
}

export function login(username: string, password: string): { success: boolean; error?: string; token?: string } {
  const normalized = username.trim().toLowerCase();
  const account = accounts.get(normalized);
  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  const hash = hashPassword(password, account.salt);
  if (hash !== account.passwordHash) {
    return { success: false, error: 'Invalid password' };
  }

  const token = generateToken(normalized);
  return { success: true, token };
}

function generateToken(username: string): string {
  const token = randomBytes(32).toString('hex');
  tokens.set(token, { username, createdAt: Date.now() });
  saveTokens();
  return token;
}

export function validateToken(token: string): string | null {
  const entry = tokens.get(token);
  if (!entry) return null;
  // Tokens expire after 24 hours
  if (Date.now() - entry.createdAt > 30 * 24 * 60 * 60 * 1000) {
    tokens.delete(token);
    saveTokens();
    return null;
  }
  return entry.username;
}

export function getAccount(username: string): Account | undefined {
  return accounts.get(username.trim().toLowerCase());
}

export function setAccountRoom(username: string, roomId: string | null, playerName: string | null): void {
  const account = accounts.get(username.trim().toLowerCase());
  if (account) {
    account.currentRoomId = roomId;
    account.currentPlayerName = playerName;
    saveAccounts();
  }
}

export function getAccountSession(username: string): { roomId: string | null; playerName: string | null } {
  const account = accounts.get(username.trim().toLowerCase());
  if (!account) return { roomId: null, playerName: null };
  return { roomId: account.currentRoomId, playerName: account.currentPlayerName };
}

export function changeUsername(currentUsername: string, newUsername: string): { success: boolean; error?: string } {
  const normalizedCurrent = currentUsername.trim().toLowerCase();
  const normalizedNew = newUsername.trim().toLowerCase();

  if (normalizedNew.length < 1 || normalizedNew.length > 20) {
    return { success: false, error: 'Username must be 1-20 characters' };
  }
  if (normalizedCurrent === normalizedNew) {
    return { success: false, error: 'New username is the same as current' };
  }
  if (accounts.has(normalizedNew)) {
    return { success: false, error: 'Username already taken' };
  }

  const account = accounts.get(normalizedCurrent);
  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  // Move account to new key
  accounts.delete(normalizedCurrent);
  account.username = normalizedNew;
  accounts.set(normalizedNew, account);

  // Update any active tokens pointing to the old username
  tokens.forEach((entry) => {
    if (entry.username === normalizedCurrent) {
      entry.username = normalizedNew;
    }
  });

  saveAccounts();
  return { success: true };
}

export function changePassword(username: string, currentPassword: string, newPassword: string): { success: boolean; error?: string } {
  const normalized = username.trim().toLowerCase();
  const account = accounts.get(normalized);
  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  const hash = hashPassword(currentPassword, account.salt);
  if (hash !== account.passwordHash) {
    return { success: false, error: 'Current password is incorrect' };
  }

  if (newPassword.length < 3) {
    return { success: false, error: 'New password must be at least 3 characters' };
  }

  const newSalt = randomBytes(16).toString('hex');
  account.salt = newSalt;
  account.passwordHash = hashPassword(newPassword, newSalt);
  saveAccounts();
  return { success: true };
}

// ===== EMAIL VERIFICATION =====

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function getAccountEmail(username: string): { email: string | null; emailVerified: boolean } {
  const account = accounts.get(username.trim().toLowerCase());
  if (!account) return { email: null, emailVerified: false };
  return { email: account.email, emailVerified: account.emailVerified };
}

export async function requestEmailVerification(username: string, email: string): Promise<{ success: boolean; error?: string }> {
  const normalized = username.trim().toLowerCase();
  const account = accounts.get(normalized);
  if (!account) return { success: false, error: 'Account not found' };

  const emailLower = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
    return { success: false, error: 'Invalid email address' };
  }

  // Check if email is already used by another account
  for (const [key, acct] of accounts) {
    if (key !== normalized && acct.email === emailLower && acct.emailVerified) {
      return { success: false, error: 'Email already linked to another account' };
    }
  }

  const code = generateCode();
  pendingEmailCodes.set(normalized, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    username: normalized,
    email: emailLower,
  });

  const sent = await sendMail(
    emailLower,
    'Tractor - Email Verification Code',
    `Your verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`
  );

  if (!sent) return { success: false, error: 'Failed to send email. SMTP may not be configured.' };
  return { success: true };
}

export function verifyEmailCode(username: string, code: string): { success: boolean; error?: string } {
  const normalized = username.trim().toLowerCase();
  const pending = pendingEmailCodes.get(normalized);
  if (!pending) return { success: false, error: 'No verification pending' };
  if (Date.now() > pending.expiresAt) {
    pendingEmailCodes.delete(normalized);
    return { success: false, error: 'Code expired' };
  }
  if (pending.code !== code.trim()) {
    return { success: false, error: 'Invalid code' };
  }

  const account = accounts.get(normalized);
  if (!account) return { success: false, error: 'Account not found' };

  account.email = pending.email!;
  account.emailVerified = true;
  pendingEmailCodes.delete(normalized);
  saveAccounts();
  return { success: true };
}

export function unlinkEmail(username: string): { success: boolean; error?: string } {
  const normalized = username.trim().toLowerCase();
  const account = accounts.get(normalized);
  if (!account) return { success: false, error: 'Account not found' };
  account.email = null;
  account.emailVerified = false;
  saveAccounts();
  return { success: true };
}

// ===== PASSWORD RESET =====

export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  const emailLower = email.trim().toLowerCase();

  // Find account with this verified email
  let targetAccount: Account | null = null;
  for (const acct of accounts.values()) {
    if (acct.email === emailLower && acct.emailVerified) {
      targetAccount = acct;
      break;
    }
  }

  // Always return success to not leak whether an email exists
  if (!targetAccount) return { success: true };

  const code = generateCode();
  pendingResetCodes.set(emailLower, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
    username: targetAccount.username,
  });

  await sendMail(
    emailLower,
    'Tractor - Password Reset Code',
    `Your password reset code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`
  );

  return { success: true };
}

export function resetPassword(email: string, code: string, newPassword: string): { success: boolean; error?: string } {
  const emailLower = email.trim().toLowerCase();
  const pending = pendingResetCodes.get(emailLower);
  if (!pending) return { success: false, error: 'No reset pending' };
  if (Date.now() > pending.expiresAt) {
    pendingResetCodes.delete(emailLower);
    return { success: false, error: 'Code expired' };
  }
  if (pending.code !== code.trim()) {
    return { success: false, error: 'Invalid code' };
  }
  if (newPassword.length < 3) {
    return { success: false, error: 'Password must be at least 3 characters' };
  }

  const account = accounts.get(pending.username);
  if (!account) return { success: false, error: 'Account not found' };

  const newSalt = randomBytes(16).toString('hex');
  account.salt = newSalt;
  account.passwordHash = hashPassword(newPassword, newSalt);
  pendingResetCodes.delete(emailLower);
  saveAccounts();
  return { success: true };
}

// ===== STATISTICS =====

export function getStats(username: string): PlayerStats {
  const account = accounts.get(username.trim().toLowerCase());
  if (!account) return { ...defaultStats };
  // Ensure stats exist for older accounts
  if (!account.stats) account.stats = { ...defaultStats };
  return { ...account.stats };
}

export function updateStats(username: string, updates: Partial<PlayerStats>): void {
  const account = accounts.get(username.trim().toLowerCase());
  if (!account) return;
  if (!account.stats) account.stats = { ...defaultStats };
  for (const [key, value] of Object.entries(updates)) {
    (account.stats as any)[key] = value;
  }
  saveAccounts();
}

export function incrementStats(username: string, increments: Partial<PlayerStats>): void {
  const account = accounts.get(username.trim().toLowerCase());
  if (!account) return;
  if (!account.stats) account.stats = { ...defaultStats };
  for (const [key, value] of Object.entries(increments)) {
    (account.stats as any)[key] += value;
  }
  saveAccounts();
}

export function batchIncrementStats(usernames: string[], increments: Partial<PlayerStats>): void {
  for (const username of usernames) {
    const account = accounts.get(username.trim().toLowerCase());
    if (!account) continue;
    if (!account.stats) account.stats = { ...defaultStats };
    for (const [key, value] of Object.entries(increments)) {
      (account.stats as any)[key] += value;
    }
  }
  saveAccounts();
}
