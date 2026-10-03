import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { PinDots, PinPad } from '@/components/PinPad';
import { Banner, PressableScale } from '@/components/ui';
import { VaultMark } from '@/components/VaultMark';
import { backupSummary } from '@/lib/backup';
import { PIN_LENGTH } from '@/lib/pin';
import { formatWhen } from '@/lib/format';
import { hapticError, hapticSuccess } from '@/lib/haptics';
import { pickBackupBytes } from '@/lib/pickBackup';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export function LockScreen() {
  const vault = useVault();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = height < 780;
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState<Uint8Array | null>(null);
  const [summary, setSummary] = useState<{ sealedFiles: number; exportedAt: number } | null>(null);
  const shake = useSharedValue(0);
  const paused = lockedUntil > now;

  useEffect(() => {
    if (!paused) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [paused]);

  function shakeDots(text: string) {
    hapticError();
    shake.value = withSequence(
      withTiming(-14, { duration: 45 }),
      withTiming(12, { duration: 45 }),
      withTiming(-8, { duration: 40 }),
      withTiming(0, { duration: 40 }),
    );
    setMessage(text);
    setPin('');
  }

  async function submit(next: string) {
    if (paused || busy) return;
    vault.clearError();
    setMessage(null);
    if (!vault.hasVault) {
      if (step === 'enter') {
        setFirst(next);
        setPin('');
        setStep('confirm');
        return;
      }
      if (next !== first) {
        setStep('enter');
        setFirst('');
        shakeDots('Those PINs do not match. Start again.');
        return;
      }
      setBusy('Sealing the vault key…');
      try {
        await vault.createVault(next);
        hapticSuccess();
      } catch (error) {
        shakeDots(error instanceof Error ? error.message : 'Could not create the vault.');
      } finally {
        setBusy('');
      }
      return;
    }

    setBusy('Checking the seal…');
    try {
      await vault.unlock(next, failures);
      hapticSuccess();
      setFailures(0);
    } catch (error) {
      const count = failures + 1;
      setFailures(count);
      if (count >= 5) {
        setLockedUntil(Date.now() + 30_000);
        setFailures(0);
        shakeDots('Too many attempts. The pad pauses for 30 seconds.');
      } else {
        const left = 5 - count;
        const reason = error instanceof Error ? error.message : 'That PIN does not open this vault.';
        shakeDots(`${reason} ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`);
      }
    } finally {
      setBusy('');
    }
  }

  async function chooseBackup() {
    if (busy) return;
    vault.clearError();
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
    if (!pending || busy) return;
    setBusy('Restoring onto this device…');
    setMessage(null);
    try {
      await vault.importBackup(pending);
      setPending(null);
      setSummary(null);
      setStep('enter');
      setFirst('');
      setPin('');
      setMessage('Restored on this device. Enter the PIN from the phone that made the backup.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not restore the backup.');
    } finally {
      setBusy('');
    }
  }

  function cancelRestore() {
    setPending(null);
    setSummary(null);
  }

  async function biometric(automatic = false) {
    if (busy || paused) return;
    setBusy(vault.hasFingerprint ? 'Waiting for your fingerprint…' : 'Waiting for biometrics…');
    setMessage(null);
    try {
      await vault.unlockWithBiometrics();
      hapticSuccess();
    } catch (error) {
      if (!automatic) {
        shakeDots(error instanceof Error ? error.message : 'Fingerprint unlock was cancelled.');
      }
    } finally {
      setBusy('');
    }
  }

  const prompted = useRef(false);
  useEffect(() => {
    if (prompted.current || pending || paused || !vault.hasVault || !vault.biometricsReady) return;
    prompted.current = true;
    void biometric(true);
  }, [pending, paused, vault.hasVault, vault.biometricsReady]);

  const title = pending
    ? 'Restore a backup'
    : !vault.hasVault
      ? step === 'confirm'
        ? 'Confirm the PIN'
        : 'Choose a PIN'
      : 'Welcome back';
  const subtitle = pending
    ? 'This writes the backup into private storage on this device. The PIN from the phone that made it still opens the vault.'
    : !vault.hasVault
      ? 'Four digits. They stay on this phone, and so do your files.'
      : 'Enter your PIN.';

  return (
    <View style={[styles.root, width > 0 ? { width, maxWidth: width } : null, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.glow} pointerEvents="none" />
      <View style={[styles.column, { width: width > 0 ? Math.min(width, 460) : '100%', maxWidth: '100%' }]}>
        <VaultMark compact={compact} />
        <Text style={styles.kicker}>MODO</Text>
        <Text style={[styles.title, compact ? styles.titleCompact : null]}>{title}</Text>
        <Text style={styles.subtitle}>{busy || subtitle}</Text>
        {pending && summary ? (
          <View style={styles.restore}>
            <Text style={styles.restoreTitle}>
              {summary.sealedFiles} {summary.sealedFiles === 1 ? 'sealed file' : 'sealed files'}
            </Text>
            <Text style={styles.restoreMeta}>Exported {formatWhen(summary.exportedAt)}</Text>
            <PressableScale
              accessibilityLabel={vault.hasVault ? 'Replace this device' : 'Restore on this device'}
              disabled={!!busy}
              onPress={() => void confirmRestore()}
              style={styles.restoreButton}
            >
              <Text style={styles.restoreButtonText}>{vault.hasVault ? 'Replace this device' : 'Restore on this device'}</Text>
            </PressableScale>
            <PressableScale accessibilityLabel="Cancel restore" disabled={!!busy} onPress={cancelRestore} style={styles.bio}>
              <Text style={styles.bioText}>Cancel</Text>
            </PressableScale>
          </View>
        ) : (
          <>
            <PinDots length={pin.length} total={PIN_LENGTH} shake={shake} />
            <Banner message={paused ? `Try again in ${Math.ceil((lockedUntil - now) / 1000)}s.` : message || vault.error} />
            <PinPad
              value={pin}
              length={PIN_LENGTH}
              disabled={!!busy || paused}
              onChange={setPin}
              onComplete={(next) => void submit(next)}
              sideAction={{
                label: vault.hasVault ? 'Replace from a backup' : 'Restore a backup',
                onPress: () => void chooseBackup(),
              }}
            />
            {vault.hasVault && vault.biometricsReady ? (
              <PressableScale
                accessibilityLabel={vault.hasFingerprint ? 'Unlock with fingerprint' : 'Unlock with biometrics'}
                onPress={() => void biometric()}
                style={[styles.bio, styles.bioPill]}
              >
                <Icon color={theme.gold} name="key" size={20} />
                <Text style={styles.bioText}>{vault.hasFingerprint ? 'Use fingerprint' : 'Use biometrics'}</Text>
              </PressableScale>
            ) : null}
          </>
        )}
        {pending ? <Banner message={message || vault.error} /> : null}
        <Text style={styles.footer}>Private to this phone</Text>
      </View>
    </View>
  );
}

export function BootScreen() {
  return (
    <View style={styles.root}>
      <VaultMark />
      <Text style={styles.footer}>Opening the vault</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.ink, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  glow: {
    position: 'absolute',
    width: '80%',
    maxWidth: 460,
    aspectRatio: 1,
    borderRadius: 230,
    backgroundColor: 'rgba(180, 83, 26, 0.16)',
  },
  column: { maxWidth: '100%', minWidth: 0, paddingHorizontal: 24 },
  kicker: {
    color: theme.paperFaint,
    fontFamily: font.semibold,
    letterSpacing: 3,
    fontSize: 12,
    textAlign: 'center',
  },
  title: {
    color: theme.paper,
    fontFamily: font.display,
    fontSize: 40,
    textAlign: 'center',
    marginTop: 6,
  },
  titleCompact: { fontSize: 30 },
  subtitle: {
    color: theme.paperDim,
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  bio: { marginTop: 14, alignItems: 'center', padding: 12 },
  bioPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
  },
  bioText: { color: theme.paper, fontFamily: font.medium, fontSize: 15 },
  restore: { marginTop: 18, alignItems: 'center' },
  restoreTitle: { color: theme.paper, fontFamily: font.displaySoft, fontSize: 28, textAlign: 'center' },
  restoreMeta: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, marginTop: 6, textAlign: 'center' },
  restoreButton: {
    marginTop: 16,
    backgroundColor: theme.paper,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  restoreButtonText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
  footer: {
    color: theme.paperFaint,
    fontFamily: font.medium,
    fontSize: 12,
    letterSpacing: 0.6,
    textAlign: 'center',
    marginTop: 16,
  },
});
