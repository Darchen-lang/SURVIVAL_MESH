import * as FileSystem from 'expo-file-system/legacy';

const USER_AGENT = 'SurvivalMesh/1.0 (offline map app)';
const TILE_DIR = `${FileSystem.documentDirectory}tiles`;
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export type TileCoord = { z: number; x: number; y: number };
export type CancelSignal = { cancelled: boolean };

function tilePath(z: number, x: number, y: number): string {
  return `${TILE_DIR}/${z}/${x}/${y}.png`;
}

async function ensureDir(path: string): Promise<void> {
  try {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  } catch {
    // ignore existing
  }
}

function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

export async function getTileUri(z: number, x: number, y: number): Promise<string> {
  const path = tilePath(z, x, y);
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) {
    return info.uri;
  }
  return TILE_URL.replace('{z}', `${z}`).replace('{x}', `${x}`).replace('{y}', `${y}`);
}

export async function downloadTile(z: number, x: number, y: number): Promise<void> {
  const targetPath = tilePath(z, x, y);
  const dir = targetPath.slice(0, targetPath.lastIndexOf('/'));
  await ensureDir(dir);
  const url = TILE_URL.replace('{z}', `${z}`).replace('{x}', `${x}`).replace('{y}', `${y}`);
  await FileSystem.downloadAsync(url, targetPath, { headers: { 'User-Agent': USER_AGENT } });
}

export function getTilesForBounds(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  minZoom: number,
  maxZoom: number
): TileCoord[] {
  const tiles: TileCoord[] = [];
  const clampedMinLat = Math.max(-85, Math.min(85, Math.min(minLat, maxLat)));
  const clampedMaxLat = Math.max(-85, Math.min(85, Math.max(minLat, maxLat)));
  const clampedMinLon = Math.max(-180, Math.min(180, Math.min(minLon, maxLon)));
  const clampedMaxLon = Math.max(-180, Math.min(180, Math.max(minLon, maxLon)));

  for (let z = minZoom; z <= maxZoom; z++) {
    const xStart = lon2tile(clampedMinLon, z);
    const xEnd = lon2tile(clampedMaxLon, z);
    const yStart = lat2tile(clampedMaxLat, z);
    const yEnd = lat2tile(clampedMinLat, z);
    for (let x = xStart; x <= xEnd; x++) {
      for (let y = yStart; y <= yEnd; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function downloadRegion(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  minZoom: number,
  maxZoom: number,
  onProgress?: (completed: number, total: number) => void,
  signal?: CancelSignal
): Promise<{ completed: number; total: number; cancelled: boolean }> {
  const tiles = getTilesForBounds(minLat, maxLat, minLon, maxLon, minZoom, maxZoom);
  const total = tiles.length;
  let completed = 0;
  const batchSize = 6;

  for (let i = 0; i < tiles.length; i += batchSize) {
    if (signal?.cancelled) break;
    const batch = tiles.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (t) => {
        if (signal?.cancelled) return;
        try {
          await downloadTile(t.z, t.x, t.y);
        } catch {
          // skip failures
        } finally {
          completed += 1;
          onProgress?.(completed, total);
        }
      })
    );
    if (signal?.cancelled) break;
    await sleep(100);
  }

  return { completed, total, cancelled: signal?.cancelled ?? false };
}

export async function getCacheSize(): Promise<number> {
  async function sizeOf(path: string): Promise<number> {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return 0;
    if (info.isDirectory) {
      const entries = await FileSystem.readDirectoryAsync(path);
      let sum = 0;
      for (const entry of entries) {
        sum += await sizeOf(`${path}/${entry}`);
      }
      return sum;
    }
    return info.size ?? 0;
  }
  return sizeOf(TILE_DIR);
}

export async function clearCache(): Promise<void> {
  const info = await FileSystem.getInfoAsync(TILE_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(TILE_DIR, { idempotent: true });
  }
}

export async function readTileBase64(z: number, x: number, y: number): Promise<string | null> {
  const path = tilePath(z, x, y);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  try {
    return await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
  } catch {
    return null;
  }
}
