import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { meshRouter } from '../mesh/MeshRouter';
import { messageQueue } from '../mesh/MessageQueue';
import { contactBook, type Contact } from '../security/ContactBook';
import { identityManager } from '../security/IdentityRuntime';
import type { MeshPacket } from '../types/mesh';

type EncryptedEnvelope = {
  senderNodeId: string;
  senderPublicKey: string;
  recipientNodeId: string;
  cipher: string;
};

type ChatMessageView = {
  id: string;
  ttl: number;
  senderId: string;
  timestamp: number;
  rawPayload: string;
  displayPayload: string;
  isEncrypted: boolean;
  envelope?: EncryptedEnvelope;
};

function parseEnvelope(payload: string): EncryptedEnvelope | null {
  if (!payload.startsWith('ENC1:')) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload.slice(5)) as EncryptedEnvelope;
    if (!parsed.senderNodeId || !parsed.senderPublicKey || !parsed.recipientNodeId || !parsed.cipher) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

type MessageRowProps = {
  item: ChatMessageView;
  onDelete: () => void;
  isMyMessage: boolean;
};

function MessageRow({ item, onDelete, isMyMessage }: MessageRowProps) {
  return (
    <View style={styles.messageCard}>
      <View style={styles.messageContent}>
        <Text style={styles.messageSender}>#{item.senderId}</Text>
        <Text style={styles.messageText}>{item.displayPayload}</Text>
        <Text style={styles.messageMetadata}>TTL: {item.ttl} | {new Date(item.timestamp).toLocaleTimeString()}</Text>
      </View>
      {isMyMessage && (
        <Pressable style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function ChatScreen() {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [myNodeId, setMyNodeId] = useState<string>('');

  async function loadContacts() {
    const rows = await contactBook.listContacts();
    setContacts(rows);
    if (rows.length === 0) {
      setSelectedNodeId(null);
    }
  }

  async function toChatMessageView(packet: MeshPacket): Promise<ChatMessageView> {
    const envelope = parseEnvelope(packet.payload);
    if (!envelope) {
      return {
        id: packet.id,
        ttl: packet.ttl,
        senderId: packet.senderId,
        timestamp: packet.timestamp,
        rawPayload: packet.payload,
        displayPayload: packet.payload,
        isEncrypted: false,
      };
    }

    try {
      const myNodeId = await identityManager.getPublicKeyHash();
      if (envelope.recipientNodeId !== myNodeId) {
        return {
          id: packet.id,
          ttl: packet.ttl,
          senderId: packet.senderId,
          timestamp: packet.timestamp,
          rawPayload: packet.payload,
          displayPayload: `[Encrypted message for #${envelope.recipientNodeId}]`,
          isEncrypted: true,
          envelope,
        };
      }

      const opened = await identityManager.decryptMessage(envelope.senderPublicKey, envelope.cipher);
      return {
        id: packet.id,
        ttl: packet.ttl,
        senderId: packet.senderId,
        timestamp: packet.timestamp,
        rawPayload: packet.payload,
        displayPayload: opened ?? '[Encrypted message could not be decrypted]',
        isEncrypted: true,
        envelope,
      };
    } catch {
      return {
        id: packet.id,
        ttl: packet.ttl,
        senderId: packet.senderId,
        timestamp: packet.timestamp,
        rawPayload: packet.payload,
        displayPayload: '[Malformed encrypted payload]',
        isEncrypted: true,
        envelope,
      };
    }
  }

  async function loadMessages() {
    const queueItems = await messageQueue.getAllMessages(300);
    const filtered = queueItems.filter((m) => m.type === 'message').sort((a, b) => b.timestamp - a.timestamp);
    const decorated = await Promise.all(filtered.map((m) => toChatMessageView(m)));
    setMessages(decorated);
  }

  async function deleteMessage(messageId: string): Promise<void> {
    try {
      // Delete from message queue
      await messageQueue.markDelivered(messageId);
      await loadMessages();
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  }

  async function isMyMessage(senderId: string): Promise<boolean> {
    const myNodeId = await identityManager.getPublicKeyHash();
    return senderId === myNodeId;
  }

  const visibleMessages = useMemo(() => {
    if (selectedNodeId === null) {
      return messages.filter((m) => !m.isEncrypted);
    }

    return messages.filter((m) => {
      if (!m.isEncrypted || !m.envelope) {
        return false;
      }
      return m.envelope.recipientNodeId === selectedNodeId || m.envelope.senderNodeId === selectedNodeId;
    });
  }, [messages, selectedNodeId]);

  useEffect(() => {
    void loadMessages();
    void loadContacts();
    void (async () => {
      const nodeId = await identityManager.getPublicKeyHash();
      setMyNodeId(nodeId);
    })();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return meshRouter.on('packetReceived', () => {
      void loadMessages();
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadContacts();
      void loadMessages();
    }, [])
  );

  async function onSend(): Promise<void> {
    const payload = draft.trim();
    if (!payload) {
      return;
    }

    if (selectedNodeId) {
      const contact = contacts.find((c) => c.nodeId === selectedNodeId);
      if (!contact) {
        return;
      }

      const senderNodeId = await identityManager.getPublicKeyHash();
      const senderPublicKey = await identityManager.getPublicKey();
      const cipher = await identityManager.encryptMessage(contact.publicKey, payload);
      const envelope = {
        senderNodeId,
        senderPublicKey,
        recipientNodeId: contact.nodeId,
        cipher,
      };

      await meshRouter.send(`ENC1:${JSON.stringify(envelope)}`, senderNodeId, 'message');
    } else {
      await meshRouter.send(payload, 'LOCAL01', 'message');
    }

    setDraft('');
    await loadMessages();
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <Text style={styles.title}>MESH CHAT</Text>

        <View style={styles.targetWrap}>
          <Text style={styles.targetLabel}>Send target</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contactsRow}>
            <Pressable
              style={[styles.contactChip, selectedNodeId === null && styles.contactChipActive]}
              onPress={() => setSelectedNodeId(null)}
            >
              <Text style={[styles.contactChipText, selectedNodeId === null && styles.contactChipTextActive]}>Broadcast</Text>
            </Pressable>

            {contacts.map((contact) => {
              const label = contact.alias?.trim() || `#${contact.nodeId}`;
              return (
                <Pressable
                  key={contact.nodeId}
                  style={[styles.contactChip, selectedNodeId === contact.nodeId && styles.contactChipActive]}
                  onPress={() => setSelectedNodeId(contact.nodeId)}
                >
                  <Text style={[styles.contactChipText, selectedNodeId === contact.nodeId && styles.contactChipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {contacts.length === 0 ? <Text style={styles.targetSub}>No saved contacts yet. Use Identity tab to import.</Text> : null}
        </View>

        <FlatList
          data={visibleMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <MessageRow 
              item={item} 
              onDelete={() => void deleteMessage(item.id)}
              isMyMessage={item.senderId === (identityManager.getPublicKeyHash as any)}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.sub}>
              {selectedNodeId ? `No encrypted messages with #${selectedNodeId} yet` : 'No broadcast messages yet'}
            </Text>
          }
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={
              selectedNodeId
                ? `Encrypted message to ${contacts.find((c) => c.nodeId === selectedNodeId)?.alias ?? `#${selectedNodeId}`}`
                : 'Type offline mesh message'
            }
            placeholderTextColor="#66758f"
          />
          <Pressable style={styles.sendBtn} onPress={() => void onSend()}>
            <Text style={styles.sendText}>SEND</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c1118' },
  title: {
    color: '#72f2c0',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  targetWrap: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#223243',
    backgroundColor: '#101822',
    borderRadius: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  targetLabel: {
    color: '#9eb0c7',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  contactsRow: {
    paddingHorizontal: 10,
    gap: 8,
    paddingBottom: 4,
  },
  contactChip: {
    borderWidth: 1,
    borderColor: '#31465e',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#132030',
  },
  contactChipActive: {
    borderColor: '#5da389',
    backgroundColor: '#1e4738',
  },
  contactChipText: {
    color: '#9db2cd',
    fontSize: 12,
    fontWeight: '600',
  },
  contactChipTextActive: {
    color: '#daf9ec',
  },
  targetSub: {
    color: '#6f839c',
    fontSize: 11,
    paddingHorizontal: 10,
    paddingTop: 4,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 12, flexGrow: 1 },
  msgCard: {
    backgroundColor: '#141c27',
    borderColor: '#243141',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  msgBody: { color: '#ecf3ff', fontSize: 15 },
  msgMeta: { color: '#89a0bd', marginTop: 6, fontSize: 11 },
  messageCard: {
    backgroundColor: '#141c27',
    borderColor: '#243141',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  messageContent: {
    flex: 1,
  },
  messageSender: {
    color: '#89a0bd',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  messageText: {
    color: '#ecf3ff',
    fontSize: 14,
    marginBottom: 6,
  },
  messageMetadata: {
    color: '#6f839c',
    fontSize: 10,
  },
  deleteButton: {
    backgroundColor: '#8b4545',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginLeft: 8,
  },
  deleteButtonText: {
    color: '#ffcccc',
    fontSize: 12,
    fontWeight: '600',
  },
  sub: { color: '#7c879a', textAlign: 'center', marginTop: 24 },
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: '#1f2b3a',
    gap: 10,
    backgroundColor: '#0c1118',
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 2,
    borderColor: '#4a5f74',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f2f6ff',
    backgroundColor: '#0a1016',
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: '#244f3f',
    borderWidth: 2,
    borderColor: '#5da389',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendText: { color: '#d9ffef', fontWeight: '800' },
});