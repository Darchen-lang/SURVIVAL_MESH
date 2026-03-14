import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import { Buffer } from 'buffer';
import { IdentityManager, type CryptoAdapter, type SecureStoreAdapter } from './IdentityManager';

function uint8ToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToUint8(base64: string): Uint8Array {
  const bytes = Buffer.from(base64, 'base64');
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

const secureStoreAdapter: SecureStoreAdapter = {
  async getItem(key) {
    return SecureStore.getItemAsync(key);
  },
  async setItem(key, value) {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
};

const cryptoAdapter: CryptoAdapter = {
  async createSigningKeyPair() {
    const pair = nacl.box.keyPair();
    return {
      publicKeyBase64: uint8ToBase64(pair.publicKey),
      secretKeyBase64: uint8ToBase64(pair.secretKey),
    };
  },

  async encrypt(recipientPublicKeyBase64, senderSecretKeyBase64, message) {
    const recipientPublicKey = base64ToUint8(recipientPublicKeyBase64);
    const senderSecretKey = base64ToUint8(senderSecretKeyBase64);
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const msgBytes = new TextEncoder().encode(message);
    const cipher = nacl.box(msgBytes, nonce, recipientPublicKey, senderSecretKey);

    return JSON.stringify({
      nonce: uint8ToBase64(nonce),
      cipher: uint8ToBase64(cipher),
    });
  },

  async decrypt(senderPublicKeyBase64, recipientSecretKeyBase64, encryptedPayload) {
    const parsed = JSON.parse(encryptedPayload) as { nonce: string; cipher: string };
    const senderPublicKey = base64ToUint8(senderPublicKeyBase64);
    const recipientSecretKey = base64ToUint8(recipientSecretKeyBase64);
    const nonce = base64ToUint8(parsed.nonce);
    const cipher = base64ToUint8(parsed.cipher);

    const opened = nacl.box.open(cipher, nonce, senderPublicKey, recipientSecretKey);
    if (!opened) {
      return null;
    }
    return new TextDecoder().decode(opened);
  },
};

export const identityManager = new IdentityManager(secureStoreAdapter, cryptoAdapter);
