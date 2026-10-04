import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { Banner, Group, ListRow, PressableScale, Quiet, Screen } from '@/components/ui';
import { PinPad } from '@/components/PinPad';
import { backupSummary } from '@/lib/backup';
import { BACKUP_EVERY } from '@/lib/backupSchedule';
import { formatWhen } from '@/lib/format';
import { pickBackupBytes } from '@/lib/pickBackup';
import { PIN_LENGTH } from '@/lib/pin';
import { useBackup } from '@/state/BackupContext';
import { usePlan } from '@/state/PlanContext';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

const LOCKS = [
  { ms: 0, label: '0 sec' },
  { ms: 60_000, label: '1 min' },
  { ms: 300_000, label: '5 min' },
  { ms: -1, label: 'Never' },
];

export default function SettingsScreen() {
  const vault = useVault();
  const plan = usePlan();
  const backup = useBackup();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinStep, setPinStep] = useState<'idle' | 'current' | 'next' | 'confirm'>('idle');
  const [pin, setPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [pending, setPending] = useState<Uint8Array | null>(null);
  const [summary, setSummary] = useState<{ sealedFiles: number; exportedAt: number } | null>(null);
  const [confirmDestroy, setConfirmDestroy] = useState(false);
  const bioName = vault.hasFingerprint ? 'Fingerprint unlock' : 'Biometric unlock';
  const showBio = vault.canUseBiometrics || vault.bioMode !== 'off';

  async function exportBackup() {
    setBusy(true);
    setMessage(null);
    try {
      await backup.backUpNow();
      setMessage('Backup saved. Keep it somewhere other than this phone. The file and your PIN together open the vault.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function chooseBackup() {
    setMessage(null);
    try {
      const bytes = await pickBackupBytes();
      if (!bytes) return;
      setSummary(backupSummary(bytes));
      setPending(bytes);
    } catch (error) {
      setPending(null);
      setSummary(null);
      setMessage(error instanceof Error ? error.message : 'That file is not a MODO backup.');
    }
  }

  async function confirmRestore() {
    if (!pending) return;
    setBusy(true);
    setMessage(null);
    try {
      await vault.importBackup(pending);
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  function destroy() {
    setConfirmDestroy(false);
    void vault.destroy().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not destroy the vault.');
    });
  }

  async function toggleBiometrics() {
    try {
      if (vault.settings.biometrics) await vault.disableBiometrics();
      else await vault.enableBiometrics();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update biometrics.');
    }
  }

  async function submitPin(value: string) {
    setMessage(null);
    if (pinStep === 'current') {
      setBusy(true);
      const ok = await vault.verifyPin(value);
      setBusy(false);
      setPin('');
      if (!ok) {
        setMessage('That is not the current PIN.');
        return;
      }
      setPinStep('next');
      return;
    }
    if (pinStep === 'next') {
      setNextPin(value);
      setPin('');
      setPinStep('confirm');
      return;
    }
    if (value !== nextPin) {
      setMessage('Those new PINs do not match.');
      setPin('');
      setNextPin('');
      setPinStep('next');
      return;
    }
    setBusy(true);
    try {
      await vault.changePin(value);
      setPinStep('idle');
      setPin('');
      setNextPin('');
      setMessage('PIN updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not change the PIN.');
    } finally {
      setBusy(false);
    }
  }

  function cancelPin() {
    setPinStep('idle');
    setPin('');
    setNextPin('');
  }

  return (
    <Screen>
      <Text style={styles.title}>Settings</Text>
      <Quiet>Your vault lives only on this phone.</Quiet>
      <Banner message={message} />

      <Group title="Plan">
        <ListRow
          detail={
            plan.status.kind === 'active'
              ? `Renews ${formatWhen(plan.status.renewsAt)}`
              : plan.status.kind === 'trial'
                ? `Free trial, ${plan.status.daysLeft} ${plan.status.daysLeft === 1 ? 'day' : 'days'} left`
                : 'Trial ended. Your documents are still here.'
          }
          icon="shield"
          label={plan.status.kind === 'active' ? `MODO Plus ${plan.status.plan === 'yearly' ? 'yearly' : 'monthly'}` : 'MODO Plus'}
          last={!__DEV__}
          onPress={() => router.push('/plans' as Href)}
          value={plan.status.kind === 'active' ? 'Active' : 'See plans'}
        />
        {__DEV__ ? (
          <>
            <ListRow detail="Development builds only" icon="reset" label="Start a fresh trial" onPress={() => void plan.simulate('fresh')} />
            <ListRow detail="Development builds only" icon="clock" label="End the trial now" last onPress={() => void plan.simulate('ended')} />
          </>
        ) : null}
      </Group>

      <Group title="Lock">
        <View style={styles.lockBlock}>
          <Text style={styles.blockLabel}>Lock the vault when I leave the app</Text>
          <View style={styles.segment}>
            {LOCKS.map((option) => {
              const on = vault.settings.autoLockMs === option.ms;
              return (
                <PressableScale
                  key={option.label}
                  accessibilityLabel={`Auto-lock ${option.label}`}
                  onPress={() => void vault.updateSettings({ autoLockMs: option.ms })}
                  style={[styles.segmentItem, on ? styles.segmentOn : null]}
                >
                  <Text style={[styles.segmentText, on ? styles.segmentTextOn : null]}>{option.label}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
        {showBio ? (
          <ListRow
            detail="Your PIN still works."
            disabled={busy}
            icon="key"
            label={bioName}
            onPress={() => void toggleBiometrics()}
            toggle={vault.settings.biometrics}
          />
        ) : null}
        <ListRow
          icon="lock"
          label="Change PIN"
          last={pinStep === 'idle'}
          onPress={() => (pinStep === 'idle' ? setPinStep('current') : cancelPin())}
          value={pinStep === 'idle' ? undefined : 'Cancel'}
        />
        {pinStep !== 'idle' ? (
          <View style={styles.pinBlock}>
            <Text style={styles.pinLabel}>
              {pinStep === 'current' ? 'Enter your current PIN' : pinStep === 'next' ? 'Choose a new PIN' : 'Enter the new PIN again'}
            </Text>
            <PinPad
              disabled={busy}
              length={PIN_LENGTH}
              onChange={setPin}
              onComplete={(value) => void submitPin(value)}
              value={pin}
            />
          </View>
        ) : null}
      </Group>

      <Group title="Backup">
        <View style={styles.lockBlock}>
          <Text style={styles.blockLabel}>Back up to Google Drive</Text>
          <Text style={styles.blockHint}>
            {backup.schedule.every === 'off'
              ? 'Pick how often. When a backup is due, MODO reminds you on Home and opens the share sheet so you can choose Drive.'
              : backup.schedule.lastAt
                ? `Last backup ${formatWhen(backup.schedule.lastAt)}. ${backup.due ? 'A new one is due.' : ''}`
                : 'No backup yet. One is due now.'}
          </Text>
          <View style={styles.segment}>
            {BACKUP_EVERY.map((option) => {
              const on = backup.schedule.every === option.id;
              return (
                <PressableScale
                  key={option.id}
                  accessibilityLabel={`Back up ${option.label}`}
                  onPress={() => void backup.setEvery(option.id)}
                  style={[styles.segmentItem, on ? styles.segmentOn : null]}
                >
                  <Text style={[styles.segmentText, on ? styles.segmentTextOn : null]}>{option.label}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
        <ListRow
          detail="An encrypted file. Choose Google Drive in the share sheet."
          disabled={busy || backup.busy}
          icon="upload"
          label={busy || backup.busy ? 'Working…' : 'Back up now'}
          onPress={() => void exportBackup()}
        />
        <ListRow
          detail="Replaces the vault on this phone"
          disabled={busy}
          icon="download"
          label="Restore a backup"
          last={!(pending && summary)}
          onPress={() => void chooseBackup()}
        />
        {pending && summary ? (
          <View style={styles.confirm}>
            <Text style={styles.confirmText}>
              Restore {summary.sealedFiles} {summary.sealedFiles === 1 ? 'file' : 'files'} from {formatWhen(summary.exportedAt)}? This replaces everything on this phone.
            </Text>
            <View style={styles.confirmRow}>
              <PressableScale
                accessibilityLabel="Cancel restore"
                disabled={busy}
                onPress={() => {
                  setPending(null);
                  setSummary(null);
                }}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </PressableScale>
              <PressableScale accessibilityLabel="Replace this device" disabled={busy} onPress={() => void confirmRestore()} style={styles.primary}>
                <Text style={styles.primaryText}>Restore</Text>
              </PressableScale>
            </View>
          </View>
        ) : null}
      </Group>

      <Group title="About">
        <ListRow detail="Encryption, integrity, and what stays private" icon="shield" label="How your files are protected" last onPress={() => router.push('/security' as Href)} />
      </Group>

      <Group title="Danger zone">
        <ListRow
          icon="trash"
          label="Erase this vault"
          last={!confirmDestroy}
          onPress={() => setConfirmDestroy(true)}
          tone="danger"
        />
        {confirmDestroy ? (
          <View style={styles.confirm}>
            <Text style={styles.confirmText}>Every document, the catalog, and your PIN will be deleted from this phone. This cannot be undone.</Text>
            <View style={styles.confirmRow}>
              <PressableScale accessibilityLabel="Keep the vault" onPress={() => setConfirmDestroy(false)} style={styles.secondary}>
                <Text style={styles.secondaryText}>Keep it</Text>
              </PressableScale>
              <PressableScale accessibilityLabel="Erase the vault" onPress={destroy} style={[styles.primary, styles.dangerButton]}>
                <Text style={styles.dangerText}>Erase</Text>
              </PressableScale>
            </View>
          </View>
        ) : null}
      </Group>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.paper, fontFamily: font.display, fontSize: 32, lineHeight: 38 },
  lockBlock: { padding: 14, borderBottomWidth: 1, borderBottomColor: theme.line },
  blockLabel: { color: theme.paper, fontFamily: font.medium, fontSize: 16 },
  blockHint: { color: theme.paperDim, fontFamily: font.body, fontSize: 13, lineHeight: 19, marginTop: 4 },
  segment: { flexDirection: 'row', marginTop: 12, padding: 4, borderRadius: 14, backgroundColor: theme.ink, gap: 4 },
  segmentItem: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: theme.sheet, borderWidth: 1, borderColor: theme.line },
  segmentText: { color: theme.paperDim, fontFamily: font.medium, fontSize: 13 },
  segmentTextOn: { color: theme.paper, fontFamily: font.semibold },
  pinBlock: { paddingHorizontal: 14, paddingBottom: 18 },
  pinLabel: { color: theme.paper, fontFamily: font.semibold, fontSize: 16, textAlign: 'center', marginTop: 8 },
  confirm: { padding: 14, borderTopWidth: 1, borderTopColor: theme.line },
  confirmText: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  primary: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
  dangerButton: { backgroundColor: theme.danger },
  dangerText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
});
