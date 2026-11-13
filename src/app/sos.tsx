import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { radius, spacing, useTheme } from '@/theme';

export default function SOS() {
  const { colors } = useTheme();
  const { childSelf } = useStore();
  const [sent, setSent] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: sent ? colors.success : colors.danger }}>
      <LinearGradient colors={sent ? ['#16B981', '#0E9E6E'] : ['#FB4A4A', '#E23', '#B91C1C']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close}>
          <Feather name="x" size={24} color="#FFFFFF" />
        </Pressable>

        <View style={styles.body}>
          {sent ? (
            <>
              <View style={styles.bigIcon}>
                <Feather name="check" size={56} color="#FFFFFF" />
              </View>
              <Text variant="h1" color="#FFFFFF" center style={{ marginTop: spacing.xl }}>
                Help is on the way
              </Text>
              <Text variant="body" color="rgba(255,255,255,0.9)" center style={{ marginTop: spacing.sm, maxWidth: 300 }}>
                Your family has been alerted and can see your live location. Stay where you are if it's safe.
              </Text>
            </>
          ) : (
            <>
              <Text variant="h1" color="#FFFFFF" center>
                Emergency SOS
              </Text>
              <Text variant="body" color="rgba(255,255,255,0.9)" center style={{ marginTop: spacing.sm, maxWidth: 300 }}>
                This alerts your family right away and shares your live location with them.
              </Text>

              <Pressable onPress={() => setSent(true)} style={({ pressed }) => [styles.sosBtn, pressed && { transform: [{ scale: 0.96 }] }]}>
                <View style={styles.sosInner}>
                  <Feather name="alert-circle" size={44} color="#E23" />
                  <Text variant="h3" color="#E23" style={{ marginTop: 6 }}>
                    Send SOS
                  </Text>
                </View>
              </Pressable>

              <Text variant="small" color="rgba(255,255,255,0.85)" center>
                Tap to alert {childSelf.name.split(' ')[0]}'s family
              </Text>
            </>
          )}
        </View>

        {!sent && (
          <View style={styles.footer}>
            <ContactRow icon="phone" label="Call a parent" />
            <ContactRow icon="shield" label="Call emergency services" />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function ContactRow({ icon, label }: { icon: keyof typeof Feather.glyphMap; label: string }) {
  return (
    <View style={styles.contact}>
      <View style={styles.contactIcon}>
        <Feather name={icon} size={20} color="#FFFFFF" />
      </View>
      <Text variant="title" color="#FFFFFF" style={{ flex: 1 }}>
        {label}
      </Text>
      <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
    </View>
  );
}

const styles = StyleSheet.create({
  close: { alignSelf: 'flex-end', padding: spacing.lg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.lg },
  bigIcon: { width: 110, height: 110, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  sosBtn: { width: 200, height: 200, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginVertical: spacing.xl },
  sosInner: { width: 160, height: 160, borderRadius: 999, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  footer: { padding: spacing.xl, gap: spacing.sm },
  contact: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: 'rgba(255,255,255,0.15)', padding: spacing.lg, borderRadius: radius.lg },
  contactIcon: { width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
});
