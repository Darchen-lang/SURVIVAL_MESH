import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { TRIAGE_ROOT, TRIAGE_TREE } from '../triage/triageTree';

const severityColor: Record<'green' | 'yellow' | 'red', string> = {
  green: '#2f8f56',
  yellow: '#b9962e',
  red: '#a53434',
};

export default function TriageScreen() {
  const [stack, setStack] = useState<string[]>([TRIAGE_ROOT]);
  const currentId = stack[stack.length - 1];
  const node = useMemo(() => TRIAGE_TREE[currentId], [currentId]);

  if (!node) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>Invalid triage node.</Text>
      </SafeAreaView>
    );
  }

  function go(next: string | null): void {
    if (!next) {
      return;
    }
    setStack((prev) => [...prev, next]);
  }

  function goBack(): void {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, prev.length - 1) : prev));
  }

  function restart(): void {
    setStack([TRIAGE_ROOT]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        {node.isLeaf ? (
          <>
            <View style={[styles.severityBadge, { backgroundColor: severityColor[node.severity] }]}>
              <Text style={styles.severityText}>{node.severity.toUpperCase()}</Text>
            </View>
            <Text style={styles.treatment}>{node.treatment}</Text>
            {node.steps.map((step) => (
              <Text key={step} style={styles.step}>• {step}</Text>
            ))}
            <View style={styles.actions}>
              <Pressable style={styles.secondaryBtn} onPress={goBack}>
                <Text style={styles.secondaryText}>Back</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={restart}>
                <Text style={styles.primaryText}>Restart</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.question}>{node.question}</Text>
            <View style={styles.actions}>
              <Pressable style={styles.secondaryBtn} onPress={goBack}>
                <Text style={styles.secondaryText}>Back</Text>
              </Pressable>
              <Pressable style={styles.noBtn} onPress={() => go(node.no)}>
                <Text style={styles.primaryText}>NO</Text>
              </Pressable>
              <Pressable style={styles.yesBtn} onPress={() => go(node.yes)}>
                <Text style={styles.primaryText}>YES</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f131b', justifyContent: 'center', padding: 16 },
  card: {
    borderWidth: 1,
    borderColor: '#283247',
    borderRadius: 14,
    backgroundColor: '#141b27',
    padding: 14,
  },
  error: { color: '#e9ecf3' },
  question: { color: '#e8eef9', fontSize: 21, fontWeight: '700', lineHeight: 29 },
  severityBadge: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  severityText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  treatment: { color: '#f0f4ff', fontWeight: '700', fontSize: 18, marginTop: 10 },
  step: { color: '#d2daea', marginTop: 8, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#40506a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryText: { color: '#cad6eb', fontWeight: '600' },
  noBtn: {
    backgroundColor: '#5a3131',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  yesBtn: {
    backgroundColor: '#27574f',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryBtn: {
    backgroundColor: '#2a4f80',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryText: { color: '#edf4ff', fontWeight: '700' },
});
