import { db } from '../storage/Database';
import type { MeshPacket } from '../types/mesh';

type Row = {
	id: string;
	ttl: number;
	senderId: string;
	payload: string;
	timestamp: number;
	delivered: number;
	type: 'message' | 'bulletin' | 'sos';
};

export class MessageQueue {
	async enqueue(packet: MeshPacket): Promise<void> {
		const conn = await db.getConnection();
		await conn.runAsync(
			`
			INSERT OR IGNORE INTO messages (id, ttl, senderId, payload, timestamp, delivered, type)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			`,
			[packet.id, packet.ttl, packet.senderId, packet.payload, packet.timestamp, 0, packet.type]
		);
	}

	async upsert(packet: MeshPacket, delivered = false): Promise<void> {
		const conn = await db.getConnection();
		await conn.runAsync(
			`
			INSERT INTO messages (id, ttl, senderId, payload, timestamp, delivered, type)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				ttl = excluded.ttl,
				senderId = excluded.senderId,
				payload = excluded.payload,
				timestamp = excluded.timestamp,
				delivered = CASE WHEN messages.delivered = 1 THEN 1 ELSE excluded.delivered END,
				type = excluded.type
			`,
			[packet.id, packet.ttl, packet.senderId, packet.payload, packet.timestamp, delivered ? 1 : 0, packet.type]
		);
	}

	async getAllMessageIds(): Promise<string[]> {
		const conn = await db.getConnection();
		const rows = await conn.getAllAsync<{ id: string }>(`SELECT id FROM messages`);
		return rows.map((r) => r.id);
	}

	async syncWith(peerId: string, peerMessageIds: string[]): Promise<MeshPacket[]> {
		void peerId;
		const peerSet = new Set(peerMessageIds);
		const conn = await db.getConnection();
		const rows = await conn.getAllAsync<Row>(
			`
			SELECT id, ttl, senderId, payload, timestamp, delivered, type
			FROM messages
			WHERE ttl > 0
			ORDER BY timestamp DESC
			LIMIT 500
			`
		);

		return rows
			.filter((r) => !peerSet.has(r.id))
			.map((r) => ({
				id: r.id,
				ttl: r.ttl,
				senderId: r.senderId,
				payload: r.payload,
				timestamp: r.timestamp,
				type: r.type,
			}));
	}

	async markDelivered(id: string): Promise<void> {
		const conn = await db.getConnection();
		await conn.runAsync(`UPDATE messages SET delivered = 1 WHERE id = ?`, [id]);
	}

	async delete(id: string): Promise<void> {
		const conn = await db.getConnection();
		await conn.runAsync(`DELETE FROM messages WHERE id = ?`, [id]);
	}

	async getAllMessages(limit = 300): Promise<MeshPacket[]> {
		const conn = await db.getConnection();
		const rows = await conn.getAllAsync<Row>(
			`
			SELECT id, ttl, senderId, payload, timestamp, delivered, type
			FROM messages
			ORDER BY timestamp DESC
			LIMIT ?
			`,
			[limit]
		);

		return rows.map((r) => ({
			id: r.id,
			ttl: r.ttl,
			senderId: r.senderId,
			payload: r.payload,
			timestamp: r.timestamp,
			type: r.type,
		}));
	}

	async clearAll(): Promise<void> {
		const conn = await db.getConnection();
		await conn.runAsync(`DELETE FROM messages`);
	}
}

export const messageQueue = new MessageQueue();

