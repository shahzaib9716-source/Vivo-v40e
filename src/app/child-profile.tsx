import { router } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Avatar, Button, Card, Header, Row, Screen, SectionLabel, StatTile, Text } from '@/components/ui';
import { useStore, fmtDuration } from '@/state/store';
import { categoryColors, spacing, useTheme } from '@/theme';

export default function ChildProfile() {
  const { colors } = useTheme();
  const { activeChild, activeChildId, pauseDevice, resumeDevice } = useStore();

  return (
    <Screen>
      <Header back title="" />

      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <Avatar name={activeChild.name} size={88} ring />
        <Text variant="h1" style={{ marginTop: spacing.md }}>
          {activeChild.name}
        </Text>
        <Text variant="small" tone="muted">
          Age {activeChild.age} · {activeChild.deviceName}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
        <StatTile value={fmtDuration(activeChild.usedMin)} caption="Today" color={colors.primary} />
        <StatTile value={`${activeChild.battery}%`} caption="Battery" color={activeChild.battery < 30 ? colors.danger : colors.success} />
        <StatTile value={activeChild.online ? 'Online' : 'Offline'} caption={activeChild.place} color={colors.info} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
        {activeChild.bedtime ? (
          <Button label="Resume device" icon="play" full style={{ flex: 1 }} onPress={() => resumeDevice(activeChildId)} />
        ) : (
          <Button label="Pause device" icon="pause" variant="secondary" style={{ flex: 1 }} onPress={() => pauseDevice(activeChildId)} />
        )}
        <Button label="Message" icon="message-circle" variant="secondary" style={{ flex: 1 }} onPress={() => {}} />
      </View>

      <SectionLabel>Controls</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Screen Time" subtitle={`Limit ${fmtDuration(activeChild.limitMin)}/day`} icon="clock" iconColor={categoryColors.screenTime} onPress={() => (router.push as any)('/screen-time')} />
        <Row title="App Limits" subtitle={`${activeChild.apps.length} apps`} icon="grid" iconColor={categoryColors.apps} onPress={() => (router.push as any)('/app-limits')} />
        <Row title="Schedules" subtitle="Bedtime & school" icon="calendar" iconColor={categoryColors.schedules} onPress={() => (router.push as any)('/schedules')} />
        <Row title="Location" subtitle={activeChild.place} icon="map-pin" iconColor={categoryColors.location} onPress={() => (router.push as any)('/(parent)/location')} />
      </Card>

      <SectionLabel>Device</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <Row title="Rename child" icon="edit-2" iconColor={colors.textMuted} onPress={() => {}} />
        <Row title="Unpair device" icon="trash-2" danger chevron={false} onPress={() => {}} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({});
