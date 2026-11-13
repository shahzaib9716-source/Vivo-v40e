import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.text }]}>Vivo-v40e</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Project is set up. Screens coming next.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.sm },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 16, textAlign: 'center' },
});
