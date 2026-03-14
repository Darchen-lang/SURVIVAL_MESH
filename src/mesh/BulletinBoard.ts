import { db } from '../storage/Database';
import type { BulletinPost, BulletinTag } from '../types/mesh';

type PostRow = BulletinPost;

export class BulletinBoard {
  async createPost(authorKeyHash: string, content: string, tag: BulletinTag): Promise<BulletinPost> {
    const now = Date.now();
    const post: BulletinPost = {
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      authorKeyHash,
      content,
      tag,
      timestamp: now,
      expiresAt: now + 48 * 60 * 60 * 1000,
    };

    const conn = await db.getConnection();
    await conn.runAsync(
      `
      INSERT OR REPLACE INTO posts (id, authorKeyHash, content, tag, timestamp, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [post.id, post.authorKeyHash, post.content, post.tag, post.timestamp, post.expiresAt]
    );

    return post;
  }

    async deletePost(id: string): Promise<void> {
      const conn = await db.getConnection();
      await conn.runAsync(`DELETE FROM posts WHERE id = ?`, [id]);
    }

  async upsertPost(post: BulletinPost): Promise<void> {
    const conn = await db.getConnection();
    await conn.runAsync(
      `
      INSERT OR REPLACE INTO posts (id, authorKeyHash, content, tag, timestamp, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [post.id, post.authorKeyHash, post.content, post.tag, post.timestamp, post.expiresAt]
    );
  }

  async getPosts(): Promise<BulletinPost[]> {
    const conn = await db.getConnection();
    return conn.getAllAsync<PostRow>(
      `
      SELECT id, authorKeyHash, content, tag, timestamp, expiresAt
      FROM posts
      WHERE expiresAt > ?
      ORDER BY timestamp DESC
      `,
      [Date.now()]
    );
  }

  async getPostIds(): Promise<string[]> {
    const conn = await db.getConnection();
    return (await conn.getAllAsync<{ id: string }>(`SELECT id FROM posts`)).map((r) => r.id);
  }

  async syncPosts(peerPostIds: string[]): Promise<BulletinPost[]> {
    const peerSet = new Set(peerPostIds);
    const conn = await db.getConnection();
    const rows = await conn.getAllAsync<PostRow>(
      `
      SELECT id, authorKeyHash, content, tag, timestamp, expiresAt
      FROM posts
      WHERE expiresAt > ?
      ORDER BY timestamp DESC
      `,
      [Date.now()]
    );
    return rows.filter((row) => !peerSet.has(row.id));
  }

  async pruneExpired(): Promise<void> {
    const conn = await db.getConnection();
    await conn.runAsync(`DELETE FROM posts WHERE expiresAt <= ?`, [Date.now()]);
  }
}

export const bulletinBoard = new BulletinBoard();
