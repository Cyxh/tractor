import { randomBytes, createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');

interface Account {
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  // Active session tracking
  currentRoomId: string | null;
  currentPlayerName: string | null;
}

interface TokenEntry {
  username: string;
  createdAt: number;
}

// In-memory token store (tokens don't survive restart, but accounts do — users just re-login)
const tokens = new Map<string, TokenEntry>();

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
  return token;
}

export function validateToken(token: string): string | null {
  const entry = tokens.get(token);
  if (!entry) return null;
  // Tokens expire after 24 hours
  if (Date.now() - entry.createdAt > 24 * 60 * 60 * 1000) {
    tokens.delete(token);
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
