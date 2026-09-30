import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router, type Href } from 'expo-router';

import { Headline, Kicker, PressableScale, Quiet, Screen, usePrefersReducedMotion } from '@/components/ui';
import { KDF_ITERATIONS } from '@/lib/seal';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export default function SecurityScreen() {
  const vault = useVault();
  const reduced = usePrefersReducedMotion();
  const auto =
    vault.settings.autoLockMs < 0
      ? 'Manual lock only'
      : vault.settings.autoLockMs === 0
        ? 'Locks when the app leaves the foreground'
        : `Locks after ${Math.round(vault.settings.autoLockMs / 60000)} min in the background`;
  const bio =
    vault.bioMode === 'hardware'
      ? 'On. The device keychain asks for biometrics before it releases the vault key.'
      : vault.bioMode === 'gate'
        ? 'On. This install asks for biometrics, then reads the key. A store build binds that read to secure hardware.'
        : 'Off.';

  const pillars = [
    {
      title: 'Confidentiality',
      body: `Every file and the catalog are AES-256-GCM. A random vault key does the sealing. Your PIN only wraps that key with PBKDF2-HMAC-SHA256, ${KDF_ITERATIONS.toLocaleString('en-US')} rounds. The PIN is never stored.`,
    },
    {
      title: 'Integrity',
      body: 'Each blob carries a GCM authentication tag. Opening a document also recomputes its SHA-256 and compares it with the hash saved at seal time.',
    },
    {
      title: 'Authentication',
      body: `${auto} Repeated wrong PINs pause the pad. Biometrics: ${bio}`,
    },
    {
      title: 'Availability',
      body: 'Sealed files stay in private storage on this device. Nothing is uploaded. Export a backup and keep that file off the phone. On a new device, or if this phone is replaced, restore that file from the lock screen and enter the same PIN.',
    },
    {
      title: 'Least privilege',
      body: 'Camera and file access are requested only when you add a document. There is no account. Document bytes are not sent to a server.',
    },
    {
      title: 'Accountability',
      body: `${vault.activity.length} encrypted activity ${vault.activity.length === 1 ? 'entry is' : 'entries are'} stored with the catalog.`,
    },
  ];

  return (
    <Screen>
      <Kicker>Security</Kicker>
      <Headline>How the vault holds</Headline>
      <Quiet>These are the controls actually running in this app, not a checklist of intentions.</Quiet>
      {pillars.map((pillar, index) => (
        <Animated.View
          key={pillar.title}
          entering={reduced ? undefined : FadeInDown.duration(520).delay(70 * index)}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>{pillar.title}</Text>
          <Text style={styles.cardBody}>{pillar.body}</Text>
        </Animated.View>
      ))}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Speed</Text>
        <Text style={styles.cardBody}>
          The library reads the catalog, not every file. Text recognition runs when you add a document. Lists are virtualized. System reduced-motion is respected.
        </Text>
      </View>
      <PressableScale accessibilityLabel="Vault settings" onPress={() => router.push('/settings' as Href)} style={styles.button}>
        <Text style={styles.buttonText}>PIN, backup, and lock timing</Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    padding: 16,
  },
  cardTitle: { color: theme.gold, fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.1, textTransform: 'uppercase' },
  cardBody: { color: theme.paper, fontFamily: font.body, fontSize: 15, lineHeight: 22, marginTop: 8 },
  button: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: theme.gold,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
});
