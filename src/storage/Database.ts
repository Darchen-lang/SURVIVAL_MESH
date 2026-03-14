import * as SQLite from 'expo-sqlite';

const DB_NAME = 'survivalmesh.db';

export class Database {
  private static instance: Database | null = null;
  private db: SQLite.SQLiteDatabase | null = null;

  // FIX: Single shared promise that is NEVER cleared until resolved.
  // All callers await the same promise — no race, no double-open.
  private readyPromise: Promise<SQLite.SQLiteDatabase> | null = null;

  private constructor() {}

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  /**
   * Returns a fully-initialized database connection.
   * Safe to call concurrently — all callers share the same promise.
   */
  async getConnection(): Promise<SQLite.SQLiteDatabase> {
    // Already open and initialized — fast path.
    if (this.db) {
      return this.db;
    }

    // FIX: Create the promise once and keep it. Never null it out.
    // Every concurrent caller awaits the same promise, so only one
    // openDatabaseAsync + init ever runs. This eliminates the NullPointerException
    // caused by multiple callers racing to open the DB simultaneously.
    if (!this.readyPromise) {
      this.readyPromise = this.openAndInit();
    }

    return this.readyPromise;
  }

  private async openAndInit(): Promise<SQLite.SQLiteDatabase> {
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
    await this.runMigrations(this.db);
    return this.db;
  }

  private async runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
    // Run statements individually; some runtimes reject multi-statement prepareAsync calls.
    const statements = [
      "PRAGMA journal_mode = WAL;",
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        ttl INTEGER NOT NULL,
        senderId TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        delivered INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL DEFAULT 'message'
      );`,
      "CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);",
      "CREATE INDEX IF NOT EXISTS idx_messages_delivered ON messages(delivered);",
      `CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY NOT NULL,
        authorKeyHash TEXT NOT NULL,
        content TEXT NOT NULL,
        tag TEXT NOT NULL CHECK(tag IN ('water', 'medical', 'danger', 'route', 'other')),
        timestamp INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL
      );`,
      "CREATE INDEX IF NOT EXISTS idx_posts_timestamp ON posts(timestamp DESC);",
      "CREATE INDEX IF NOT EXISTS idx_posts_expires ON posts(expiresAt);",
      `CREATE TABLE IF NOT EXISTS contacts (
        nodeId TEXT PRIMARY KEY NOT NULL,
        publicKey TEXT NOT NULL,
        alias TEXT,
        createdAt INTEGER NOT NULL
      );`,
      "CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(createdAt DESC);",
      `CREATE TABLE IF NOT EXISTS map_pins (
        id TEXT PRIMARY KEY NOT NULL,
        label TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        notes TEXT,
        createdAt INTEGER NOT NULL
      );`,
      "CREATE INDEX IF NOT EXISTS idx_map_pins_created_at ON map_pins(createdAt DESC);",
      `CREATE TABLE IF NOT EXISTS offline_map_meta (
        id TEXT PRIMARY KEY NOT NULL,
        centerLat REAL NOT NULL,
        centerLng REAL NOT NULL,
        minZoom INTEGER NOT NULL,
        maxZoom INTEGER NOT NULL,
        delta REAL NOT NULL,
        downloadedAt INTEGER NOT NULL,
        tileCount INTEGER NOT NULL DEFAULT 0
      );`,
    ];

    for (const stmt of statements) {
      await db.execAsync(stmt);
    }
  }
}

export const db = Database.getInstance();