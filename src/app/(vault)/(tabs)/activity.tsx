import { StyleSheet, Text, View } from 'react-native';

import { Headline, Kicker, Quiet, Screen } from '@/components/ui';
import { formatWhen } from '@/lib/format';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

const LABELS: Record<string, string> = {
  create: 'Created',
  unlock: 'Opened',
  add: 'Sealed',
  view: 'Viewed',
  delete: 'Removed',
  export: 'Exported',
  import: 'Imported',
  'pin-change': 'PIN',
  destroy: 'Destroyed',
};

export default function ActivityScreen() {
  const vault = useVault();
  return (
    <Screen>
      <Kicker>Activity</Kicker>
      <Headline>What happened here</Headline>
      <Quiet>This log is encrypted with the rest of the vault. It records actions, not document contents.</Quiet>
      <View style={styles.list}>
        {vault.activity.length === 0 ? (
          <Text style={styles.empty}>No activity yet.</Text>
        ) : (
          vault.activity.map((event) => (
            <View key={event.id} style={styles.row}>
              <View style={styles.dot} />
              <View style={styles.copy}>
                <Text style={styles.kind}>{LABELS[event.type] ?? event.type}</Text>
                <Text style={styles.detail}>{event.detail}</Text>
                <Text style={styles.when}>{formatWhen(event.at)}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 24 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.gold, marginTop: 6 },
  copy: { flex: 1, borderBottomWidth: 1, borderBottomColor: theme.line, paddingBottom: 14 },
  kind: { color: theme.gold, fontFamily: font.semibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  detail: { color: theme.paper, fontFamily: font.medium, fontSize: 16, marginTop: 4 },
  when: { color: theme.paperFaint, fontFamily: font.body, fontSize: 13, marginTop: 4 },
  empty: { color: theme.paperDim, fontFamily: font.body, fontSize: 15 },
});
