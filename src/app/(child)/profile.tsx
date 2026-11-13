import { router } from 'expo-router';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Avatar, Card, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore, fmtDuration } from '@/state/store';
import { spacing, useTheme } from '@/theme';

export default function ChildProfileTab() {
  const { colors } = useTheme();
  const { childSelf, setRole } = useStore();

  const switchMode = () => {
    setRole(null);
    (router.replace as any)('/');
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', paddingTop: spacing.lg, marginBottom: spacing.xl }}>
        <Avatar name={childSelf.name} size={92} ring />
        <Text variant="h1" style={{ marginTop: spacing.md }}>
          {childSelf.name.split(' ')[0]}
        </Text>
        <Text variant="small" tone="muted">
          {childSelf.deviceName}
        </Text>
      </View>

      <SectionLabel>Today</SectionLabel>
      <Card style={{ flexDirection: 'row', marginBottom: spacing.xl }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="h2" color={colors.primary}>
            {fmtDuration(childSelf.usedMin)}
          </Text>
          <Text variant="small" tone="muted">
            Used
          </Text>
        </View>
        <View style={{ width: 1, backgroundColor: colors.border }} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="h2" color={colors.success}>
            {fmtDuration(Math.max(0, childSelf.limitMin - childSelf.usedMin))}
          </Text>
          <Text variant="small" tone="muted">
            Left
          </Text>
        </View>
      </Card>

      <SectionLabel>About Haven</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="What's shared with my family" subtitle="See everything Haven shares" icon="eye" iconColor={colors.success} onPress={() => (router.push as any)('/transparency')} />
        <Row title="Emergency SOS" subtitle="Reach your family fast" icon="alert-circle" iconColor={colors.danger} onPress={() => (router.push as any)('/sos')} />
        <Row title="Help" icon="help-circle" iconColor={colors.info} onPress={() => {}} />
      </Card>

      <Card onPress={switchMode} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
        <Feather name="repeat" size={16} color={colors.primary} />
        <Text variant="smallStrong" color={colors.primary}>
          Switch mode
        </Text>
      </Card>
    </Screen>
  );
}
