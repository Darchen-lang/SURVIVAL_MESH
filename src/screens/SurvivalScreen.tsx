import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { knowledgeBase } from '../intelligence/KnowledgeBase';

type ArticlePreview = {
  id: string;
  category: string;
  title: string;
  preview: string;
};

type Article = {
  id: string;
  category: string;
  title: string;
  content: string;
};

export default function SurvivalScreen() {
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [results, setResults] = useState<ArticlePreview[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        const cats = await knowledgeBase.getCategories();
        setCategories(cats);
      } catch {
        setError('knowledge.db asset is not bundled yet. Add assets/knowledge.db to enable full offline library.');
      }
    })();
  }, []);

  async function runSearch(text: string): Promise<void> {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const rows = await knowledgeBase.search(text);
      setResults(rows);
      setError(null);
    } catch {
      setError('Search unavailable until knowledge.db is bundled.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function openArticle(id: string): Promise<void> {
    try {
      const row = await knowledgeBase.getArticle(id);
      setSelectedArticle(row);
    } catch {
      setError('Could not load article.');
    }
  }

  const quickTips = useMemo(
    () => [
      'Water: boil for 1 minute or use proper filtration/chlorination.',
      'Bleeding: direct pressure first, then wound packing if needed.',
      'Shelter: prioritize wind protection and insulation from ground.',
    ],
    []
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>SURVIVAL LIBRARY</Text>
      <TextInput
        style={styles.search}
        placeholder="Search: bleeding, water, burns, shelter..."
        placeholderTextColor="#73839b"
        value={query}
        onChangeText={(t) => void runSearch(t)}
      />

      {loading ? <ActivityIndicator color="#99efbf" style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {selectedArticle ? (
        <View style={styles.articleCard}>
          <Pressable onPress={() => setSelectedArticle(null)}>
            <Text style={styles.back}>Back to results</Text>
          </Pressable>
          <Text style={styles.articleTitle}>{selectedArticle.title}</Text>
          <Text style={styles.articleCategory}>{selectedArticle.category}</Text>
          <Text style={styles.articleContent}>{selectedArticle.content}</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable style={styles.resultCard} onPress={() => void openArticle(item.id)}>
                <Text style={styles.resultTitle}>{item.title}</Text>
                <Text style={styles.resultMeta}>{item.category}</Text>
                <Text style={styles.resultPreview}>{item.preview}</Text>
              </Pressable>
            )}
            ListHeaderComponent={
              <View>
                <Text style={styles.sectionTitle}>Categories</Text>
                <Text style={styles.categories}>
                  {categories.length > 0 ? categories.join(' • ') : 'medical • water • navigation • shelter'}
                </Text>
                <Text style={styles.sectionTitle}>Quick Offline Tips</Text>
                {quickTips.map((tip) => (
                  <Text key={tip} style={styles.tip}>
                    • {tip}
                  </Text>
                ))}
                <Text style={styles.sectionTitle}>Search Results</Text>
              </View>
            }
            ListEmptyComponent={<Text style={styles.empty}>Type in search to query the offline knowledge base.</Text>}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1218', paddingHorizontal: 16, paddingTop: 12 },
  title: { color: '#9ff0ba', fontSize: 21, fontWeight: '900', letterSpacing: 1.2 },
  search: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2a3a4c',
    borderRadius: 10,
    backgroundColor: '#121b27',
    color: '#e6f0ff',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  loader: { marginTop: 10 },
  error: { marginTop: 8, color: '#ffa0a0', fontSize: 12 },
  listContent: { paddingBottom: 24 },
  sectionTitle: { color: '#d9e7fa', fontWeight: '800', marginTop: 12, marginBottom: 6 },
  categories: { color: '#90a4bf', fontSize: 12 },
  tip: { color: '#bccbde', fontSize: 12, marginBottom: 4 },
  resultCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#293444',
    borderRadius: 12,
    backgroundColor: '#151d29',
    padding: 10,
  },
  resultTitle: { color: '#ecf4ff', fontWeight: '700', fontSize: 15 },
  resultMeta: { color: '#8da2bd', marginTop: 3, fontSize: 11 },
  resultPreview: { color: '#c7d5e8', marginTop: 6, fontSize: 12 },
  empty: { color: '#788aa3', marginTop: 10 },
  articleCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2a3748',
    borderRadius: 12,
    backgroundColor: '#121a25',
    padding: 12,
  },
  back: { color: '#9bd9ff', fontWeight: '700', marginBottom: 8 },
  articleTitle: { color: '#eaf3ff', fontWeight: '800', fontSize: 18 },
  articleCategory: { color: '#94a8c4', marginTop: 4, marginBottom: 8 },
  articleContent: { color: '#d4dfef', lineHeight: 20 },
});
