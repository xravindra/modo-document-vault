import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Quiet, Screen } from '@/components/ui';
import { formatWhen } from '@/lib/format';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

const EVENTS: Record<string, { label: string; icon: IconName }> = {
  create: { label: 'Vault created', icon: 'shield' },
  unlock: { label: 'Unlocked', icon: 'unlock' },
  add: { label: 'Added', icon: 'plus' },
  view: { label: 'Viewed', icon: 'file' },
  rename: { label: 'Renamed', icon: 'pencil' },
  edit: { label: 'Saved', icon: 'check' },
  delete: { label: 'Removed', icon: 'trash' },
  export: { label: 'Backup exported', icon: 'upload' },
  import: { label: 'Backup restored', icon: 'download' },
  'pin-change': { label: 'PIN changed', icon: 'key' },
  destroy: { label: 'Vault destroyed', icon: 'trash' },
};

export default function ActivityScreen() {
  const vault = useVault();
  return (
    <Screen>
      <Text style={styles.title}>Activity</Text>
      <Quiet>Every action is logged and encrypted with the vault. Document contents are never recorded.</Quiet>
      <View style={styles.list}>
        {vault.activity.length === 0 ? (
          <Text style={styles.empty}>No activity yet.</Text>
        ) : (
          vault.activity.map((event, index) => {
            const meta = EVENTS[event.type] ?? { label: event.type, icon: 'clock' as IconName };
            const last = index === vault.activity.length - 1;
            return (
              <View key={event.id} style={styles.row}>
                <View style={styles.rail}>
                  <View style={styles.badge}>
                    <Icon color={theme.gold} name={meta.icon} size={18} />
                  </View>
                  {last ? null : <View style={styles.line} />}
                </View>
                <View style={styles.copy}>
                  <Text style={styles.kind}>{meta.label}</Text>
                  {event.detail ? <Text style={styles.detail}>{event.detail}</Text> : null}
                  <Text style={styles.when}>{formatWhen(event.at)}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.paper, fontFamily: font.display, fontSize: 32, lineHeight: 38 },
  list: { marginTop: 24 },
  row: { flexDirection: 'row', gap: 14 },
  rail: { alignItems: 'center', width: 36 },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.inkRaised,
    borderWidth: 1,
    borderColor: theme.line,
  },
  line: { flex: 1, width: 2, marginVertical: 4, borderRadius: 1, backgroundColor: theme.line },
  copy: { flex: 1, minWidth: 0, paddingTop: 6, paddingBottom: 22 },
  kind: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  detail: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, lineHeight: 20, marginTop: 2 },
  when: { color: theme.paperFaint, fontFamily: font.medium, fontSize: 12, marginTop: 4 },
  empty: { color: theme.paperDim, fontFamily: font.body, fontSize: 15 },
});
