import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AddAvatarChoice, AvatarChoice, EmojiPicker } from '@/components/Avatar';
import { ChoiceMenu } from '@/components/ChoiceMenu';
import { PressableScale } from '@/components/ui';
import { canonicalCategory, sameCategory } from '@/lib/categories';
import { categoryMark } from '@/lib/emoji';
import { isDocKind, KINDS, kindLabel } from '@/lib/types';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export function KindPicker({
  categories,
  selected,
  onSelect,
  onRemoved,
  showLabel = true,
  scroll = false,
  holdMenu = false,
}: {
  categories: string[];
  selected: string | null;
  onSelect: (kind: string) => void;
  onRemoved?: (kind: string) => void;
  showLabel?: boolean;
  /** Lay categories out in one horizontally scrolling row instead of wrapping. */
  scroll?: boolean;
  /** Move emoji and delete into a drawer opened by pressing and holding a category. */
  holdMenu?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const vault = useVault();
  const custom = categories.filter((name) => !isDocKind(name));
  const pending = selected && !isDocKind(selected) && !custom.some((name) => sameCategory(name, selected)) ? [selected] : [];

  function choose(kind: string) {
    const isSelected = selected !== null && sameCategory(kind, selected);
    if (holdMenu) {
      if (!isSelected) onSelect(kind);
      return;
    }
    if (isSelected) {
      setPendingDelete(null);
      setEmojiOpen((open) => !open);
      return;
    }
    setEmojiOpen(false);
    onSelect(kind);
  }

  function add() {
    if (!composing) {
      setComposing(true);
      return;
    }
    const name = canonicalCategory(categories, draft);
    if (!name) {
      setDraft('');
      setComposing(false);
      return;
    }
    onSelect(name);
    setDraft('');
    setComposing(false);
  }

  function remove(name: string | null) {
    if (!name) return;
    setPendingDelete(null);
    setMenuFor(null);
    void vault
      .removeCategory(name)
      .then(() => {
        onRemoved?.(name);
        if (selected !== null && sameCategory(selected, name)) onSelect('other');
      })
      .catch(() => undefined);
  }

  return (
    <View style={[styles.wrap, showLabel ? null : styles.wrapBare]}>
      {showLabel ? <Text style={styles.label}>Category</Text> : null}
      <ScrollView
        contentContainerStyle={scroll ? styles.peopleRow : styles.people}
        horizontal={scroll}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scroll}
        showsHorizontalScrollIndicator={false}
        style={scroll ? styles.peopleScroll : undefined}
      >
        <AddAvatarChoice accessibilityLabel="Add category" onPress={add} />
        {KINDS.map((kind) => (
          <AvatarChoice
            key={kind.id}
            accessibilityLabel={`Category ${kind.label}`}
            emoji={categoryMark(kind.id, vault.categoryEmoji)}
            name={kind.label}
            onLongPress={holdMenu ? () => setMenuFor(kind.id) : undefined}
            onPress={() => choose(kind.id)}
            selected={selected === kind.id}
          />
        ))}
        {[...pending, ...custom].map((name) => {
          const removable = custom.some((item) => sameCategory(item, name));
          return (
            <View key={name} style={styles.slot}>
              <AvatarChoice
                accessibilityLabel={`Category ${name}`}
                emoji={categoryMark(name, vault.categoryEmoji)}
                name={kindLabel(name)}
                onLongPress={holdMenu ? () => setMenuFor(name) : undefined}
                onPress={() => choose(name)}
                selected={selected !== null && sameCategory(name, selected)}
              />
              {removable && !holdMenu ? (
                <PressableScale
                  accessibilityLabel={`Delete ${name}`}
                  onPress={() => {
                    setEmojiOpen(false);
                    setPendingDelete(name);
                  }}
                  style={styles.remove}
                >
                  <Text style={styles.removeText}>×</Text>
                </PressableScale>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      {emojiOpen && selected ? (
        <EmojiPicker
          onSelect={(emoji) => {
            void vault
              .setCategoryEmoji(selected, emoji)
              .then(() => setEmojiOpen(false))
              .catch(() => undefined);
          }}
          selected={categoryMark(selected, vault.categoryEmoji)}
        />
      ) : null}
      {pendingDelete ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>Delete {kindLabel(pendingDelete)}? Documents in {kindLabel(pendingDelete)} move to Other.</Text>
          <View style={styles.confirmRow}>
            <PressableScale accessibilityLabel="Cancel delete" onPress={() => setPendingDelete(null)} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </PressableScale>
            <PressableScale accessibilityLabel={`Delete ${pendingDelete}`} onPress={() => remove(pendingDelete)} style={styles.delete}>
              <Text style={styles.deleteText}>Delete</Text>
            </PressableScale>
          </View>
        </View>
      ) : null}
      {composing ? (
        <TextInput
          accessibilityLabel="New category name"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder="New category"
          placeholderTextColor={theme.paperFaint}
          returnKeyType="done"
          style={styles.input}
          value={draft}
        />
      ) : null}
      {holdMenu ? (
        <ChoiceMenu
          onClose={() => setMenuFor(null)}
          onDelete={() => remove(menuFor)}
          onEmoji={(emoji) => {
            if (!menuFor) return;
            void vault
              .setCategoryEmoji(menuFor, emoji)
              .then(() => setMenuFor(null))
              .catch(() => undefined);
          }}
          target={
            menuFor
              ? {
                  label: kindLabel(menuFor),
                  emoji: categoryMark(menuFor, vault.categoryEmoji),
                  deleteNote: custom.some((item) => sameCategory(item, menuFor))
                    ? `Documents in ${kindLabel(menuFor)} move to Other.`
                    : undefined,
                }
              : null
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginTop: 18 },
  wrapBare: { marginTop: 0 },
  label: {
    color: theme.gold,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  peopleScroll: { marginTop: 12, marginHorizontal: -4 },
  peopleRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 4 },
  slot: { width: 76, alignItems: 'center' },
  remove: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.danger,
  },
  removeText: { color: theme.ink, fontFamily: font.semibold, fontSize: 16, lineHeight: 18 },
  confirm: { width: '100%', marginTop: 12 },
  confirmText: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  cancel: { borderRadius: 14, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 14, paddingVertical: 10 },
  cancelText: { color: theme.paper, fontFamily: font.medium, fontSize: 14 },
  delete: { borderRadius: 14, backgroundColor: theme.danger, paddingHorizontal: 14, paddingVertical: 10 },
  deleteText: { color: theme.ink, fontFamily: font.semibold, fontSize: 14 },
  input: {
    width: '100%',
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    color: theme.paper,
    fontFamily: font.body,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
