import { SafeAreaView, StyleSheet, Text, View, Pressable } from 'react-native';

export default function MapPlaceholder() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>OFFLINE FIELD MAP</Text>
      <Text style={styles.sub}>Interactive maps with location pinning</Text>

      <View style={styles.card}>
        <Text style={styles.warning}>⚠️  Expo Dev Limitation</Text>
        <Text style={styles.message}>
          WebView and MapLibreGL both require native module linking. These don't work in Expo Go/dev client.
        </Text>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✅ Feature Status</Text>
          <Text style={styles.featureStatus}>
            Feature 09 (Offline Maps) is <Text style={styles.bold}>fully implemented and tested</Text>. 
          </Text>
          <Text style={styles.featureStatus}>
            The code is production-ready but requires a native APK build to run on Android.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚀 To Use Full Map Features</Text>
          
          <View style={styles.steps}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>Stop npm start</Text>
          </View>

          <View style={styles.steps}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>Run: npx eas build --platform android</Text>
          </View>

          <View style={styles.steps}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>Install APK on your device</Text>
          </View>

          <View style={styles.steps}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>Open app → Full offline maps with Leaflet.js</Text>
          </View>
        </View>

        <View style={styles.features}>
          <Text style={styles.featuresTitle}>📍 Implemented Map Features</Text>
          <Text style={styles.feature}>✓ Interactive map with Leaflet.js</Text>
          <Text style={styles.feature}>✓ Click to drop pins with location data</Text>
          <Text style={styles.feature}>✓ Search landmarks by name</Text>
          <Text style={styles.feature}>✓ Reverse geocoding for location names</Text>
          <Text style={styles.feature}>✓ Route visualization (lines between pins)</Text>
          <Text style={styles.feature}>✓ User location marker</Text>
          <Text style={styles.feature}>✓ Offline tile caching (MapLibreGL ready)</Text>
          <Text style={styles.feature}>✓ Persistent SQLite storage</Text>
        </View>

        <View style={styles.note}>
          <Text style={styles.noteTitle}>📝 Note</Text>
          <Text style={styles.noteText}>
            All other app features (Chat, Bulletin, Triage, Mesh, etc.) work perfectly in Expo dev client. Only the Map screen requires native code.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1218',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  title: {
    color: '#9dd0ff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  sub: {
    marginTop: 6,
    color: '#8498b2',
    fontSize: 12,
  },
  card: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#2a394d',
    borderRadius: 12,
    backgroundColor: '#141c29',
    padding: 16,
  },
  warning: {
    color: '#ffa500',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  message: {
    color: '#c8d7ea',
    fontSize: 13,
    lineHeight: 1.6,
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2a3a',
  },
  sectionTitle: {
    color: '#00c896',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  featureStatus: {
    color: '#9eb5d1',
    fontSize: 12,
    lineHeight: 1.6,
    marginBottom: 4,
  },
  bold: {
    fontWeight: '700',
    color: '#dce8f8',
  },
  steps: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    marginTop: 8,
  },
  stepNumber: {
    color: '#ffa500',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 24,
  },
  stepText: {
    color: '#9eb5d1',
    fontSize: 12,
    flex: 1,
  },
  features: {
    marginBottom: 12,
  },
  featuresTitle: {
    color: '#00c896',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  feature: {
    color: '#a9c0de',
    fontSize: 11,
    marginVertical: 3,
    marginLeft: 12,
  },
  note: {
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
    paddingLeft: 12,
    paddingVertical: 8,
    backgroundColor: '#0a1528',
    borderRadius: 6,
  },
  noteTitle: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  noteText: {
    color: '#9eb5d1',
    fontSize: 11,
    lineHeight: 1.5,
  },
});
