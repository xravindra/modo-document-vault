import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmojiCircle, EmojiPicker } from '@/components/Avatar';
import { Group, IconButton, ListRow, PressableScale } from '@/components/ui';
import { font, shade, theme } from '@/theme';

export type ChoiceMenuTarget = {
  label: string;
  emoji: string;
  /** Shown under the delete confirmation. Omit when the choice cannot be deleted. */
  deleteNote?: string;
};

/** Bottom drawer opened by holding a member or category choice. */
export function ChoiceMenu({
  target,
  onClose,
  onEmoji,
  onDelete,
}: {
  target: ChoiceMenuTarget | null;
  onClose: () => void;
  onEmoji: (emoji: string) => void;
  onDelete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'menu' | 'emoji' | 'delete'>('menu');

  const openFor = target?.label ?? null;

  useEffect(() => {
    if (openFor) setMode('menu');
  }, [openFor]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={target !== null}>
      <View style={styles.layer}>
        <Pressable accessibilityLabel="Close options" onPress={onClose} style={styles.backdrop} />
        {target ? (
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.grabber} />
            <View style={styles.head}>
              {mode === 'menu' ? (
                <View style={styles.headSide} />
              ) : (
                <IconButton label="Back to options" name="back" onPress={() => setMode('menu')} />
              )}
              <View style={styles.headCenter}>
                <EmojiCircle emoji={target.emoji} size={32} />
                <Text numberOfLines={1} style={styles.title}>
                  {target.label}
                </Text>
              </View>
              <IconButton label="Close" name="close" onPress={onClose} />
            </View>
            {mode === 'menu' ? (
              <Group>
                <ListRow
                  icon="pencil"
                  label="Change emoji"
                  last={!target.deleteNote}
                  onPress={() => setMode('emoji')}
                />
                {target.deleteNote ? (
                  <ListRow icon="trash" label="Delete" last onPress={() => setMode('delete')} tone="danger" />
                ) : null}
              </Group>
            ) : mode === 'emoji' ? (
              <EmojiPicker onSelect={onEmoji} selected={target.emoji} />
            ) : (
              <View style={styles.confirm}>
                <Text style={styles.confirmText}>
                  Delete {target.label}? {target.deleteNote}
                </Text>
                <View style={styles.confirmRow}>
                  <PressableScale accessibilityLabel="Cancel delete" onPress={() => setMode('menu')} style={styles.cancel}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </PressableScale>
                  <PressableScale accessibilityLabel={`Delete ${target.label}`} onPress={onDelete} style={styles.delete}>
                    <Text style={styles.deleteText}>Delete</Text>
                  </PressableScale>
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: shade(0.28) },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: theme.ink,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  grabber: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: shade(0.18), marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginBottom: 8 },
  headSide: { width: 44, height: 44 },
  headCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { flexShrink: 1, color: theme.paper, fontFamily: font.display, fontSize: 22 },
  confirm: { paddingVertical: 8 },
  confirmText: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  confirmRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  cancel: { flex: 1, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: theme.line, paddingVertical: 12 },
  cancelText: { color: theme.paper, fontFamily: font.medium, fontSize: 15 },
  delete: { flex: 1, alignItems: 'center', borderRadius: 14, backgroundColor: theme.danger, paddingVertical: 12 },
  deleteText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
});
