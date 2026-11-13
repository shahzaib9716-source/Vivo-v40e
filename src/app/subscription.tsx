import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Button, Card, Header, Screen, Text } from '@/components/ui';
import { radius, shadow, spacing, useTheme } from '@/theme';

const PLANS = [
  { id: 'month', name: 'Monthly', price: '$9.99', per: '/month', note: '' },
  { id: 'year', name: 'Yearly', price: '$59.99', per: '/year', note: 'Save 50%' },
];

const FEATURES = [
  'Unlimited children & devices',
  'Full screen-time & app controls',
  'Live location & unlimited geofences',
  '30-day activity & location history',
  'Detailed weekly reports',
  'Priority support',
];

export default function Subscription() {
  const { colors } = useTheme();
  const [plan, setPlan] = useState('year');

  return (
    <Screen>
      <Header back title="Haven Premium" />

      <LinearGradient colors={['#5B51E0', '#8B5CF6', '#FF7A59']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Feather name="star" size={30} color="#FFFFFF" />
        <Text variant="h2" color="#FFFFFF" style={{ marginTop: spacing.sm }}>
          Protect your whole family
        </Text>
        <Text variant="small" color="rgba(255,255,255,0.9)" center style={{ marginTop: 4 }}>
          Everything in Haven, no limits.
        </Text>
      </LinearGradient>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.xl }}>
        {PLANS.map((p) => {
          const on = plan === p.id;
          return (
            <Card key={p.id} onPress={() => setPlan(p.id)} style={[{ flex: 1 }, on && { borderColor: colors.primary, borderWidth: 2 }]}>
              {p.note ? (
                <View style={[styles.save, { backgroundColor: colors.success }]}>
                  <Text variant="tiny" color="#FFFFFF">
                    {p.note}
                  </Text>
                </View>
              ) : null}
              <Text variant="title">{p.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
                <Text variant="h1">{p.price}</Text>
                <Text variant="small" tone="muted" style={{ marginBottom: 4 }}>
                  {p.per}
                </Text>
              </View>
              <View style={[styles.radio, { borderColor: on ? colors.primary : colors.border }]}>
                {on && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
              </View>
            </Card>
          );
        })}
      </View>

      <Card style={{ marginBottom: spacing.xl }}>
        {FEATURES.map((f) => (
          <View key={f} style={styles.feat}>
            <View style={[styles.check, { backgroundColor: colors.successSoft }]}>
              <Feather name="check" size={14} color={colors.success} />
            </View>
            <Text variant="body" style={{ flex: 1 }}>
              {f}
            </Text>
          </View>
        ))}
      </Card>

      <Button label={`Start free trial — ${PLANS.find((p) => p.id === plan)?.price}`} full icon="star" onPress={() => {}} />
      <Text variant="tiny" tone="faint" center style={{ marginTop: spacing.md }}>
        7-day free trial, cancel anytime. Demo — no real charge.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', padding: spacing.xl, borderRadius: radius.card, ...shadow(2) },
  save: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  radio: { width: 22, height: 22, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  radioDot: { width: 11, height: 11, borderRadius: 999 },
  feat: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 7 },
  check: { width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
