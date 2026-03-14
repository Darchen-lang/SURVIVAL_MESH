import { db } from './Database';

export type MapPin = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  notes?: string | null;
  createdAt: number;
};

type MapPinRow = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  notes: string | null;
  createdAt: number;
};

export class MapPinStore {
  async addPin(label: string, lat: number, lng: number, notes?: string): Promise<MapPin> {
    const now = Date.now();
    const pin: MapPin = {
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      label: label.trim(),
      lat,
      lng,
      notes: notes?.trim() || null,
      createdAt: now,
    };

    const conn = await db.getConnection();
    await conn.runAsync(
      `
      INSERT OR REPLACE INTO map_pins (id, label, lat, lng, notes, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [pin.id, pin.label, pin.lat, pin.lng, pin.notes ?? null, pin.createdAt]
    );

    return pin;
  }

  async listPins(limit = 200): Promise<MapPin[]> {
    const conn = await db.getConnection();
    const rows = await conn.getAllAsync<MapPinRow>(
      `
      SELECT id, label, lat, lng, notes, createdAt
      FROM map_pins
      ORDER BY createdAt DESC
      LIMIT ?
      `,
      [limit]
    );

    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      lat: row.lat,
      lng: row.lng,
      notes: row.notes,
      createdAt: row.createdAt,
    }));
  }

  async deletePin(id: string): Promise<void> {
    const conn = await db.getConnection();
    await conn.runAsync(`DELETE FROM map_pins WHERE id = ?`, [id]);
  }
}

export const mapPinStore = new MapPinStore();
