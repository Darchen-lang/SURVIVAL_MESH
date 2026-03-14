import { db } from '../storage/Database';

export type Contact = {
  nodeId: string;
  publicKey: string;
  alias: string | null;
  createdAt: number;
};

export class ContactBook {
  async addContact(nodeId: string, publicKey: string, alias: string | null = null): Promise<void> {
    const conn = await db.getConnection();
    await conn.runAsync(
      `
      INSERT INTO contacts (nodeId, publicKey, alias, createdAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(nodeId) DO UPDATE SET
        publicKey = excluded.publicKey,
        alias = COALESCE(excluded.alias, contacts.alias)
      `,
      [nodeId, publicKey, alias, Date.now()]
    );
  }

  async listContacts(): Promise<Contact[]> {
    const conn = await db.getConnection();
    return conn.getAllAsync<Contact>(
      `
      SELECT nodeId, publicKey, alias, createdAt
      FROM contacts
      ORDER BY createdAt DESC
      `
    );
  }
}

export const contactBook = new ContactBook();
