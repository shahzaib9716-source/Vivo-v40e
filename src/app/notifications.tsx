import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, Header, IconBadge, Screen, Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { spacing, useTheme } from '@/theme';

export default function Notifications() {
  const { colors } = useTheme();
  const { alerts, markAlertsRead } = useStore();

  useEffect(() => {
    const t = setTimeout(markAlertsRead, 600);
    return () => clearTimeout(t);
  }, [markAlertsRead]);

  return (
    <Screen>
      <Header back title="Notifications" />
      <View style={{ gap: spacing.sm }}>
        {alerts.map((a) => (
          <Card key={a.id} style={a.unread ? { borderColor: colors.primary + '55' } : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconBadge name={a.icon} color={a.color} size={44} />
              <View style={{ flex: 1 }}>
                <Text variant="title">{a.title}</Text>
                <Text variant="small" tone="muted">
                  {a.body}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text variant="tiny" tone="faint">
                  {a.ago}
                </Text>
                {a.unread && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
              </View>
            </View>
          </Card>
        ))}
      </View>

      <View style={styles.empty}>
        <Feather name="check-circle" size={20} color={colors.textFaint} />
        <Text variant="small" tone="faint">
          You're all caught up
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 999 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
});
