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
      await messageQueue.delete(messageId);
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

  // Reload when myNodeId changes to refresh delete buttons
  useEffect(() => {
    if (myNodeId) {
      console.log('✅ MyNodeId loaded:', myNodeId);
      void loadMessages();
    } else {
      console.log('ℹ️ MyNodeId still loading...');
    }
  }, [myNodeId]);

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

    // Ensure we have our node id for sender attribution (needed for delete button visibility)
    const senderNodeId = myNodeId || (await identityManager.getPublicKeyHash());
    if (!myNodeId) {
      setMyNodeId(senderNodeId);
    }

    if (selectedNodeId) {
      const contact = contacts.find((c) => c.nodeId === selectedNodeId);
      if (!contact) {
        return;
      }

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
      // Use our actual node id instead of placeholder so delete button can match
      await meshRouter.send(payload, senderNodeId, 'message');
    }

    setDraft('');
    await loadMessages();
  }

  async function clearAllMessages(): Promise<void> {
    try {
      await messageQueue.clearAll();
      await loadMessages();
    } catch (e) {
      console.error('Failed to clear messages', e);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>MESH CHAT</Text>
          <Pressable style={styles.clearBtn} onPress={() => void clearAllMessages()}>
            <Text style={styles.clearText}>Clear chat</Text>
          </Pressable>
        </View>

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
      </View>

      <FlatList
        data={visibleMessages}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <MessageRow 
            item={item} 
            onDelete={() => void deleteMessage(item.id)}
            isMyMessage={item.senderId === myNodeId}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.sub}>
            {selectedNodeId ? `No encrypted messages with #${selectedNodeId} yet` : 'No broadcast messages yet'}
          </Text>
        }
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inputWrapper}>
        <View style={styles.composerCard}>
          <View style={styles.composerHeader}>
            <Text style={styles.composerLabel}>Compose message</Text>
            <Text style={styles.composerTarget}>
              {selectedNodeId
                ? `To: ${contacts.find((c) => c.nodeId === selectedNodeId)?.alias ?? `#${selectedNodeId}`}`
                : 'To: Broadcast (everyone)'}
            </Text>
          </View>

          <View style={styles.composerRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={
                selectedNodeId
                  ? `Encrypted message to ${contacts.find((c) => c.nodeId === selectedNodeId)?.alias ?? `#${selectedNodeId}`}`
                  : 'Type an offline mesh message'
              }
              placeholderTextColor="#7a8fa6"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable
            />
            <Pressable style={styles.sendBtn} onPress={() => void onSend()}>
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0c1118', 
    flexDirection: 'column',
  },
  header: {
    backgroundColor: '#0c1118',
    paddingHorizontal: 0,
    flexDirection: 'column',
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  title: {
    color: '#72f2c0',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  clearBtn: {
    marginRight: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1a2433',
    borderWidth: 1,
    borderColor: '#2f4157',
  },
  clearText: {
    color: '#ffb4b4',
    fontWeight: '800',
    fontSize: 12,
  },
  messagesList: {
    flex: 1,
    backgroundColor: '#0c1118',
    paddingHorizontal: 16,
  },
  listContent: {
    paddingBottom: 420,
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
  inputWrapper: { 
    backgroundColor: '#0c1118', 
    borderTopWidth: 1, 
    borderColor: '#1f2b3a',
    paddingBottom: 30,
    paddingHorizontal: 16,
    paddingTop: 22,
    marginBottom: 70,
  },
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
  composerCard: {
    backgroundColor: '#111a28',
    borderWidth: 1,
    borderColor: '#223243',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  composerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  composerLabel: {
    color: '#d7e7ff',
    fontWeight: '800',
    fontSize: 14,
  },
  composerTarget: {
    color: '#7fb19f',
    fontWeight: '700',
    fontSize: 12,
  },
  composerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 64,
    maxHeight: 140,
    borderWidth: 2,
    borderColor: '#5a7a99',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    backgroundColor: '#151d2a',
    fontSize: 15,
    fontWeight: '500',
  },
  sendBtn: {
    backgroundColor: '#34a27c',
    borderWidth: 0,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 64,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  sendText: { color: '#0b1118', fontWeight: '900', fontSize: 14 }
});