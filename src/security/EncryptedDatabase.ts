export interface SqlCipherAdapter {
  openDatabase(name: string, key: string): Promise<void>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export interface KeyDeriver {
  derive(passphrase: string, salt: string): Promise<string>;
}

export class EncryptedDatabase {
  private wrongAttempts = 0;

  constructor(private readonly sqlcipher: SqlCipherAdapter, private readonly deriver: KeyDeriver) {}

  async open(passphrase: string): Promise<void> {
    const normalized = passphrase.trim();
    if (normalized.length < 4 || normalized.length > 6) {
      throw new Error('Passphrase PIN must be 4 to 6 digits.');
    }

    try {
      const key = await this.deriver.derive(normalized, 'survivalmesh-salt-v1');
      await this.sqlcipher.openDatabase('survivalmesh_secure.db', key);
      this.wrongAttempts = 0;
    } catch (error) {
      this.wrongAttempts += 1;
      if (this.wrongAttempts >= 5) {
        await this.panicWipe();
      }
      throw error;
    }
  }

  async panicWipe(): Promise<void> {
    await this.sqlcipher.exec('PRAGMA writable_schema = 1;');
    await this.sqlcipher.exec("DELETE FROM sqlite_master WHERE type IN ('table', 'index', 'trigger');");
    await this.sqlcipher.exec('PRAGMA writable_schema = 0;');
    await this.sqlcipher.close();
  }
}
