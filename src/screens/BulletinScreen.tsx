import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { bulletinBoard } from '../mesh/BulletinBoard';
import type { BulletinPost, BulletinTag } from '../types/mesh';

const TAGS: BulletinTag[] = ['water', 'medical', 'danger', 'route', 'other'];

export default function BulletinScreen() {
  const [posts, setPosts] = useState<BulletinPost[]>([]);
  const [showCompose, setShowCompose] = useState(false);
  const [content, setContent] = useState('');
  const [tag, setTag] = useState<BulletinTag>('other');

  const grouped = useMemo(() => {
    return TAGS.map((t) => ({ tag: t, posts: posts.filter((p) => p.tag === t) })).filter((g) => g.posts.length > 0);
  }, [posts]);

  async function load() {
    await bulletinBoard.pruneExpired();
    const data = await bulletinBoard.getPosts();
    setPosts(data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreatePost() {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    await bulletinBoard.createPost('LOCAL01', trimmed, tag);
    setContent('');
    setTag('other');
    setShowCompose(false);
    await load();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>BULLETIN BOARD</Text>
        <Pressable style={styles.composeButton} onPress={() => setShowCompose(true)}>
          <Text style={styles.composeText}>COMPOSE</Text>
        </Pressable>
      </View>

      {grouped.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No posts yet</Text>
          <Text style={styles.emptySub}>Tap Compose to broadcast your first local update.</Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={(item) => item.tag}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.groupSection}>
              <Text style={styles.groupTitle}>{item.tag.toUpperCase()}</Text>
              {item.posts.map((post) => (
                <View key={post.id} style={styles.card}>
                  <Text style={styles.cardContent}>{post.content}</Text>
                  <View style={styles.cardMetaRow}>
                    <Text style={styles.cardMeta}>#{post.authorKeyHash}</Text>
                    <Text style={styles.cardMeta}>{new Date(post.timestamp).toLocaleString()}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        />
      )}

      <Modal visible={showCompose} transparent animationType="slide" onRequestClose={() => setShowCompose(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Bulletin</Text>
            <TextInput
              style={styles.input}
              multiline
              value={content}
              onChangeText={setContent}
              placeholder="Write local update..."
              placeholderTextColor="#6a6a6a"
            />

            <View style={styles.tagsRow}>
              {TAGS.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTag(t)}
                  style={[styles.tagChip, tag === t && styles.tagChipActive]}
                >
                  <Text style={[styles.tagChipText, tag === t && styles.tagChipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setShowCompose(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.publishButton} onPress={() => void onCreatePost()}>
                <Text style={styles.publishText}>Publish</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#9fe870',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  composeButton: {
    borderWidth: 1,
    borderColor: '#355f45',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#193525',
  },
  composeText: {
    color: '#c5ffd2',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.7,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#d6d6d6',
    fontSize: 18,
    fontWeight: '700',
  },
  emptySub: {
    marginTop: 8,
    color: '#7e8694',
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  groupSection: {
    marginTop: 14,
  },
  groupTitle: {
    color: '#f2f6fc',
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 8,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#151b24',
    borderColor: '#2a3342',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  cardContent: {
    color: '#f0f3f7',
    fontSize: 15,
    lineHeight: 20,
  },
  cardMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardMeta: {
    color: '#8190a7',
    fontSize: 11,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalCard: {
    backgroundColor: '#10151e',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#293243',
  },
  modalTitle: {
    color: '#f3f6fd',
    fontWeight: '800',
    fontSize: 17,
  },
  input: {
    marginTop: 12,
    minHeight: 96,
    borderWidth: 1,
    borderColor: '#2b3545',
    borderRadius: 10,
    color: '#e9edf2',
    padding: 10,
    textAlignVertical: 'top',
  },
  tagsRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    borderWidth: 1,
    borderColor: '#38465c',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagChipActive: {
    borderColor: '#85d9a0',
    backgroundColor: '#153323',
  },
  tagChipText: {
    color: '#aebad0',
    fontSize: 12,
    fontWeight: '600',
  },
  tagChipTextActive: {
    color: '#d9ffe6',
  },
  modalActions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#39475b',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  cancelText: {
    color: '#c4cfdf',
    fontWeight: '600',
  },
  publishButton: {
    borderWidth: 1,
    borderColor: '#4f9062',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#224c33',
  },
  publishText: {
    color: '#d8ffe4',
    fontWeight: '700',
  },
});