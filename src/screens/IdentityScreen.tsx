import { useEffect, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { contactBook, type Contact } from '../security/ContactBook';
import { identityManager } from '../security/IdentityRuntime';

export default function IdentityScreen() {
  const [publicKeyHash, setPublicKeyHash] = useState('------');
  const [publicKey, setPublicKey] = useState('');
  const [qrPayload, setQrPayload] = useState('');
  const [importPayload, setImportPayload] = useState('');
  const [importAlias, setImportAlias] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadIdentity(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      await identityManager.init();
      const [hash, pub] = await Promise.all([identityManager.getPublicKeyHash(), identityManager.getPublicKey()]);
      setPublicKeyHash(hash);
      setPublicKey(pub);
      setQrPayload(JSON.stringify({ nodeId: hash, publicKey: pub }));
      const localContacts = await contactBook.listContacts();
      setContacts(localContacts);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize identity.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadIdentity();
  }, []);

  async function importContactPayload(data: string): Promise<void> {
    try {
      const parsed = JSON.parse(data) as { nodeId?: string; publicKey?: string; alias?: string };
      if (!parsed.nodeId || !parsed.publicKey) {
        throw new Error('Invalid contact QR payload.');
      }
      const aliasToSave = importAlias.trim() || parsed.alias || null;
      await contactBook.addContact(parsed.nodeId, parsed.publicKey, aliasToSave);
      const localContacts = await contactBook.listContacts();
      setContacts(localContacts);
      setImportPayload('');
      setImportAlias('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to scan contact.';
      setError(message);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>P2P Identity</Text>
        <Text style={styles.subtitle}>No account required. Your keypair stays on this device.</Text>

        <View style={styles.hashPill}>
          <Text style={styles.hashLabel}>Node ID</Text>
          <Text style={styles.hashValue}>{loading ? 'Generating...' : publicKeyHash}</Text>
        </View>

        <Text style={styles.keyLabel}>Public Key (share this)</Text>
        <Text selectable style={styles.keyValue}>
          {publicKey || 'Not ready yet'}
        </Text>

        <Text style={styles.keyLabel}>Scan this QR to add you</Text>
        <View style={styles.qrWrap}>{qrPayload ? <QRCode value={qrPayload} size={158} /> : null}</View>

        <View style={styles.rowActions}>
          <Pressable style={styles.scanButton} onPress={() => void importContactPayload(importPayload)}>
            <Text style={styles.scanText}>Import Contact Payload</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.aliasInput}
          value={importAlias}
          onChangeText={setImportAlias}
          placeholder="Optional contact name (e.g., Sam)"
          placeholderTextColor="#7688a4"
        />

        <TextInput
          style={styles.importInput}
          multiline
          value={importPayload}
          onChangeText={setImportPayload}
          placeholder='Paste payload like {"nodeId":"ABC123","publicKey":"..."}'
          placeholderTextColor="#7688a4"
        />

        <Text style={styles.keyLabel}>Saved Contacts</Text>
        {contacts.length === 0 ? (
          <Text style={styles.emptyText}>No contacts yet. Scan a QR to add one.</Text>
        ) : (
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.nodeId}
            style={styles.contactsList}
            renderItem={({ item }) => (
              <View style={styles.contactRow}>
                <View style={styles.contactHeader}>
                  <Text style={styles.contactAlias}>{item.alias ?? 'Unnamed contact'}</Text>
                  <Text style={styles.contactNode}>#{item.nodeId}</Text>
                </View>
                <Text numberOfLines={1} style={styles.contactKey}>{item.publicKey}</Text>
              </View>
            )}
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.reloadButton} onPress={() => void loadIdentity()} disabled={loading}>
          <Text style={styles.reloadText}>{loading ? 'Working...' : 'Regenerate View'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1218',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: '#2b3542',
    borderRadius: 14,
    backgroundColor: '#151c25',
    padding: 14,
  },
  title: {
    color: '#ebf3ff',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#8fa1b9',
    marginTop: 6,
    fontSize: 12,
  },
  hashPill: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#315074',
    borderRadius: 10,
    backgroundColor: '#122238',
    padding: 10,
  },
  hashLabel: {
    color: '#98afcc',
    fontSize: 11,
  },
  hashValue: {
    marginTop: 3,
    color: '#d7eaff',
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 20,
  },
  keyLabel: {
    marginTop: 12,
    color: '#a5b4c8',
    fontSize: 12,
    fontWeight: '600',
  },
  keyValue: {
    marginTop: 6,
    color: '#d6e0ee',
    fontSize: 11,
    lineHeight: 16,
    borderWidth: 1,
    borderColor: '#2f3b4a',
    borderRadius: 8,
    backgroundColor: '#101722',
    padding: 8,
  },
  qrWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2f3b4a',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  rowActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  scanButton: {
    borderWidth: 1,
    borderColor: '#547eaf',
    backgroundColor: '#1a3552',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scanText: {
    color: '#e4f0ff',
    fontWeight: '700',
  },
  importInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#33465e',
    borderRadius: 10,
    backgroundColor: '#101824',
    minHeight: 72,
    color: '#dbe8fb',
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: 'top',
    fontSize: 12,
  },
  contactsList: {
    marginTop: 8,
    maxHeight: 160,
  },
  contactRow: {
    borderWidth: 1,
    borderColor: '#2a3849',
    borderRadius: 8,
    backgroundColor: '#101825',
    padding: 8,
    marginBottom: 6,
  },
  contactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactAlias: {
    color: '#e7f1ff',
    fontWeight: '800',
    fontSize: 13,
  },
  contactNode: {
    color: '#d7e9ff',
    fontWeight: '700',
    fontSize: 12,
  },
  contactKey: {
    marginTop: 4,
    color: '#9fb2cc',
    fontSize: 11,
  },
  aliasInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#33465e',
    borderRadius: 10,
    backgroundColor: '#101824',
    color: '#dbe8fb',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  emptyText: {
    marginTop: 8,
    color: '#8397b2',
    fontSize: 12,
  },
  error: {
    marginTop: 10,
    color: '#ff9ea0',
    fontSize: 12,
  },
  reloadButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#5079a8',
    borderRadius: 10,
    backgroundColor: '#1a3656',
    paddingVertical: 10,
    alignItems: 'center',
  },
  reloadText: {
    color: '#deecff',
    fontWeight: '700',
  },
});
