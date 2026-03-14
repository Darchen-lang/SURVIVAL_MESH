import * as Location from 'expo-location';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { db } from './Database';

const PACK_NAME = 'survivalmesh-offline-pack-v1';
const STYLE_URL = 'https://demotiles.maplibre.org/style.json';
const DEFAULT_CENTER: [number, number] = [77.209, 28.6139]; // [lng, lat]
const MIN_ZOOM = 10;
const MAX_ZOOM = 16;
const DELTA = 0.18; // ~20 km radius
const SIGNIFICANT_MOVE_DEG = 0.05; // ~5.5 km

type OfflineMapStatus = {
    state: 'idle' | 'locating' | 'downloading' | 'ready' | 'error';
    progress: number; // 0-100
    tileCount: number;
    error?: string;
};

type StatusListener = (status: OfflineMapStatus) => void;

type OfflineMapMetaRow = {
    id: string;
    centerLat: number;
    centerLng: number;
    minZoom: number;
    maxZoom: number;
    delta: number;
    downloadedAt: number;
    tileCount: number;
};

function toBounds(lat: number, lng: number, delta: number): [GeoJSON.Position, GeoJSON.Position] {
    return [
        [lng + delta, lat + delta], // NE
        [lng - delta, lat - delta], // SW
    ];
}

function hasMoved(prevLat: number, prevLng: number, newLat: number, newLng: number): boolean {
    return (
        Math.abs(prevLat - newLat) > SIGNIFICANT_MOVE_DEG ||
        Math.abs(prevLng - newLng) > SIGNIFICANT_MOVE_DEG
    );
}

class OfflineMapManager {
    private status: OfflineMapStatus = {
        state: 'idle',
        progress: 0,
        tileCount: 0,
    };

    private listeners = new Set<StatusListener>();
    private initStarted = false;

    /** Subscribe to status updates. Returns unsubscribe function. */
    subscribe(listener: StatusListener): () => void {
        this.listeners.add(listener);
        // Immediately emit current status.
        listener(this.status);
        return () => this.listeners.delete(listener);
    }

    getStatus(): OfflineMapStatus {
        return { ...this.status };
    }

    /**
     * Called once on app launch (after unlock).
     * Gets current location, checks if existing pack is still nearby,
     * and downloads new tiles if needed.
     */
    async init(): Promise<void> {
        if (this.initStarted) {
            return;
        }
        this.initStarted = true;

        try {
            // 1. Check if an existing pack is already fully downloaded and recent.
            const existing = await this.loadMeta();
            const existingPack = await this.getExistingPack();

            if (existingPack) {
                const packStatus = await existingPack.status();
                if (packStatus.percentage >= 99) {
                    // Pack exists and is complete. Check if we've moved significantly.
                    const currentCoords = await this.resolveLocation();
                    if (
                        existing &&
                        !hasMoved(existing.centerLat, existing.centerLng, currentCoords[1], currentCoords[0])
                    ) {
                        // Still in the same area — we're good.
                        this.setStatus({
                            state: 'ready',
                            progress: 100,
                            tileCount: packStatus.completedTileCount ?? existing.tileCount,
                        });
                        return;
                    }
                    // Location changed significantly — delete and re-download below.
                    await this.safeDeletePack();
                } else if (packStatus.percentage > 0) {
                    // Partial download — resume it.
                    this.setStatus({ state: 'downloading', progress: Math.round(packStatus.percentage), tileCount: 0 });
                    await existingPack.resume();
                    this.monitorPack();
                    return;
                } else {
                    // FIX: Pack exists but 0% — stuck/corrupt. Delete it so createPack won't throw.
                    await this.safeDeletePack();
                }
            }

            // 2. Download fresh tiles for current location.
            this.setStatus({ state: 'locating', progress: 0, tileCount: 0 });
            const [lng, lat] = await this.resolveLocation();

            this.setStatus({ state: 'downloading', progress: 0, tileCount: 0 });

            // FIX: Always ensure the pack doesn't exist before creating.
            // This prevents "pack already exists" error on repeated init calls.
            await this.safeDeletePack();

            await MapLibreGL.OfflineManager.createPack(
                {
                    name: PACK_NAME,
                    styleURL: STYLE_URL,
                    minZoom: MIN_ZOOM,
                    maxZoom: MAX_ZOOM,
                    bounds: toBounds(lat, lng, DELTA),
                    metadata: { createdAt: Date.now(), region: 'auto-current-area' },
                },
                (_pack, status) => {
                    const pct = Math.round(status.percentage);
                    if (status.percentage >= 99) {
                        this.setStatus({ state: 'ready', progress: 100, tileCount: status.completedTileCount ?? 0 });
                        void this.saveMeta(lat, lng, status.completedTileCount ?? 0);
                    } else {
                        this.setStatus({ state: 'downloading', progress: pct, tileCount: 0 });
                    }
                },
                (_pack, err) => {
                    this.setStatus({ state: 'error', progress: 0, tileCount: 0, error: err.message });
                }
            );
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Offline map setup failed.';
            this.setStatus({ state: 'error', progress: 0, tileCount: 0, error: msg });
            this.initStarted = false; // Allow retry.
        }
    }

