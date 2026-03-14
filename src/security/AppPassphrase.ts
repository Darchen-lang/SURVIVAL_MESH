import { Buffer } from 'buffer';
import nacl from 'tweetnacl';
import * as SecureStore from 'expo-secure-store';

const PASSCODE_HASH_KEY = 'survivalmesh.passcode.hash.v1';

function normalizePin(pin: string): string {
  return pin.trim();
}

function validatePin(pin: string): void {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('PIN must be 4 to 6 digits.');
  }
}

function hashPin(pin: string): string {
  const digest = nacl.hash(Buffer.from(pin, 'utf8'));
  return Buffer.from(digest).toString('base64');
}

export class AppPassphrase {
  async hasPin(): Promise<boolean> {
    const saved = await SecureStore.getItemAsync(PASSCODE_HASH_KEY);
    return Boolean(saved);
  }

  async setPin(pin: string): Promise<void> {
    const normalized = normalizePin(pin);
    validatePin(normalized);
    const hash = hashPin(normalized);
    await SecureStore.setItemAsync(PASSCODE_HASH_KEY, hash);
  }

  async verifyPin(pin: string): Promise<boolean> {
    const normalized = normalizePin(pin);
    validatePin(normalized);

    const saved = await SecureStore.getItemAsync(PASSCODE_HASH_KEY);
    if (!saved) {
      return false;
    }

    return saved === hashPin(normalized);
  }
}

export const appPassphrase = new AppPassphrase();
