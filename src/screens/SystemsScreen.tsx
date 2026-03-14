import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AcousticTransfer, type AudioChunkSource, type GgWaveAdapter } from '../mesh/AcousticTransfer';
import { LoRaBridge, type UsbSerialAdapter } from '../mesh/LoRaBridge';
import { EncryptedDatabase, type KeyDeriver, type SqlCipherAdapter } from '../security/EncryptedDatabase';

class MockUsbSerialAdapter implements UsbSerialAdapter {
  private connectListeners = new Set<(deviceId: string) => void>();
  private disconnectListeners = new Set<(deviceId: string) => void>();
  private dataListeners = new Set<(chunk: string) => void>();
  private currentDeviceId: string | null = null;

  onDeviceConnected(cb: (deviceId: string) => void): () => void {
    this.connectListeners.add(cb);
    return () => this.connectListeners.delete(cb);
  }

  onDeviceDisconnected(cb: (deviceId: string) => void): () => void {
    this.disconnectListeners.add(cb);
    return () => this.disconnectListeners.delete(cb);
  }

  onData(cb: (chunk: string) => void): () => void {
    this.dataListeners.add(cb);
    return () => this.dataListeners.delete(cb);
  }

  async open(deviceId: string): Promise<void> {
    this.currentDeviceId = deviceId;
  }

  async write(text: string): Promise<void> {
    if (!this.currentDeviceId) {
      throw new Error('No mock LoRa device connected');
    }

    const cleaned = text.trim();
    if (!cleaned.startsWith('SEND:')) {
      return;
    }

    const payload = cleaned.slice(5);
    setTimeout(() => {
      this.dataListeners.forEach((listener) => listener(`RECV:${payload}\n`));
    }, 120);
  }

  simulateConnect(deviceId = 'MOCK-LORA-01'): void {
    this.connectListeners.forEach((listener) => listener(deviceId));
  }

  simulateDisconnect(): void {
    const id = this.currentDeviceId ?? 'MOCK-LORA-01';
    this.currentDeviceId = null;
    this.disconnectListeners.forEach((listener) => listener(id));
  }
}

class MockAudioChunkSource implements AudioChunkSource {
  private active = false;
  private onChunk: ((base64Chunk: string) => void) | null = null;

  async start(onChunk: (base64Chunk: string) => void): Promise<void> {
    this.active = true;
    this.onChunk = onChunk;
  }

  async stop(): Promise<void> {
    this.active = false;
    this.onChunk = null;
  }

  pushChunk(base64Chunk: string): void {
    if (this.active && this.onChunk) {
      this.onChunk(base64Chunk);
    }
  }
}

