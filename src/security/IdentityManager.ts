export interface SecureStoreAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface CryptoAdapter {
  createSigningKeyPair(): Promise<{ publicKeyBase64: string; secretKeyBase64: string }>;
  encrypt(recipientPublicKeyBase64: string, senderSecretKeyBase64: string, message: string): Promise<string>;
  decrypt(senderPublicKeyBase64: string, recipientSecretKeyBase64: string, encryptedPayload: string): Promise<string | null>;
}

const KEYPAIR_STORAGE_KEY = 'identity.keypair.v1';

export class IdentityManager {
  constructor(private readonly secureStore: SecureStoreAdapter, private readonly crypto: CryptoAdapter) {}

  async init(): Promise<void> {
    const existing = await this.secureStore.getItem(KEYPAIR_STORAGE_KEY);
    if (existing) {
      return;
    }
    const generated = await this.crypto.createSigningKeyPair();
    await this.secureStore.setItem(KEYPAIR_STORAGE_KEY, JSON.stringify(generated));
  }

  async getPublicKey(): Promise<string> {
    await this.init();
    const raw = await this.secureStore.getItem(KEYPAIR_STORAGE_KEY);
    if (!raw) {
      throw new Error('Identity keypair missing.');
    }
    const parsed = JSON.parse(raw) as { publicKeyBase64: string };
    return parsed.publicKeyBase64;
  }

  async getPublicKeyHash(): Promise<string> {
    const pub = await this.getPublicKey();
    return pub.slice(0, 6);
  }

  async encryptMessage(recipientPublicKey: string, message: string): Promise<string> {
    await this.init();
    const raw = await this.secureStore.getItem(KEYPAIR_STORAGE_KEY);
    if (!raw) {
      throw new Error('Identity keypair missing.');
    }
    const parsed = JSON.parse(raw) as { secretKeyBase64: string };
    return this.crypto.encrypt(recipientPublicKey, parsed.secretKeyBase64, message);
  }

  async decryptMessage(senderPublicKey: string, encryptedPayload: string): Promise<string | null> {
    await this.init();
    const raw = await this.secureStore.getItem(KEYPAIR_STORAGE_KEY);
    if (!raw) {
      throw new Error('Identity keypair missing.');
    }
    const parsed = JSON.parse(raw) as { secretKeyBase64: string };
    return this.crypto.decrypt(senderPublicKey, parsed.secretKeyBase64, encryptedPayload);
  }
}
