import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TRIAGE_ROOT, TRIAGE_TREE } from '../triage/triageTree';

const CALL_HELP_BULLETS = [
  'No or abnormal breathing, blue/grey lips',
  'Severe bleeding that will not stop',
  'Chest pain or stroke signs (face droop, slurred speech)',
  'Trouble breathing, severe allergy, or asthma not improving',
  'Seizure longer than 5 minutes or repeated seizures',
  'Major trauma: fall, vehicle crash, head/neck injury',
  'Signs of shock: pale, clammy, fast weak pulse, confusion',
  'If unsure or the person is worsening at any time',
];

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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.disclaimer}>Not medical advice. Call your local emergency number when in doubt or if the person worsens.</Text>
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
              {node.escalate && node.escalate.length > 0 ? (
                <View style={styles.helperCard}>
                  <Text style={styles.helperTitle}>Escalate now if:</Text>
                  {node.escalate.map((item) => (
                    <Text key={item} style={styles.helperItem}>• {item}</Text>
                  ))}
                </View>
              ) : null}
              <View style={styles.helperCard}>
                <Text style={styles.helperTitle}>Call for help immediately if:</Text>
                {CALL_HELP_BULLETS.map((item) => (
                  <Text key={item} style={styles.helperItem}>• {item}</Text>
                ))}
              </View>
              <View style={[styles.actions, styles.actionsLeaf]}>
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
              <View style={[styles.actions, styles.actionsBranch]}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f131b' },
  scrollContent: { padding: 16, paddingBottom: 32, gap: 12, flexGrow: 1 },
  card: {
    borderWidth: 1,
    borderColor: '#283247',
    borderRadius: 14,
    backgroundColor: '#141b27',
    padding: 14,
    gap: 6,
  },
  disclaimer: {
    color: '#b0bdd4',
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 16,
  },
  error: { color: '#e9ecf3' },
  question: { color: '#e8eef9', fontSize: 21, fontWeight: '700', lineHeight: 29 },
  severityBadge: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  severityText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  treatment: { color: '#f0f4ff', fontWeight: '700', fontSize: 18, marginTop: 10 },
  step: { color: '#d2daea', marginTop: 8, lineHeight: 20 },
  helperCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#30405a',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#0f1622',
  },
  helperTitle: { color: '#dce6f6', fontWeight: '700', marginBottom: 6, fontSize: 14 },
  helperItem: { color: '#c3cde0', lineHeight: 18, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 18 },
  actionsLeaf: { justifyContent: 'flex-end' },
  actionsBranch: { justifyContent: 'space-between' },
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
