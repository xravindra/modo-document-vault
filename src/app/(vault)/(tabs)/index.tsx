import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router, type Href } from 'expo-router';

import { DocumentCard } from '@/components/DocumentCard';
import { Headline, Kicker, PressableScale, Quiet, Screen, usePrefersReducedMotion } from '@/components/ui';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export default function HomeScreen() {
  const vault = useVault();
  const reduced = usePrefersReducedMotion();
  const recent = [...vault.documents].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const entering = (delay: number) => (reduced ? undefined : FadeInDown.duration(640).delay(delay));

  return (
    <Screen>
      <Animated.View entering={entering(40)}>
        <View style={styles.top}>
          <Kicker>MODO</Kicker>
          <PressableScale accessibilityLabel="Lock vault" onPress={() => void vault.lock()} style={styles.lock}>
            <Text style={styles.lockText}>Lock</Text>
          </PressableScale>
        </View>
        <Headline>Your vault</Headline>
        <Quiet>
          {vault.documents.length === 0
            ? 'Nothing is sealed yet. Add a file, or try the sample passport and watch the fields appear.'
            : `${vault.documents.length} ${vault.documents.length === 1 ? 'document is' : 'documents are'} sealed on this device.`}
        </Quiet>
      </Animated.View>

      <Animated.View entering={entering(120)} style={styles.pills}>
        <Text style={styles.pill}>Sealed</Text>
        <Text style={styles.pill}>Offline</Text>
        <Text style={styles.pill}>Integrity checked</Text>
      </Animated.View>

      <Animated.View entering={entering(180)} style={styles.actions}>
        <PressableScale accessibilityLabel="Seal a document" onPress={() => router.push('/add' as Href)} style={styles.primary}>
          <Text style={styles.primaryText}>Seal a document</Text>
        </PressableScale>
        <PressableScale
          accessibilityLabel="Try the sample passport"
          onPress={() => router.push('/add?sample=1' as Href)}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>Try the sample</Text>
        </PressableScale>
      </Animated.View>

      <Text style={styles.section}>Recent</Text>
      {recent.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>The shelf is clear</Text>
          <Text style={styles.emptyBody}>Files stay encrypted at rest. The library only keeps titles and the text that was read from them.</Text>
        </View>
      ) : (
        recent.map((doc) => <DocumentCard key={doc.id} doc={doc} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lock: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.line },
  lockText: { color: theme.paper, fontFamily: font.medium, fontSize: 14 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 },
  pill: {
    color: theme.moss,
    fontFamily: font.medium,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(158, 203, 178, 0.1)',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  primary: { flex: 1, backgroundColor: theme.gold, borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
  secondary: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.line,
  },
  secondaryText: { color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  section: {
    marginTop: 28,
    marginBottom: 12,
    color: theme.paperDim,
    fontFamily: font.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  empty: { borderRadius: 22, borderWidth: 1, borderColor: theme.line, padding: 18, backgroundColor: theme.inkRaised },
  emptyTitle: { color: theme.paper, fontFamily: font.displaySoft, fontSize: 22 },
  emptyBody: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22, marginTop: 6 },
});
