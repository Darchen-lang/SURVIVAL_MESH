import { db } from './Database';

export type MapPin = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  notes?: string | null;
  createdAt: number;
};

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureReady(): Promise<void> {
  await db.getConnection();
}

async function addPin(label: string, lat: number, lng: number, notes?: string | null): Promise<MapPin> {
  await ensureReady();
  const id = createId();
  const createdAt = Date.now();
  const database = await db.getConnection();
  await database.runAsync(
    'INSERT INTO map_pins (id, label, lat, lng, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?);',
    [id, label, lat, lng, notes ?? null, createdAt]
  );
  return { id, label, lat, lng, notes: notes ?? null, createdAt };
}

async function listPins(limit = 20): Promise<MapPin[]> {
  await ensureReady();
  const database = await db.getConnection();
  return database.getAllAsync<MapPin>(
    'SELECT id, label, lat, lng, notes, createdAt FROM map_pins ORDER BY createdAt DESC LIMIT ?;',
    [limit]
  );
}

async function deletePin(id: string): Promise<void> {
  await ensureReady();
  const database = await db.getConnection();
  await database.runAsync('DELETE FROM map_pins WHERE id = ?;', [id]);
}

export const mapPinStore = {
  addPin,
  listPins,
  deletePin,
};