export default function SystemsScreen() {
  const [loraStatus, setLoraStatus] = useState('Idle');
  const [loraDraft, setLoraDraft] = useState('Test LoRa packet');
  const [loraEvents, setLoraEvents] = useState<string[]>([]);

  const [acousticStatus, setAcousticStatus] = useState('Not listening');
  const [acousticDraft, setAcousticDraft] = useState('Acoustic hello');
  const [acousticReceived, setAcousticReceived] = useState('');

  const [dbExpectedPin, setDbExpectedPin] = useState('2468');
  const [dbAttemptPin, setDbAttemptPin] = useState('');
  const [dbStatus, setDbStatus] = useState('Locked');
  const [dbWiped, setDbWiped] = useState(false);

  const expectedPinRef = useRef('2468');
  const mockSqlStateRef = useRef({ opened: false, wiped: false });

  const usbAdapter = useMemo(() => new MockUsbSerialAdapter(), []);
  const loraBridge = useMemo(() => new LoRaBridge(usbAdapter), [usbAdapter]);

  const audioSource = useMemo(() => new MockAudioChunkSource(), []);
  const ggwave = useMemo<GgWaveAdapter>(
    () => ({
      async encode(text: string): Promise<string> {
        return Buffer.from(text, 'utf8').toString('base64');
      },
      async decode(base64AudioChunk: string): Promise<string | null> {
        try {
          return Buffer.from(base64AudioChunk, 'base64').toString('utf8');
        } catch {
          return null;
        }
      },
    }),
    []
  );

  const acoustic = useMemo(
    () =>
      new AcousticTransfer(ggwave, audioSource, async (base64Wav) => {
        setTimeout(() => audioSource.pushChunk(base64Wav), 120);
      }),
    [audioSource, ggwave]
  );

  const sqlcipher = useMemo<SqlCipherAdapter>(
    () => ({
      async openDatabase(_name: string, key: string): Promise<void> {
        const expectedPrefix = `${expectedPinRef.current}:`;
        if (!key.startsWith(expectedPrefix)) {
          throw new Error('Wrong secure DB PIN');
        }
        if (mockSqlStateRef.current.wiped) {
          throw new Error('Database wiped after repeated failures');
        }
        mockSqlStateRef.current.opened = true;
      },
      async exec(sql: string): Promise<void> {
        if (sql.includes('DELETE FROM sqlite_master')) {
          mockSqlStateRef.current.wiped = true;
          mockSqlStateRef.current.opened = false;
        }
      },
      async close(): Promise<void> {
        mockSqlStateRef.current.opened = false;
      },
    }),
    []
  );

  const deriver = useMemo<KeyDeriver>(
    () => ({
      async derive(passphrase: string, salt: string): Promise<string> {
        return `${passphrase}:${salt}`;
      },
    }),
    []
  );

  const encryptedDb = useMemo(() => new EncryptedDatabase(sqlcipher, deriver), [sqlcipher, deriver]);

  useEffect(() => {
    loraBridge.startReading();
    const off = loraBridge.onEvent((event) => {
      if (event.type === 'connected') {
        setLoraStatus(`Connected (${event.deviceId})`);
      }
      if (event.type === 'disconnected') {
        setLoraStatus('Disconnected');
      }
      if (event.type === 'message') {
        setLoraEvents((prev) => [`RX: ${event.payload}`, ...prev].slice(0, 20));
      }
    });

    return () => {
      off();
      loraBridge.stopReading();
    };
  }, [loraBridge]);

  async function sendLoRa(): Promise<void> {
    try {
      await loraBridge.send(loraDraft);
      setLoraEvents((prev) => [`TX: ${loraDraft}`, ...prev].slice(0, 20));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'LoRa send failed';
      setLoraEvents((prev) => [`ERR: ${msg}`, ...prev].slice(0, 20));
    }
  }

  async function startAcoustic(): Promise<void> {
    await acoustic.startListening((decodedText) => {
      setAcousticReceived(decodedText);
    });
    setAcousticStatus('Listening (mock loopback)');
  }

  async function stopAcoustic(): Promise<void> {
    await acoustic.stopListening();
    setAcousticStatus('Stopped');
  }

  async function sendAcoustic(): Promise<void> {
    await acoustic.send(acousticDraft);
  }

  function applyExpectedPin(): void {
    if (!/^\d{4,6}$/.test(dbExpectedPin)) {
      setDbStatus('Expected PIN must be 4 to 6 digits');
      return;
    }
    expectedPinRef.current = dbExpectedPin;
    setDbStatus('Expected secure DB PIN updated');
  }

  async function tryUnlockDb(): Promise<void> {
    setDbStatus('Trying unlock...');
    try {
      await encryptedDb.open(dbAttemptPin);
      setDbStatus('Secure DB opened');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unlock failed';
      setDbStatus(msg);
    } finally {
      setDbWiped(mockSqlStateRef.current.wiped);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>SYSTEMS LAB</Text>
        <Text style={styles.sub}>Integration panel for remaining module-level features before hardware deployment.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>LoRa Bridge (Mock USB Serial)</Text>
          <Text style={styles.state}>Status: {loraStatus}</Text>
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={() => usbAdapter.simulateConnect()}>
              <Text style={styles.btnText}>Connect Mock</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => usbAdapter.simulateDisconnect()}>
              <Text style={styles.btnText}>Disconnect</Text>
            </Pressable>
          </View>
          <TextInput style={styles.input} value={loraDraft} onChangeText={setLoraDraft} placeholder="LoRa payload" placeholderTextColor="#7890aa" />
          <Pressable style={styles.btnPrimary} onPress={() => void sendLoRa()}>
            <Text style={styles.btnPrimaryText}>Send LoRa Packet</Text>
          </Pressable>
          <View style={styles.logBox}>
            {loraEvents.length === 0 ? <Text style={styles.logLine}>No events yet.</Text> : null}
            {loraEvents.map((line, idx) => (
              <Text key={`${line}-${idx}`} style={styles.logLine}>{line}</Text>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Acoustic Transfer (Mock GGWave Loopback)</Text>
          <Text style={styles.state}>Status: {acousticStatus}</Text>
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={() => void startAcoustic()}>
              <Text style={styles.btnText}>Start Listening</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => void stopAcoustic()}>
              <Text style={styles.btnText}>Stop</Text>
            </Pressable>
          </View>
          <TextInput style={styles.input} value={acousticDraft} onChangeText={setAcousticDraft} placeholder="Acoustic message" placeholderTextColor="#7890aa" />
          <Pressable style={styles.btnPrimary} onPress={() => void sendAcoustic()}>
            <Text style={styles.btnPrimaryText}>Send Acoustic</Text>
          </Pressable>
          <Text style={styles.state}>Last decoded: {acousticReceived || 'None'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Encrypted DB Behavior (Template Validation)</Text>
          <TextInput
            style={styles.input}
            value={dbExpectedPin}
            onChangeText={setDbExpectedPin}
            placeholder="Expected DB PIN (4-6 digits)"
            placeholderTextColor="#7890aa"
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable style={styles.btn} onPress={applyExpectedPin}>
            <Text style={styles.btnText}>Apply Expected PIN</Text>
          </Pressable>

          <TextInput
            style={styles.input}
            value={dbAttemptPin}
            onChangeText={setDbAttemptPin}
            placeholder="Unlock attempt PIN"
            placeholderTextColor="#7890aa"
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
          />
          <Pressable style={styles.btnPrimary} onPress={() => void tryUnlockDb()}>
            <Text style={styles.btnPrimaryText}>Try Secure DB Unlock</Text>
          </Pressable>
          <Text style={styles.state}>DB state: {dbStatus}</Text>
          <Text style={styles.state}>Panic wipe triggered: {dbWiped ? 'YES' : 'NO'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1218' },
  content: { padding: 14, paddingBottom: 28 },
  title: { color: '#b5d8ff', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  sub: { marginTop: 6, color: '#8399b5', fontSize: 12 },
  card: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2f3f55',
    borderRadius: 12,
    backgroundColor: '#141d2a',
    padding: 10,
  },
  cardTitle: { color: '#e3efff', fontWeight: '800', fontSize: 14 },
  state: { marginTop: 6, color: '#a7bdd7', fontSize: 12 },
  row: { marginTop: 8, flexDirection: 'row', gap: 8 },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#3a5779',
    borderRadius: 8,
    backgroundColor: '#101a29',
    color: '#e5f0ff',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4c6583',
    borderRadius: 8,
    backgroundColor: '#1a2a3f',
    alignItems: 'center',
    paddingVertical: 8,
  },
  btnText: { color: '#d9e8fb', fontWeight: '700', fontSize: 12 },
  btnPrimary: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#4f8c71',
    borderRadius: 8,
    backgroundColor: '#1c4a3b',
    alignItems: 'center',
    paddingVertical: 9,
  },
  btnPrimaryText: { color: '#dfffee', fontWeight: '800', fontSize: 12 },
  logBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2f4057',
    borderRadius: 8,
    backgroundColor: '#0e1622',
    padding: 8,
    maxHeight: 130,
  },
  logLine: { color: '#b8c9de', fontSize: 11, marginBottom: 2 },
});