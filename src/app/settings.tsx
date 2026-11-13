import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Card, Header, Row, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { useStore } from '@/state/store';
import { spacing, useTheme } from '@/theme';

export default function Settings() {
  const { colors } = useTheme();
  const { setRole } = useStore();
  const [push, setPush] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);
  const [biometric, setBiometric] = useState(true);

  const signOut = () => {
    setRole(null);
    (router.replace as any)('/');
  };

  return (
    <Screen>
      <Header back title="Settings" />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }}>
        <Avatar name="Jordan Carter" size={52} />
        <View style={{ flex: 1 }}>
          <Text variant="title">Jordan Carter</Text>
          <Text variant="small" tone="muted">
            Parent · Haven Premium
          </Text>
        </View>
        <Text variant="smallStrong" color={colors.primary}>
          Edit
        </Text>
      </Card>

      <SectionLabel>Notifications</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Push notifications" icon="bell" iconColor={colors.accent} chevron={false} right={<Toggle value={push} onChange={setPush} />} />
        <Row title="Weekly email digest" icon="mail" iconColor={colors.info} chevron={false} right={<Toggle value={emailDigest} onChange={setEmailDigest} />} />
      </Card>

      <SectionLabel>Privacy & security</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Require Face ID to open" icon="lock" iconColor={colors.primary} chevron={false} right={<Toggle value={biometric} onChange={setBiometric} />} />
        <Row title="Privacy & transparency" subtitle="What Haven shares with your child" icon="eye" iconColor={colors.success} onPress={() => (router.push as any)('/transparency')} />
        <Row title="Data & export" subtitle="Download or delete your data" icon="database" iconColor={colors.textMuted} onPress={() => {}} />
      </Card>

      <SectionLabel>About</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Help center" icon="help-circle" iconColor={colors.info} onPress={() => {}} />
        <Row title="Terms & privacy policy" icon="file-text" iconColor={colors.textMuted} onPress={() => {}} />
        <Row title="Version" subtitle="Haven 1.0.0 (demo)" icon="info" iconColor={colors.textMuted} chevron={false} />
      </Card>

      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <Row title="Sign out" icon="log-out" danger chevron={false} onPress={signOut} />
      </Card>
    </Screen>
  );
}
