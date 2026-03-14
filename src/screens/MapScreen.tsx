import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import { mapPinStore, type MapPin } from '../storage/MapPins';
import { offlineMapManager } from '../storage/OfflineMapManager';
import { geocoder } from '../intelligence/Geocoder';

type SearchResult = {
  name: string;
  lat: number;
  lng: number;
  city: string;
};

const STYLE_URL = 'https://demotiles.maplibre.org/style.json';
const DEFAULT_CENTER: [number, number] = [77.209, 28.6139]; // [lng, lat]
const DEFAULT_ZOOM = 13;

// Note: No access token needed for offline maps

export default function MapScreen() {
  const [pins, setPins] = useState<MapPin[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [offlineLabel, setOfflineLabel] = useState('Checking offline status…');
  const [offlineReady, setOfflineReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  async function refreshPins(): Promise<void> {
    const rows = await mapPinStore.listPins(200);
    setPins(rows);
  }

  async function resolveCurrentCenter(): Promise<[number, number]> {
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

  useEffect(() => {
    void (async () => {
      await refreshPins();
      const [lng, lat] = await resolveCurrentCenter();
      setCenter([lng, lat]);
      setMapReady(true);
    })();

    // Subscribe to OfflineMapManager status updates.
    const unsub = offlineMapManager.subscribe((status) => {
      switch (status.state) {
        case 'idle':
          setOfflineLabel('Offline region not downloaded yet.');
          setOfflineReady(false);
          break;
        case 'locating':
          setOfflineLabel('Getting your location…');
          setOfflineReady(false);
          break;
        case 'downloading':
          setOfflineLabel(`Downloading offline region: ${status.progress}%`);
          setOfflineReady(false);
          break;
        case 'ready':
          setOfflineLabel(`Offline region ready (${status.tileCount} tiles)`);
          setOfflineReady(true);
          break;
        case 'error':
          setOfflineLabel('Offline setup failed.');
          setOfflineReady(false);
          setError(status.error ?? 'Unknown error');
          break;
      }
    });

    // FIX: Increased delay from 100ms → 300ms so the native MapLibre view
    // fully initializes before Animated listeners are attached.
    // This prevents the "_listeners.forEach is not a function" crash.
    const timer = setTimeout(() => setMapReady(true), 300);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  async function handleForceRefresh(): Promise<void> {
    setRefreshing(true);
    setError(null);
    try {
      await offlineMapManager.forceRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSearch(query: string): Promise<void> {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setSearching(true);
    try {
      const results = await geocoder.search(query);
      setSearchResults(results);
      setShowSearchResults(true);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleSearchResultSelected(result: SearchResult): Promise<void> {
    setCenter([result.lng, result.lat]);
    setSearchQuery('');
    setShowSearchResults(false);
    setSearchResults([]);
  }

  async function onLongPressMap(event: unknown): Promise<void> {
    const e = event as { geometry?: { coordinates?: number[] } };
    const coords = e.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      return;
    }

    const [lng, lat] = coords;
    let label = noteDraft.trim();
    
    // Try reverse geocoding to fill in the location name
    if (!label) {
      try {
        const nearby = await geocoder.reverse(lat, lng);
        if (nearby?.name) {
          label = nearby.name;
        } else {
          label = `Pin ${new Date().toLocaleTimeString()}`;
        }
      } catch {
        label = `Pin ${new Date().toLocaleTimeString()}`;
      }
    }

    await mapPinStore.addPin(label, lat, lng, noteDraft.trim() || '');
    setNoteDraft('');
    await refreshPins();
  }

  async function removePin(id: string): Promise<void> {
    await mapPinStore.deletePin(id);
    await refreshPins();
  }

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pin_click') {
        // Add pin at clicked location
        const label = noteDraft.trim() || `Pin ${new Date().toLocaleTimeString()}`;
        
        // Try reverse geocoding
        let finalLabel = label;
        if (!noteDraft.trim()) {
          try {
            const nearby = await geocoder.reverse(data.lat, data.lng);
            if (nearby?.name) {
              finalLabel = nearby.name;
            }
          } catch {
            // Use default label
          }
        }

        await mapPinStore.addPin(finalLabel, data.lat, data.lng, noteDraft.trim() || '');
        setNoteDraft('');
        await refreshPins();
      }
    } catch {
      // Ignore parse errors
    }
  };

  // Generate HTML for the map
  const mapHTML = useMemo(() => {
    const pinsGeoJSON = pins.map((p) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat],
      },
      properties: {
        id: p.id,
        label: p.label,
        note: p.notes || p.label,
      },
    }));

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>
        body { margin: 0; padding: 0; }
        #map { position: absolute; top: 0; bottom: 0; width: 100%; }
        .info { padding: 6px 8px; font: 14px/16px Arial, Helvetica, sans-serif; background: white; background: rgba(255,255,255,0.8); box-shadow: 0 0 15px rgba(0,0,0,0.2); border-radius: 5px; }
        .info h4 { margin: 0 0 5px 0; color: #08519c; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
      <script>
        const map = L.map('map').setView([${center[1]}, ${center[0]}], ${DEFAULT_ZOOM});
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19
        }).addTo(map);

        // Add pins
        const pins = ${JSON.stringify(pinsGeoJSON)};
        pins.forEach(pin => {
          L.circleMarker([pin.geometry.coordinates[1], pin.geometry.coordinates[0]], {
            radius: 6,
            fillColor: "#1f7dff",
            color: "#d8ecff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
          }).bindPopup(pin.properties.label).addTo(map);
        });

        // Draw route between pins if more than 1
        if (pins.length > 1) {
          const latlngs = pins.map(p => [p.geometry.coordinates[1], p.geometry.coordinates[0]]);
          L.polyline(latlngs, { color: '#00c896', weight: 2, opacity: 0.5 }).addTo(map);
        }

        // User location
        const userMarker = L.circleMarker([${center[1]}, ${center[0]}], {
          radius: 6,
          fillColor: "#00ff88",
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(map);

        // Click to add pin - send message back to React Native
        map.on('click', function(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'pin_click',
            lat: e.latlng.lat,
            lng: e.latlng.lng
          }));
        });
      <\/script>
    </body>
    </html>
    `;
  }, [center, pins]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>OFFLINE FIELD MAP</Text>
      <Text style={styles.sub}>Map tiles auto-download on launch. Use offline anytime.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Offline Region</Text>
        <Text style={styles.reverse}>{offlineLabel}</Text>
        <View style={styles.row}>
          <Pressable style={styles.primaryBtn} onPress={() => void handleForceRefresh()} disabled={refreshing}>
            <Text style={styles.primaryText}>{refreshing ? 'Rebuilding…' : 'Rebuild Cache'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Search Landmarks</Text>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.input}
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Search streets, landmarks..."
            placeholderTextColor="#738aa6"
          />
          {searching && <ActivityIndicator size="small" color="#00c896" style={styles.searchSpinner} />}
        </View>
        {showSearchResults && searchResults.length > 0 && (
          <FlatList
            scrollEnabled={false}
            data={searchResults}
            keyExtractor={(item, idx) => `${item.lat}-${item.lng}-${idx}`}
            renderItem={({ item }) => (
              <Pressable
                style={styles.searchResultItem}
                onPress={() => handleSearchResultSelected(item)}
              >
                <Text style={styles.searchResultName}>{item.name}</Text>
                <Text style={styles.searchResultCity}>{item.city}</Text>
              </Pressable>
            )}
          />
        )}
        <Text style={styles.reverse}>Tap a result to center the map there.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Pin Note (for next long-press)</Text>
        <TextInput
          style={styles.input}
          value={noteDraft}
          onChangeText={setNoteDraft}
          placeholder="Optional note for next dropped pin"
          placeholderTextColor="#738aa6"
        />
        <Text style={styles.reverse}>Long-press on map to drop and persist a pin.</Text>
      </View>

      <View style={styles.mapWrap}>
        {mapReady ? (
          <WebView
            source={{ html: mapHTML }}
            style={styles.map}
            onMessage={handleWebViewMessage}
          />
        ) : (
          <View style={[styles.map, styles.mapLoading]}>
            <Text style={styles.reverse}>Loading map…</Text>
          </View>
        )}
      </View>

      {!offlineReady ? <Text style={styles.tip}>Tip: tiles auto-download when you launch the app with internet. The map works offline after that.</Text> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Saved Pins ({pins.length})</Text>
      <FlatList
        data={pins}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.pinCard}>
            <View style={styles.pinHeader}>
              <Text style={styles.pinTitle}>{item.label}</Text>
              <Pressable onPress={() => void removePin(item.id)}>
                <Text style={styles.delete}>Delete</Text>
              </Pressable>
            </View>
            <Text style={styles.pinCoord}>{item.lat.toFixed(5)}, {item.lng.toFixed(5)}</Text>
            {item.notes ? <Text style={styles.pinNotes}>{item.notes}</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No pins yet.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1218', paddingHorizontal: 16, paddingTop: 12 },
  title: { color: '#9dd0ff', fontSize: 22, fontWeight: '900', letterSpacing: 1.1 },
  sub: { marginTop: 6, color: '#8498b2', fontSize: 12 },
  mapWrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2a394d',
    borderRadius: 12,
    overflow: 'hidden',
  },
  map: {
    height: 240,
  },
  mapLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141c29',
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: '#1f7dff',
    borderWidth: 2,
    borderColor: '#d8ecff',
  },
  userDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: '#00ff88',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  card: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2a394d',
    borderRadius: 12,
    backgroundColor: '#141c29',
    padding: 10,
  },
  label: { color: '#dce8f8', fontWeight: '700', fontSize: 12 },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#39567a',
    borderRadius: 8,
    backgroundColor: '#101a28',
    color: '#e7f1ff',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchContainer: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  searchSpinner: {
    position: 'absolute',
    right: 10,
  },
  searchResultItem: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2a3a',
  },
  searchResultName: {
    color: '#00c896',
    fontWeight: '600',
    fontSize: 12,
  },
  searchResultCity: {
    color: '#8498b2',
    fontSize: 10,
    marginTop: 2,
  },
  row: { marginTop: 8, flexDirection: 'row', gap: 8 },
  reverse: { marginTop: 8, color: '#9eb5d1', fontSize: 12 },
  primaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4c8e71',
    borderRadius: 8,
    backgroundColor: '#1a4a39',
    alignItems: 'center',
    paddingVertical: 9,
  },
  primaryText: { color: '#ddffee', fontWeight: '800', fontSize: 12 },
  tip: { marginTop: 8, color: '#c7a84f', fontSize: 12 },
  error: { marginTop: 8, color: '#ffadad', fontSize: 12 },
  sectionTitle: { marginTop: 12, color: '#d8e6f8', fontWeight: '800' },
  list: { paddingBottom: 24 },
  pinCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2f3f55',
    borderRadius: 10,
    backgroundColor: '#121a25',
    padding: 10,
  },
  pinHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pinTitle: { color: '#e9f3ff', fontWeight: '800', fontSize: 14 },
  delete: { color: '#ff8f8f', fontWeight: '700', fontSize: 12 },
  pinCoord: { marginTop: 4, color: '#a9c0de', fontSize: 12 },
  pinNotes: { marginTop: 6, color: '#c8d7ea', fontSize: 12 },
  empty: { marginTop: 8, color: '#8598b2' },
});