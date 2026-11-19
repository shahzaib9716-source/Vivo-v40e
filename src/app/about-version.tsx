import { Platform, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, Header, Screen, SectionLabel, Text } from '@/components/ui';
import { APP_NAME } from '@/config/variant';
import { deviceFeatures, SYNCED_FEATURES } from '@/platform/capabilities';
import { spacing, useTheme } from '@/theme';

const PLATFORM_NAME = Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'the web';

/**
 * What this version does and does not do, on this phone. The same list for parent and child:
 * nothing about the app is hidden from either.
 */
export default function AboutVersion() {
  const { colors } = useTheme();
  const features = deviceFeatures();
  return (
    <Screen>
      <Header back title="What this version does" subtitle={`${APP_NAME} on ${PLATFORM_NAME}`} />

      <SectionLabel>Works between linked phones</SectionLabel>
      <Card padded={false} style={styles.group}>
        {SYNCED_FEATURES.map((item) => (
          <View key={item.title} accessible accessibilityLabel={`Works: ${item.title}. ${item.detail}`} style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.successSoft }]}>
              <Feather name={item.icon as never} size={18} color={colors.success} />
            </View>
            <View style={styles.flex}>
              <Text variant="title">{item.title}</Text>
              <Text variant="small" tone="muted">
                {item.detail}
              </Text>
            </View>
            <Feather name="check-circle" size={18} color={colors.success} />
          </View>
        ))}
      </Card>

      <SectionLabel>Device capabilities</SectionLabel>
      <Card padded={false} style={styles.group}>
        {features.map((item) => (
          <View key={item.key} accessible accessibilityLabel={`${item.implemented ? 'Included in this build' : 'Not in this version'}: ${item.title}. ${item.note}`} style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.surfaceSunken }]}>
              <Feather name={item.implemented ? 'check' : 'minus'} size={18} color={colors.textMuted} />
            </View>
            <View style={styles.flex}>
              <Text variant="title">{item.title}</Text>
              <Text variant="small" tone="muted">
                {item.note}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <Text variant="small" tone="faint" style={styles.foot}>
        The child can review sharing permissions in Android Settings.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  foot: { paddingHorizontal: spacing.xs },
});

