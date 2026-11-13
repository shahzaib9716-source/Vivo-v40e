import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Button, Card, Header, Screen, Text } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

// Deterministic decorative grid (not a scannable code) for the demo.
const SIZE = 11;
function patternCell(r: number, c: number) {
  if ((r < 3 && c < 3) || (r < 3 && c > SIZE - 4) || (r > SIZE - 4 && c < 3)) {
    const inner = (r === 0 || r === 2 || c === 0 || c === 2) || (r > SIZE - 4 && (r === SIZE - 1 || r === SIZE - 3 || c === 0 || c === 2)) || (c > SIZE - 4 && (c === SIZE - 1 || c === SIZE - 3 || r === 0 || r === 2));
    return inner;
  }
  return (r * 7 + c * 13 + r * c) % 3 === 0;
}

export default function Pairing() {
  const { colors } = useTheme();
  const cells = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) cells.push({ r, c, on: patternCell(r, c) });

  return (
    <Screen>
      <Header back title="Pair a device" subtitle="Link your child's phone or tablet" />

      <Card style={{ alignItems: 'center', paddingVertical: spacing.xl, marginBottom: spacing.xl }}>
        <View style={[styles.qr, { backgroundColor: '#FFFFFF' }]}>
          <View style={styles.grid}>
            {cells.map((cell, i) => (
              <View
                key={i}
                style={{
                  width: `${100 / SIZE}%`,
                  aspectRatio: 1,
                  backgroundColor: cell.on ? '#17161F' : 'transparent',
                  borderRadius: 2,
                }}
              />
            ))}
          </View>
        </View>
        <Text variant="small" tone="muted" style={{ marginTop: spacing.lg }}>
          Scan with the child's device, or enter the code
        </Text>
        <View style={[styles.code, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Text variant="h2" style={{ letterSpacing: 6 }}>
            4KQ-7PX
          </Text>
        </View>
      </Card>

      <Text variant="h3" style={{ marginBottom: spacing.md }}>
        How to set up
      </Text>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Step n={1} text="Install Haven on your child's device" />
        <Step n={2} text="Open Haven and choose “This is my child's device”" />
        <Step n={3} text="Scan this code or enter it to link" />
        <Step n={4} text="Confirm together what Haven will share" last />
      </Card>

      <Button label="Share invite link" icon="share-2" variant="secondary" onPress={() => {}} />
    </Screen>
  );
}

function Step({ n, text, last }: { n: number; text: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.step, !last && { borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.stepNum, { backgroundColor: colors.primarySoft }]}>
        <Text variant="smallStrong" color={colors.primary}>
          {n}
        </Text>
      </View>
      <Text variant="body" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  qr: { width: 200, height: 200, borderRadius: radius.lg, padding: 14 },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  code: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  stepNum: { width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
