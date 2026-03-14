// At the very top of the useEffect in MeshScreen.tsx
import { NativeModules } from 'react-native';
console.log('BleMesh module:', NativeModules.BleMesh);
import { useEffect, useRef, useState } from 'react';
import type { Permission } from 'react-native';
import {
  AppState,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  const [scanStatus, setScanStatus] = useState<string>('Not scanning');
  const [blePermissionState, setBlePermissionState] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [bluetoothEnabled, setBluetoothEnabled] = useState<'unknown' | 'enabled' | 'disabled'>('unknown');

  function getRequiredBlePermissions(): Permission[] {
    if (Platform.OS !== 'android') {
      return [];
    }

    const sdk = Number(Platform.Version);
    return sdk >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  }

  async function checkBlePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      setBlePermissionState('granted');
      return true;
    }

    const perms = getRequiredBlePermissions();
    const checks = await Promise.all(perms.map((perm) => PermissionsAndroid.check(perm)));
    const ok = checks.every(Boolean);
    setBlePermissionState(ok ? 'granted' : 'denied');
    return ok;
  }

  async function ensureBlePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      setBlePermissionState('granted');
      return true;
    }

    const perms = getRequiredBlePermissions();

    const results = await PermissionsAndroid.requestMultiple(perms);
    const ok = perms.every((p) => results[p] === PermissionsAndroid.RESULTS.GRANTED);
    setBlePermissionState(ok ? 'granted' : 'denied');
    return ok;
  }

  async function requestMeshPermissions(): Promise<void> {
    try {
      const ok = await ensureBlePermissions();
      if (ok) {
        setScanStatus('Permissions granted. You can scan for peers now.');
      } else {
        setScanStatus('Permissions denied. Enable Nearby devices permission in app settings.');
      }
    } catch (e) {
      setScanStatus('Permission error: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function openAppSettings(): Promise<void> {
    try {
      await Linking.openSettings();
      setScanStatus('Opened app settings. Enable Nearby devices and return to app.');
    } catch (e) {
      setScanStatus('Could not open settings: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function checkBluetoothEnabled(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      setBluetoothEnabled('enabled');
      return true;
    }

    try {
      const bleMesh = NativeModules.BleMesh;
      if (!bleMesh) {
        setBluetoothEnabled('unknown');
        return false;
      }

      // Check if Bluetooth is enabled via native module
      const enabled = await bleMesh.isBluetoothEnabled();
      setBluetoothEnabled(enabled ? 'enabled' : 'disabled');
      return enabled;
    } catch (e) {
      console.warn('Could not check Bluetooth state:', e);
      setBluetoothEnabled('unknown');
      return false;
    }
  }

  async function openBluetoothSettings(): Promise<void> {
    try {
      if (Platform.OS === 'android') {
        // Try to enable Bluetooth via native module (shows system dialog)
        const bleMesh = NativeModules.BleMesh;
        if (bleMesh && bleMesh.enableBluetooth) {
          await bleMesh.enableBluetooth();
          setScanStatus('Check the system dialog to enable Bluetooth...');
          return;
        }
      }
      
      // Fallback: open settings
      await Linking.openSettings();
      setScanStatus('Opened app settings. Enable Bluetooth and return to app.');
    } catch (e) {
      setScanStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        // First check if Bluetooth is enabled
        const btEnabled = await checkBluetoothEnabled();
        if (!btEnabled) {
          setScanStatus('Bluetooth is disabled. Enable Bluetooth to use mesh features.');
          return;
        }

        const hasPermissions = await checkBlePermissions();
        const ok = hasPermissions ? true : await ensureBlePermissions();
        if (!ok) {
          setScanStatus('BLE permissions denied. Allow Nearby devices permissions and retry.');
          return;
        }

        await meshRouter.advertise();
        await meshRouter.startScanning();
        setScanStatus('Scanning for peers...');
      } catch (e) {
        setScanStatus('BLE error: ' + (e instanceof Error ? e.message : String(e)));
      }
    })();

    void refreshBeaconState();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void checkBlePermissions();
        void checkBluetoothEnabled();
      }
    });

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
      appStateSub.remove();
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

    // Simulate a visible hop on the visualizer using the self node
    if (nodes.length > 1) {
      const randomPeer = nodes[Math.floor(Math.random() * (nodes.length - 1)) + 1];
      visualizerRef.current?.animateHop('self', randomPeer.id);
    } else {
      // No peers yet — animate a self-pulse by hopping to self
      setNodes((prev) => prev); // trigger re-render
      visualizerRef.current?.animateHop('self', 'self');
    }
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
      <Text style={[styles.sub, { color: '#ffcc00', marginTop: 4 }]}>{scanStatus}</Text>
      <Text
        style={[
          styles.permissionStatus,
          bluetoothEnabled === 'enabled'
            ? styles.permissionGranted
            : bluetoothEnabled === 'disabled'
              ? styles.permissionDenied
              : styles.permissionUnknown,
        ]}
      >
        Bluetooth: {bluetoothEnabled === 'unknown' ? 'CHECKING' : bluetoothEnabled.toUpperCase()}
      </Text>
      <Text
        style={[
          styles.permissionStatus,
          blePermissionState === 'granted'
            ? styles.permissionGranted
            : blePermissionState === 'denied'
              ? styles.permissionDenied
              : styles.permissionUnknown,
        ]}
      >
        BLE Permission: {blePermissionState.toUpperCase()}
      </Text>
      <View style={styles.visualWrap}>
        <MeshVisualizer ref={visualizerRef} nodes={nodes} edges={edges} />
      </View>

      <Pressable style={styles.probeBtn} onPress={() => void triggerDemoHop()}>
        <Text style={styles.probeText}>Send Probe Packet</Text>
      </Pressable>

      {bluetoothEnabled === 'disabled' && (
        <Pressable style={styles.bluetoothBtn} onPress={() => void openBluetoothSettings()}>
          <Text style={styles.bluetoothText}>Enable Bluetooth</Text>
        </Pressable>
      )}

      <Pressable style={styles.permBtn} onPress={() => void requestMeshPermissions()}>
        <Text style={styles.permText}>Grant Mesh Permissions</Text>
      </Pressable>

      <Pressable style={styles.settingsBtn} onPress={() => void openAppSettings()}>
        <Text style={styles.settingsText}>Open App Settings</Text>
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
  permBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#486a8f',
    borderRadius: 10,
    backgroundColor: '#17304c',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  permText: {
    color: '#deefff',
    fontWeight: '700',
  },
  settingsBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#5e5e73',
    borderRadius: 10,
    backgroundColor: '#1c1f2c',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  settingsText: {
    color: '#e6e7ef',
    fontWeight: '700',
  },
  bluetoothBtn: {
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#ff6b6b',
    borderRadius: 10,
    backgroundColor: '#4a1f1f',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bluetoothText: {
    color: '#ff9999',
    fontWeight: '800',
    fontSize: 14,
  },
  permissionStatus: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  permissionGranted: {
    color: '#8effb0',
  },
  permissionDenied: {
    color: '#ff9e9e',
  },
  permissionUnknown: {
    color: '#c6d2df',
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