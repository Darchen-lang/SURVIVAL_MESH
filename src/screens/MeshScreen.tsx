import { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import MeshVisualizer, { MeshVisualizerRef } from '../components/MeshVisualizer';
import { disableBeaconMode, enableBeaconMode, isBeaconModeEnabled } from '../mesh/BeaconMode';
import { meshRouter } from '../mesh/MeshRouter';
import type { MeshEdge, MeshNode } from '../types/mesh';

export default function MeshScreen() {
  const visualizerRef = useRef<MeshVisualizerRef>(null);
  const [nodes, setNodes] = useState<MeshNode[]>([
    { id: 'self', label: 'YOU', x: 170, y: 60, rssi: -40 },
  ]);
  const [edges, setEdges] = useState<MeshEdge[]>([]);
  const [beaconEnabled, setBeaconEnabled] = useState(false);
  const [beaconLoading, setBeaconLoading] = useState(true);
  const [beaconError, setBeaconError] = useState<string | null>(null);

  useEffect(() => {
    void meshRouter.advertise();
    void meshRouter.startScanning();
    void refreshBeaconState();

    const unsubConnected = meshRouter.on('peerConnected', ({ peerId }) => {
      setNodes((prev) => {
        if (prev.some((n) => n.id === peerId)) {
          return prev;
        }
        const index = prev.length;
        return [
          ...prev,
          {
            id: peerId,
            label: `N${index}`,
            x: 50 + ((index * 80) % 250),
            y: 120 + (Math.floor(index / 3) * 60),
            rssi: -62,
          },
        ];
      });

      setEdges((prev) => {
        if (prev.some((e) => e.from === 'self' && e.to === peerId)) {
          return prev;
        }
        return [...prev, { from: 'self', to: peerId }];
      });
    });

    const unsubForwarded = meshRouter.on('packetForwarded', ({ fromPeerId, toPeerIds }) => {
      const fromId = fromPeerId === 'self' ? 'self' : fromPeerId;
      toPeerIds.forEach((toId) => {
        visualizerRef.current?.animateHop(fromId, toId);
      });
    });

    return () => {
      unsubConnected();
      unsubForwarded();
      meshRouter.stopScanning();
      void meshRouter.disconnectAll();
    };
  }, []);

  async function refreshBeaconState(): Promise<void> {
    setBeaconLoading(true);
    setBeaconError(null);
    try {
      const enabled = await isBeaconModeEnabled();
      setBeaconEnabled(enabled);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read beacon state.';
      setBeaconError(message);
    } finally {
      setBeaconLoading(false);
    }
  }

  async function triggerDemoHop(): Promise<void> {
    await meshRouter.send('mesh probe', 'LOCAL01', 'sos', 2);
  }

  async function toggleBeacon(): Promise<void> {
    setBeaconLoading(true);
    setBeaconError(null);

    try {
      if (beaconEnabled) {
        await disableBeaconMode();
        setBeaconEnabled(false);
      } else {
        await enableBeaconMode();
        setBeaconEnabled(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update beacon mode.';
      setBeaconError(message);
    } finally {
      setBeaconLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>MESH NETWORK</Text>
      <Text style={styles.sub}>{Math.max(0, nodes.length - 1)} nodes detected</Text>

      <View style={styles.visualWrap}>
        <MeshVisualizer ref={visualizerRef} nodes={nodes} edges={edges} />
      </View>

      <Pressable style={styles.probeBtn} onPress={() => void triggerDemoHop()}>
        <Text style={styles.probeText}>Send Probe Packet</Text>
      </Pressable>

      <View style={styles.beaconCard}>
        <Text style={styles.beaconTitle}>Beacon Mode</Text>
        <Text style={styles.beaconSub}>
          {beaconEnabled ? 'Background mesh scan active every 60s' : 'Background mesh scan disabled'}
        </Text>
        <Text style={styles.beaconImpact}>Estimated battery impact: low to medium</Text>

        {beaconError ? <Text style={styles.beaconError}>{beaconError}</Text> : null}

        <Pressable
          style={[styles.beaconToggle, beaconEnabled ? styles.beaconOn : styles.beaconOff]}
          onPress={() => void toggleBeacon()}
          disabled={beaconLoading}
        >
          <Text style={styles.beaconToggleText}>
            {beaconLoading ? 'Working...' : beaconEnabled ? 'Disable Beacon Mode' : 'Enable Beacon Mode'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1118',
    alignItems: 'center',
  },
  title: {
    color: '#96fcb3',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 18,
  },
  sub: { color: '#8a9caf', fontSize: 13, marginTop: 6 },
  visualWrap: { marginTop: 16 },
  probeBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#415872',
    borderRadius: 10,
    backgroundColor: '#162433',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  probeText: {
    color: '#d6e7fb',
    fontWeight: '700',
  },
  beaconCard: {
    marginTop: 16,
    width: '92%',
    borderWidth: 1,
    borderColor: '#3a4b61',
    borderRadius: 12,
    backgroundColor: '#101a26',
    padding: 12,
  },
  beaconTitle: {
    color: '#f0f5ff',
    fontSize: 16,
    fontWeight: '800',
  },
  beaconSub: {
    marginTop: 6,
    color: '#a6b4c7',
    fontSize: 12,
  },
  beaconImpact: {
    marginTop: 4,
    color: '#8094ab',
    fontSize: 11,
  },
  beaconError: {
    marginTop: 8,
    color: '#ff9e9e',
    fontSize: 12,
  },
  beaconToggle: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  beaconOn: {
    borderColor: '#62b27d',
    backgroundColor: '#1f4731',
  },
  beaconOff: {
    borderColor: '#4d627e',
    backgroundColor: '#1b2a3b',
  },
  beaconToggleText: {
    color: '#e3ecfb',
    fontWeight: '700',
  },
});