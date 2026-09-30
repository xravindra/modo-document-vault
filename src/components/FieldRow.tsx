import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import { copyText } from '@/lib/copyText';
import { shareDocument } from '@/lib/deliver';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

function ShareMark({ done }: { done: boolean }) {
  const color = done ? theme.moss : theme.gold;
  if (done) {
    return (
      <View style={styles.mark}>
        <View style={[styles.check, { borderColor: color }]} />
      </View>
    );
  }
  return (
    <View style={styles.mark}>
      <View style={[styles.node, styles.nodeTop, { backgroundColor: color }]} />
      <View style={[styles.node, styles.nodeLeft, { backgroundColor: color }]} />
      <View style={[styles.node, styles.nodeRight, { backgroundColor: color }]} />
      <View style={[styles.link, styles.linkUp, { backgroundColor: color }]} />
      <View style={[styles.link, styles.linkAcross, { backgroundColor: color }]} />
    </View>
  );
}

function DeleteMark() {
  return (
    <View style={styles.mark}>
      <View style={[styles.slash, styles.slashA]} />
      <View style={[styles.slash, styles.slashB]} />
    </View>
  );
}

function CopyMark({ done }: { done: boolean }) {
  const color = done ? theme.moss : theme.gold;
  if (done) {
    return (
      <View style={styles.mark}>
        <View style={[styles.check, { borderColor: color }]} />
      </View>
    );
  }
  return (
    <View style={styles.mark}>
      <View style={[styles.page, styles.pageBack, { borderColor: color }]} />
      <View style={[styles.page, styles.pageFront, { borderColor: color }]} />
    </View>
  );
}

export function FieldRow({
  label,
  value,
  onChangeLabel,
  onChangeValue,
  onDelete,
}: {
  label: string;
  value: string;
  onChangeLabel?: (label: string) => void;
  onChangeValue?: (value: string) => void;
  onDelete?: () => void;
}) {
  const vault = useVault();
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!shared) return;
    const timer = setTimeout(() => setShared(false), 1200);
    return () => clearTimeout(timer);
  }, [shared]);

  async function copy() {
    try {
      await copyText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    vault.holdAutoLock();
    try {
      const outcome = await shareDocument({ title: label, text: `${label}: ${value}`, file: null });
      if (outcome !== 'cancelled') setShared(true);
    } catch {
      setShared(false);
    } finally {
      vault.releaseAutoLock();
    }
  }

  return (
    <View style={styles.field}>
      {onChangeLabel ? (
        <TextInput
          accessibilityLabel={`Edit label ${label || 'field'}`}
          onChangeText={onChangeLabel}
          placeholder="Label"
          placeholderTextColor={theme.paperFaint}
          style={styles.labelInput}
          value={label}
        />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
      <View style={styles.row}>
        {onChangeValue ? (
          <TextInput
            accessibilityLabel={label || 'Field value'}
            onChangeText={onChangeValue}
            placeholder="Value"
            placeholderTextColor={theme.paperFaint}
            style={styles.input}
            value={value}
          />
        ) : (
          <Text style={styles.value}>{value}</Text>
        )}
        <View style={styles.tools}>
          {onDelete ? (
            <PressableScale accessibilityLabel={`Delete ${label || 'field'}`} onPress={onDelete} style={styles.tool}>
              <DeleteMark />
            </PressableScale>
          ) : null}
          <PressableScale
            accessibilityLabel={copied ? `Copied ${label}` : `Copy ${label}`}
            onPress={() => void copy()}
            style={styles.tool}
          >
            <CopyMark done={copied} />
          </PressableScale>
          <PressableScale
            accessibilityLabel={shared ? `Shared ${label}` : `Share ${label}`}
            onPress={() => void share()}
            style={styles.tool}
          >
            <ShareMark done={shared} />
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.line },
  label: { color: theme.gold, fontFamily: font.semibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  labelInput: {
    alignSelf: 'flex-start',
    minWidth: 120,
    color: theme.gold,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingVertical: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.line,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  value: { flex: 1, color: theme.paper, fontFamily: font.displaySoft, fontSize: 24 },
  input: {
    flex: 1,
    minWidth: 0,
    color: theme.paper,
    fontFamily: font.displaySoft,
    fontSize: 24,
    paddingVertical: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.line,
  },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tool: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { width: 16, height: 16 },
  node: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
  nodeTop: { top: 0, right: 1 },
  nodeLeft: { left: 0, bottom: 1 },
  nodeRight: { right: 1, bottom: 1 },
  link: { position: 'absolute', height: 1.5, borderRadius: 1 },
  linkUp: { width: 9, left: 4, top: 6, transform: [{ rotate: '-42deg' }] },
  linkAcross: { width: 8, left: 3, bottom: 2.5 },
  page: { position: 'absolute', width: 11, height: 13, borderWidth: 1.5, borderRadius: 2 },
  pageBack: { top: 0, right: 0 },
  pageFront: { left: 0, bottom: 0, backgroundColor: theme.ink },
  slash: {
    position: 'absolute',
    width: 12,
    height: 1.6,
    borderRadius: 1,
    backgroundColor: theme.danger,
    top: 7,
    left: 2,
  },
  slashA: { transform: [{ rotate: '45deg' }] },
  slashB: { transform: [{ rotate: '-45deg' }] },
  check: {
    width: 8,
    height: 5,
    marginTop: 4,
    marginLeft: 3,
    borderLeftWidth: 1.8,
    borderBottomWidth: 1.8,
    transform: [{ rotate: '-45deg' }],
  },
});
