import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { mapPinStore, type MapPin } from '../storage/MapPins';
import {
  CancelSignal,
  clearCache,
  downloadRegion,
  getCacheSize,
  getTilesForBounds,
} from '../storage/TileCache';

const USER_AGENT = 'SurvivalMesh/1.0 (offline map app)';
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209, zoom: 13 };
const TILE_DIR = `${FileSystem.documentDirectory}tiles`;

// Read a cached tile as base64 — returns null if not cached
async function readTileBase64(z: number, x: number, y: number): Promise<string | null> {
  const path = `${TILE_DIR}/${z}/${x}/${y}.png`;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return null;
  }
}

const htmlTemplate = (
  defaultLat: number,
  defaultLng: number,
  defaultZoom: number,
  leafletCss: string,
  leafletJs: string
) => `
<!doctype html>
<html>
<head>
  <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
  <link rel="stylesheet" href="${leafletCss}" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #080e16; }
    #map { width: 100%; height: 100%; }
    .leaflet-container { background: #0c1622; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="${leafletJs}"></script>
  <script>
    const RN = window.ReactNativeWebView;

    function makeTileUrl(z, x, y) {
      return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
    }

    // Pending tile requests waiting for RN to return base64 data
    const pendingTiles = {};

    // Called by RN via injectJavaScript after reading tile from file system
    function tileCallback(id, dataUri) {
      const pending = pendingTiles[id];
      if (!pending) return;
      delete pendingTiles[id];
      const parts = id.split('_');
      const z = +parts[0], x = +parts[1], y = +parts[2];
      if (dataUri) {
        pending.tile.onload = () => pending.done(null, pending.tile);
        pending.tile.onerror = () => pending.done(null, pending.tile);
        pending.tile.src = dataUri;
      } else {
        // Not cached — fall back to OSM online
        pending.tile.onload = () => pending.done(null, pending.tile);
        pending.tile.onerror = () => pending.done(null, pending.tile);
        pending.tile.src = makeTileUrl(z, x, y);
      }
    }

    // Custom tile layer — asks RN for each tile via postMessage bridge
    const BridgeTileLayer = L.TileLayer.extend({
      createTile: function(coords, done) {
        const tile = document.createElement('img');
        tile.alt = '';
        const id = coords.z + '_' + coords.x + '_' + coords.y + '_' + Date.now();
        pendingTiles[id] = { tile, done };
        try {
          RN.postMessage(JSON.stringify({ type: 'GET_TILE', z: coords.z, x: coords.x, y: coords.y, id }));
        } catch (_) {
          tile.src = makeTileUrl(coords.z, coords.x, coords.y);
        }
        return tile;
      }
    });

    const map = L.map('map', { zoomControl: false, preferCanvas: true })
      .setView([${defaultLat}, ${defaultLng}], ${defaultZoom});

    new BridgeTileLayer('', { maxZoom: 19 }).addTo(map);

    const pinsLayer = L.layerGroup().addTo(map);
    let userMarker = L.circleMarker([${defaultLat}, ${defaultLng}], {
      radius: 6, color: '#45d787', fillColor: '#45d787', fillOpacity: 0.9
    }).addTo(map);

    // Long-press to drop pin
    let longPressTimer = null;
    map.on('mousedown touchstart', (e) => {
      longPressTimer = setTimeout(() => {
        RN.postMessage(JSON.stringify({ type: 'DROP_PIN', lat: e.latlng.lat, lng: e.latlng.lng }));
      }, 600);
    });
    map.on('mouseup touchend touchcancel mousemove', () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    });

    // Region selection — mouse
    let selecting = false;
    let selectStart = null;
    let selectRect = null;

    function startSelect() {
      selecting = true;
      selectStart = null;
      if (selectRect) { map.removeLayer(selectRect); selectRect = null; }
      try { RN.postMessage(JSON.stringify({ type: 'SELECT_START' })); } catch (_) {}
    }

    map.on('mousedown', (e) => {
      if (!selecting) return;
      selectStart = e.latlng;
      if (selectRect) { map.removeLayer(selectRect); selectRect = null; }
    });
    map.on('mousemove', (e) => {
      if (!selecting || !selectStart) return;
      const bounds = L.latLngBounds(selectStart, e.latlng);
      if (!selectRect) selectRect = L.rectangle(bounds, { color: '#4da3ff', weight: 1, fillOpacity: 0.1 }).addTo(map);
      else selectRect.setBounds(bounds);
    });
    map.on('mouseup', (e) => {
      if (!selecting || !selectStart) return;
      const bounds = L.latLngBounds(selectStart, e.latlng);
      const sw = bounds.getSouthWest(); const ne = bounds.getNorthEast();
      RN.postMessage(JSON.stringify({ type: 'DOWNLOAD_REGION', minLat: sw.lat, maxLat: ne.lat, minLng: sw.lng, maxLng: ne.lng }));
      selecting = false; selectStart = null;
      try { RN.postMessage(JSON.stringify({ type: 'SELECT_END' })); } catch (_) {}
    });

    // Region selection — touch
    map.on('touchstart', (e) => {
      if (!selecting) return;
      const t = e.originalEvent.touches[0];
      selectStart = map.containerPointToLatLng([t.clientX, t.clientY]);
    });
    map.on('touchmove', (e) => {
      if (!selecting || !selectStart) return;
      const t = e.originalEvent.touches[0];
      const ll = map.containerPointToLatLng([t.clientX, t.clientY]);
      if (selectRect) map.removeLayer(selectRect);
      selectRect = L.rectangle([selectStart, ll], { color: '#4da3ff', weight: 1, fillOpacity: 0.1 }).addTo(map);
    });
    map.on('touchend', (e) => {
      if (!selecting || !selectStart) return;
      const t = e.originalEvent.changedTouches[0];
      const ll = map.containerPointToLatLng([t.clientX, t.clientY]);
      const bounds = L.latLngBounds(selectStart, ll);
      const sw = bounds.getSouthWest(); const ne = bounds.getNorthEast();
      RN.postMessage(JSON.stringify({ type: 'DOWNLOAD_REGION', minLat: sw.lat, maxLat: ne.lat, minLng: sw.lng, maxLng: ne.lng }));
      selecting = false; selectStart = null;
      if (selectRect) { map.removeLayer(selectRect); selectRect = null; }
      try { RN.postMessage(JSON.stringify({ type: 'SELECT_END' })); } catch (_) {}
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      RN.postMessage(JSON.stringify({ type: 'MAP_MOVED', lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
    });

    function setPins(pins) {
      pinsLayer.clearLayers();
      pins.forEach((p) => {
        L.circleMarker([p.lat, p.lng], { radius: 5, color: '#4da3ff', fillColor: '#4da3ff', fillOpacity: 0.9 })
          .addTo(pinsLayer)
          .bindTooltip(p.label || 'Pin', { permanent: false });
      });
    }

    function setLocation(lat, lng, zoom) {
      map.setView([lat, lng], zoom ?? map.getZoom());
      userMarker.setLatLng([lat, lng]);
    }

    function handleMessage(event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SET_LOCATION') setLocation(msg.lat, msg.lng, msg.zoom);
        else if (msg.type === 'SET_PINS') setPins(msg.pins || []);
        else if (msg.type === 'START_SELECT') startSelect();
      } catch (e) {}
    }

    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);

    window.addEventListener('error', (e) => {
      try { RN.postMessage(JSON.stringify({ type: 'WEB_ERROR', message: e.message || 'error' })); } catch (_) {}
    });

    RN.postMessage(JSON.stringify({ type: 'READY' }));
  </script>
</body>
</html>
`;

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

