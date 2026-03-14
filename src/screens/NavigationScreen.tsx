import { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { solarNavigator } from '../intelligence/SolarNavigator';

function normalizeHeading(rawX: number, rawY: number): number {
  const angle = (Math.atan2(rawY, rawX) * 180) / Math.PI;
  return (angle + 360) % 360;
}

export default function NavigationScreen() {
  const [heading, setHeading] = useState<number>(0);
  const [lat, setLat] = useState<number>(28.6139);
  const [lng, setLng] = useState<number>(77.209);
  const [latInput, setLatInput] = useState('28.6139');
  const [lngInput, setLngInput] = useState('77.2090');
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const sub = Magnetometer.addListener(({ x, y }) => {
      if (!mounted) {
        return;
      }
      setHeading(normalizeHeading(x, y));
    });

    Magnetometer.setUpdateInterval(350);

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  async function useLastKnownLocation(): Promise<void> {
    setError(null);
    setLocationLoading(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Location permission denied. Offline manual coordinates remain active.');
        return;
      }

      const last = await Location.getLastKnownPositionAsync();
      if (!last) {
        setError('No last-known location available.');
        return;
      }

      const nextLat = last.coords.latitude;
      const nextLng = last.coords.longitude;
      setLat(nextLat);
      setLng(nextLng);
      setLatInput(nextLat.toFixed(5));
      setLngInput(nextLng.toFixed(5));
    } catch {
      setError('Could not fetch location. Staying in offline mode.');
    } finally {
      setLocationLoading(false);
    }
  }

  function applyManualCoordinates(): void {
    const parsedLat = Number(latInput);
    const parsedLng = Number(lngInput);

    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      setError('Enter valid numeric latitude and longitude.');
      return;
    }

    setError(null);
    setLat(parsedLat);
    setLng(parsedLng);
  }

  const now = new Date();
  const sun = useMemo(() => solarNavigator.getSunPosition(now, lat, lng), [now, lat, lng]);
  const trueNorth = useMemo(() => solarNavigator.getTrueNorth(heading, now, lat, lng), [heading, now, lat, lng]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>SOLAR NAVIGATION</Text>
      <Text style={styles.sub}>Offline heading correction using magnetometer and solar model. Internet is not required.</Text>

      <View style={styles.card}>
        <Text style={styles.metricLabel}>Magnetic Heading</Text>
        <Text style={styles.metricValue}>{heading.toFixed(1)}°</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.metricLabel}>Sun Azimuth / Altitude</Text>
        <Text style={styles.metricValue}>
          {sun.azimuth.toFixed(1)}° / {sun.altitude.toFixed(1)}°
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.metricLabel}>Estimated True North</Text>
        <Text style={styles.metricValue}>{trueNorth.toFixed(1)}°</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.metricLabel}>Coordinates</Text>
        <Text style={styles.coord}>{lat.toFixed(5)}, {lng.toFixed(5)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.metricLabel}>Manual Coordinates (Offline)</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.coordInput}
            value={latInput}
            onChangeText={setLatInput}
            placeholder="Latitude"
            placeholderTextColor="#7890ad"
            keyboardType="numeric"
          />
          <TextInput
            style={styles.coordInput}
            value={lngInput}
            onChangeText={setLngInput}
            placeholder="Longitude"
            placeholderTextColor="#7890ad"
            keyboardType="numeric"
          />
        </View>
        <Pressable style={styles.manualBtn} onPress={applyManualCoordinates}>
          <Text style={styles.manualText}>Apply Manual Coordinates</Text>
        </Pressable>
      </View>

      <Pressable style={styles.calibrateBtn} onPress={() => setError('Point phone toward the sun and align heading manually.')}>
        <Text style={styles.calibrateText}>Point At Sun (Calibration Hint)</Text>
      </Pressable>

      <Pressable style={styles.optionalLocationBtn} onPress={() => void useLastKnownLocation()} disabled={locationLoading}>
        <Text style={styles.optionalLocationText}>{locationLoading ? 'Fetching...' : 'Use Last Known Location (Optional)'}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c1119', paddingHorizontal: 16, paddingTop: 12 },
  title: { color: '#9cd4ff', fontSize: 22, fontWeight: '900', letterSpacing: 1.1 },
  sub: { color: '#7f95b1', marginTop: 6, fontSize: 12 },
  card: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2d3d53',
    borderRadius: 12,
    backgroundColor: '#121a26',
    padding: 12,
  },
  metricLabel: { color: '#9bb0c8', fontSize: 12 },
  metricValue: { color: '#edf5ff', marginTop: 3, fontSize: 24, fontWeight: '800' },
  coord: { color: '#d7e5f7', marginTop: 3, fontSize: 16, fontWeight: '700' },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  coordInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#355070',
    borderRadius: 8,
    backgroundColor: '#101a28',
    color: '#e2ecfb',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  manualBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#5888bf',
    borderRadius: 8,
    backgroundColor: '#1c3960',
    paddingVertical: 8,
    alignItems: 'center',
  },
  manualText: { color: '#deebff', fontWeight: '700' },
  calibrateBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#4f6f96',
    borderRadius: 10,
    backgroundColor: '#1b3452',
    paddingVertical: 10,
    alignItems: 'center',
  },
  calibrateText: { color: '#dbeafe', fontWeight: '700' },
  optionalLocationBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#4b617f',
    borderRadius: 10,
    backgroundColor: '#182231',
    paddingVertical: 10,
    alignItems: 'center',
  },
  optionalLocationText: { color: '#ccdaef', fontWeight: '700' },
  error: { marginTop: 10, color: '#ffc2a0', fontSize: 12 },
});