    /** Force re-download tiles for the current location. */
    async forceRefresh(): Promise<void> {
        this.initStarted = false;
        await this.safeDeletePack();
        await this.init();
    }

    // ── Private helpers ──────────────────────────────────────────────

    /**
     * FIX: Safely delete the pack — swallows all errors including
     * "pack does not exist" so callers never have to worry.
     */
    private async safeDeletePack(): Promise<void> {
        try {
            await MapLibreGL.OfflineManager.deletePack(PACK_NAME);
        } catch {
            // Pack may not exist — that's fine.
        }
    }

    private async resolveLocation(): Promise<[number, number]> {
        try {
            const perm = await Location.requestForegroundPermissionsAsync();
            if (perm.status !== 'granted') {
                return DEFAULT_CENTER;
            }
            const pos = await Location.getCurrentPositionAsync({});
            return [pos.coords.longitude, pos.coords.latitude];
        } catch {
            return DEFAULT_CENTER;
        }
    }

    private async getExistingPack() {
        try {
            return await MapLibreGL.OfflineManager.getPack(PACK_NAME);
        } catch {
            return null;
        }
    }

    private async monitorPack(): Promise<void> {
        // Poll-check the pack every 3 seconds until complete.
        const check = async () => {
            const pack = await this.getExistingPack();
            if (!pack) return;
            const s = await pack.status();
            if (s.percentage >= 99) {
                this.setStatus({ state: 'ready', progress: 100, tileCount: s.completedTileCount ?? 0 });
            } else {
                this.setStatus({ state: 'downloading', progress: Math.round(s.percentage), tileCount: 0 });
                setTimeout(() => void check(), 3000);
            }
        };
        await check();
    }

    private setStatus(next: OfflineMapStatus): void {
        this.status = next;
        this.listeners.forEach((fn) => fn(next));
    }

    private async loadMeta(): Promise<OfflineMapMetaRow | null> {
        try {
            const conn = await db.getConnection();
            const rows = await conn.getAllAsync<OfflineMapMetaRow>(
                `SELECT * FROM offline_map_meta WHERE id = ? LIMIT 1`,
                [PACK_NAME]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch {
            return null;
        }
    }

    private async saveMeta(lat: number, lng: number, tileCount: number): Promise<void> {
        try {
            const conn = await db.getConnection();
            await conn.runAsync(
                `INSERT OR REPLACE INTO offline_map_meta (id, centerLat, centerLng, minZoom, maxZoom, delta, downloadedAt, tileCount)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [PACK_NAME, lat, lng, MIN_ZOOM, MAX_ZOOM, DELTA, Date.now(), tileCount]
            );
        } catch {
            // Non-critical — the pack itself is the source of truth.
        }
    }
}

export const offlineMapManager = new OfflineMapManager();