type MapMoved = { lat: number; lng: number; zoom: number };

type WebMessage =
  | { type: 'READY' }
  | { type: 'GET_TILE'; z: number; x: number; y: number; id: string }
  | { type: 'DROP_PIN'; lat: number; lng: number }
  | { type: 'DOWNLOAD_REGION'; minLat: number; maxLat: number; minLng: number; maxLng: number }
  | { type: 'MAP_MOVED'; lat: number; lng: number; zoom: number }
  | { type: 'WEB_ERROR'; message: string }
  | { type: 'TILE_OK'; z: number; x: number; y: number }
  | { type: 'TILE_FAIL'; z: number; x: number; y: number }
  | { type: 'SELECT_START' }
  | { type: 'SELECT_END' };

type RNToWeb =
  | { type: 'SET_LOCATION'; lat: number; lng: number; zoom?: number }
  | { type: 'SET_PINS'; pins: Array<{ lat: number; lng: number; label: string; notes?: string | null }> }
  | { type: 'START_SELECT' };

export default function MapScreen() {
  const webRef = useRef<WebView | null>(null);
  const [webReady, setWebReady] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const [tileStats, setTileStats] = useState<{ ok: number; fail: number }>({ ok: 0, fail: 0 });
  const [selecting, setSelecting] = useState(false);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [cacheSize, setCacheSize] = useState(0);
  const [progress, setProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
  const [downloading, setDownloading] = useState(false);
  const cancelRef = useRef<CancelSignal>({ cancelled: false });
  const [lastMapState, setLastMapState] = useState<MapMoved>(DEFAULT_CENTER);
  const [leafletUris, setLeafletUris] = useState<{ css: string; js: string; baseUrl: string } | null>(null);

  useEffect(() => {
    async function loadLeafletAssets() {
      try {
        const cssAsset = Asset.fromModule(require('../../assets/leaflet/leaflet.css'));
        const jsAsset = Asset.fromModule(require('../../assets/leaflet/leaflet.js'));
        await Promise.all([cssAsset.downloadAsync(), jsAsset.downloadAsync()]);
        const css = cssAsset.localUri ?? cssAsset.uri;
        const js = jsAsset.localUri ?? jsAsset.uri;
        const baseUrl = css.includes('/') ? css.slice(0, css.lastIndexOf('/') + 1) : '';
        setLeafletUris({ css, js, baseUrl });
      } catch {
        setLeafletUris({
          css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
          js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
          baseUrl: 'https://unpkg.com/leaflet@1.9.4/dist/',
        });
      }
    }
    void loadLeafletAssets();
  }, []);

  const html = useMemo(
    () =>
      leafletUris
        ? htmlTemplate(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, DEFAULT_CENTER.zoom, leafletUris.css, leafletUris.js)
        : null,
    [leafletUris]
  );

  useEffect(() => { if (html) setWebReady(false); }, [html]);

  useEffect(() => {
    void refreshPins();
    void refreshCacheSize();
  }, []);

  async function refreshPins() {
    const rows = await mapPinStore.listPins(50);
    setPins(rows);
    sendToWeb({ type: 'SET_PINS', pins: rows.map((p) => ({ lat: p.lat, lng: p.lng, label: p.label, notes: p.notes })) });
  }

  function sendToWeb(msg: RNToWeb) {
    if (!webRef.current) return;
    webRef.current.postMessage(JSON.stringify(msg));
  }

  async function handleMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as WebMessage;

      if (msg.type === 'READY') {
        setWebReady(true);
        setWebError(null);
        sendToWeb({ type: 'SET_PINS', pins: pins.map((p) => ({ lat: p.lat, lng: p.lng, label: p.label, notes: p.notes })) });

      } else if (msg.type === 'GET_TILE') {
        // KEY FIX: read tile from filesystem as base64, inject back into WebView
        const b64 = await readTileBase64(msg.z, msg.x, msg.y);
        const dataUri = b64 ? `data:image/png;base64,${b64}` : null;
        if (b64) setTileStats((s) => ({ ok: s.ok + 1, fail: s.fail }));
        webRef.current?.injectJavaScript(
          `tileCallback(${JSON.stringify(msg.id)}, ${JSON.stringify(dataUri)});true;`
        );

      } else if (msg.type === 'MAP_MOVED') {
        setLastMapState({ lat: msg.lat, lng: msg.lng, zoom: msg.zoom });

      } else if (msg.type === 'DROP_PIN') {
        const label = `Pin ${new Date().toLocaleTimeString()}`;
        await mapPinStore.addPin(label, msg.lat, msg.lng, null);
        await refreshPins();

      } else if (msg.type === 'DOWNLOAD_REGION') {
        await startRegionDownload(msg.minLat, msg.maxLat, msg.minLng, msg.maxLng, 10, 16);

      } else if (msg.type === 'WEB_ERROR') {
        setWebError(msg.message);
        setWebReady(true);

      } else if (msg.type === 'TILE_FAIL') {
        setTileStats((s) => ({ ok: s.ok, fail: s.fail + 1 }));

      } else if (msg.type === 'SELECT_START') {
        setSelecting(true);

      } else if (msg.type === 'SELECT_END') {
        setSelecting(false);
      }
    } catch {
      // ignore parse errors
    }
  }

  async function centerOnLocation() {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Location denied', 'Cannot fetch current location without permission.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      sendToWeb({ type: 'SET_LOCATION', lat: loc.coords.latitude, lng: loc.coords.longitude, zoom: 15 });
    } catch {
      Alert.alert('Location error', 'Could not get current location.');
    }
  }

  async function startAutoDownload() {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Location denied', 'Cannot auto-download without location.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      const delta = 0.15;
      await startRegionDownload(latitude - delta, latitude + delta, longitude - delta, longitude + delta, 10, 15);
    } catch {
      Alert.alert('Download error', 'Could not start auto-download.');
    }
  }

  async function startRegionDownload(
    minLat: number, maxLat: number, minLng: number, maxLng: number,
    minZoom: number, maxZoom: number
  ) {
    cancelRef.current.cancelled = false;
    const tiles = getTilesForBounds(minLat, maxLat, minLng, maxLng, minZoom, maxZoom);
    if (tiles.length === 0) { Alert.alert('No tiles', 'Region is too small.'); return; }
    setDownloading(true);
    setProgress({ completed: 0, total: tiles.length });
    const result = await downloadRegion(
      minLat, maxLat, minLng, maxLng, minZoom, maxZoom,
      (completed, total) => setProgress({ completed, total }),
      cancelRef.current
    );
    setDownloading(false);
    setProgress({ completed: result.completed, total: result.total });
    await refreshCacheSize();
  }

  async function refreshCacheSize() {
    setCacheSize(await getCacheSize());
  }

  function clearTiles() {
    Alert.alert('Clear cache', 'Delete all saved map tiles?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        await clearCache();
        await refreshCacheSize();
        setTileStats({ ok: 0, fail: 0 });
      }},
    ]);
  }

  const progressLabel = `${Math.round((progress.completed / Math.max(progress.total, 1)) * 100)}% (${progress.completed}/${progress.total})`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <WebView
          ref={webRef}
          source={{ html: html ?? '<html><body>Loading…</body></html>', baseUrl: leafletUris?.baseUrl }}
          originWhitelist={['*']}
          style={styles.webview}
          onMessage={handleMessage}
          onLoadEnd={() => { if (leafletUris) setWebReady(true); }}
          onError={(e) => { setWebError(e.nativeEvent.description || 'WebView error'); setWebReady(true); }}
          onHttpError={(e) => { setWebError(`HTTP ${e.nativeEvent.statusCode}`); setWebReady(true); }}
          startInLoadingState
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowUniversalAccessFromFileURLs
          mixedContentMode="always"
          cacheEnabled={false}
        />

        {!webReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#7ad7ff" size="large" />
            <Text style={styles.loadingText}>Loading map…</Text>
          </View>
        )}

        <View style={styles.debugBadge} pointerEvents="none">
          <Text style={styles.debugText}>✓ {tileStats.ok}  ✗ {tileStats.fail}</Text>
          <Text style={styles.debugText}>{lastMapState.lat.toFixed(3)}, {lastMapState.lng.toFixed(3)} z{lastMapState.zoom}</Text>
          {selecting && <Text style={styles.debugText}>SELECT MODE</Text>}
        </View>
      </View>

      <View style={styles.controlsRow}>
        <Pressable style={styles.btn} onPress={() => void centerOnLocation()}>
          <Text style={styles.btnText}>GPS</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => void startAutoDownload()} disabled={downloading}>
          <Text style={styles.btnText}>{downloading ? 'Downloading…' : 'Auto-download'}</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => sendToWeb({ type: 'START_SELECT' })} disabled={downloading}>
          <Text style={styles.btnText}>Select Region</Text>
        </Pressable>
        {downloading && (
          <Pressable style={styles.cancelBtn} onPress={() => { cancelRef.current.cancelled = true; }}>
            <Text style={styles.btnText}>Cancel</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          {downloading ? `Downloading: ${progressLabel}` : `Last: ${progressLabel} · Cache: ${formatBytes(cacheSize)}`}
        </Text>
        <Pressable style={styles.clearBtn} onPress={clearTiles}>
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      </View>

      <View style={styles.pinList}>
        <Text style={styles.pinTitle}>Recent Pins</Text>
        {pins.length === 0 && <Text style={styles.pinEmpty}>Long-press map to drop a pin.</Text>}
        {pins.slice(0, 3).map((pin) => (
          <View key={pin.id} style={styles.pinRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pinLabel}>{pin.label}</Text>
              <Text style={styles.pinMeta}>{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</Text>
            </View>
            <Pressable style={styles.deleteBtn} onPress={async () => {
              await mapPinStore.deletePin(pin.id);
              await refreshPins();
            }}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080e16' },
  mapContainer: { flex: 1, position: 'relative' },
  webview: { flex: 1, backgroundColor: '#080e16' },
  loadingOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8,14,22,0.85)',
  },
  loadingText: { color: '#d8e8ff', marginTop: 8 },
  debugBadge: {
    position: 'absolute', left: 8, top: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8,
  },
  debugText: { color: '#b6c8e0', fontSize: 11 },
  controlsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#0a111b', borderTopWidth: 1, borderColor: '#142133',
  },
  btn: {
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#12304a', borderWidth: 1, borderColor: '#1f4464',
  },
  btnText: { color: '#d7ecff', fontWeight: '700', fontSize: 12 },
  cancelBtn: {
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#4d3030', borderWidth: 1, borderColor: '#6a4040',
  },
  progressRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#0a111b',
  },
  progressText: { color: '#c6d8f2', fontSize: 11, flex: 1 },
  clearBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
    backgroundColor: '#2d1f1f', borderWidth: 1, borderColor: '#4a2c2c',
  },
  clearText: { color: '#f7d7d7', fontWeight: '700', fontSize: 12 },
  pinList: {
    paddingHorizontal: 12, paddingBottom: 12, backgroundColor: '#0a111b',
    borderTopWidth: 1, borderColor: '#142133',
  },
  pinTitle: { color: '#d8e8ff', fontWeight: '800', marginBottom: 6, marginTop: 8 },
  pinEmpty: { color: '#8ea0b8', fontSize: 12 },
  pinRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#1e2c3d', backgroundColor: '#101926',
    borderRadius: 10, padding: 10, marginTop: 6,
  },
  pinLabel: { color: '#e4f0ff', fontWeight: '700' },
  pinMeta: { color: '#9ab1ce', fontSize: 11, marginTop: 2 },
  deleteBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#3d1f1f', borderWidth: 1, borderColor: '#5a2d2d',
  },
  deleteText: { color: '#f5cccc', fontWeight: '700', fontSize: 12 },
});