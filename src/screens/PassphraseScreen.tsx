import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  mode: 'setup' | 'unlock';
  onSubmit: (pin: string) => Promise<void>;
};

export default function PassphraseScreen({ mode, onSubmit }: Props) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => (mode === 'setup' ? 'SET APP PASSCODE' : 'UNLOCK SURVIVALMESH'), [mode]);

  async function submit(): Promise<void> {
    setError(null);

    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4 to 6 digits.');
      return;
    }

    if (mode === 'setup' && pin !== confirmPin) {
      setError('PIN confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(pin);
      setPin('');
      setConfirmPin('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not continue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>
          {mode === 'setup'
            ? 'Create a local PIN to protect offline data access on this device.'
            : 'Enter your PIN to unlock local survival tools and data.'}
        </Text>

        <TextInput
          value={pin}
          onChangeText={setPin}
          style={styles.input}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          placeholder="PIN"
          placeholderTextColor="#7f8ea4"
        />

        {mode === 'setup' ? (
          <TextInput
            value={confirmPin}
            onChangeText={setConfirmPin}
            style={styles.input}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="Confirm PIN"
            placeholderTextColor="#7f8ea4"
          />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.btn} onPress={() => void submit()} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'Please wait...' : mode === 'setup' ? 'Save PIN' : 'Unlock'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1118',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: '#2b3a4d',
    borderRadius: 12,
    backgroundColor: '#121a26',
    padding: 14,
  },
  title: {
    color: '#e8f3ff',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sub: {
    marginTop: 8,
    color: '#9ab0ca',
    fontSize: 12,
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#35506f',
    borderRadius: 10,
    backgroundColor: '#101a28',
    color: '#e4efff',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  error: {
    marginTop: 8,
    color: '#ffb2b2',
    fontSize: 12,
  },
  btn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#4f87be',
    borderRadius: 10,
    backgroundColor: '#21456b',
    alignItems: 'center',
    paddingVertical: 10,
  },
  btnText: {
    color: '#e3f0ff',
    fontWeight: '800',
  },
});
