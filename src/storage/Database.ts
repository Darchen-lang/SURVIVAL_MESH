import * as SQLite from 'expo-sqlite';

const DB_NAME = 'survivalmesh.db';

export class Database {
	private static instance: Database | null = null;
	private db: SQLite.SQLiteDatabase | null = null;
	private initialized = false;

	private constructor() {}

	static getInstance(): Database {
		if (!Database.instance) {
			Database.instance = new Database();
		}
		return Database.instance;
	}

	async getConnection(): Promise<SQLite.SQLiteDatabase> {
		if (this.db) {
			return this.db;
		}

		this.db = await SQLite.openDatabaseAsync(DB_NAME);
		await this.init();
		return this.db;
	}

	async init(): Promise<void> {
		if (this.initialized) {
			return;
		}

		if (!this.db) {
			this.db = await SQLite.openDatabaseAsync(DB_NAME);
		}

		const db = this.db;

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
		];

		for (const stmt of statements) {
			await db.execAsync(stmt);
		}

		this.initialized = true;
	}
}

export const db = Database.getInstance();

