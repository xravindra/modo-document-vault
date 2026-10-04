import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/ui';
import { formatWhen } from '@/lib/format';
import { useBackup } from '@/state/BackupContext';
import { font, theme, tint } from '@/theme';

export function BackupBanner() {
  const backup = useBackup();
  const [error, setError] = useState<string | null>(null);
  if (!backup.due) return null;

  async function run() {
    setError(null);
    try {
      await backup.backUpNow();
    } catch (next) {
      setError(next instanceof Error ? next.message : 'Could not make the backup.');
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon color={theme.gold} name="upload" size={20} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Backup due</Text>
          <Text style={styles.body}>
            {error ??
              (backup.schedule.lastAt
                ? `Last saved ${formatWhen(backup.schedule.lastAt)}. Choose Google Drive in the share sheet.`
                : 'Save an encrypted copy. Choose Google Drive in the share sheet.')}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <PressableScale accessibilityLabel="Remind me tomorrow" disabled={backup.busy} onPress={() => void backup.later()} style={styles.later}>
          <Text style={styles.laterText}>Tomorrow</Text>
        </PressableScale>
        <PressableScale accessibilityLabel="Back up now" disabled={backup.busy} onPress={() => void run()} style={styles.now}>
          <Text style={styles.nowText}>{backup.busy ? 'Preparing…' : 'Back up now'}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tint(0.25),
    backgroundColor: tint(0.06),
    padding: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(0.12) },
  copy: { flex: 1, minWidth: 0 },
  title: { color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  body: { color: theme.paperDim, fontFamily: font.body, fontSize: 13, lineHeight: 18, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  later: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterText: { color: theme.paper, fontFamily: font.medium, fontSize: 14 },
  now: { flex: 1.4, minHeight: 44, borderRadius: 14, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center' },
  nowText: { color: theme.ink, fontFamily: font.semibold, fontSize: 14 },
});
