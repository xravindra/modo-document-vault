import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AddAvatarChoice, AvatarChoice, EmojiPicker } from '@/components/Avatar';
import { ChoiceMenu } from '@/components/ChoiceMenu';
import { PressableScale } from '@/components/ui';
import { memberMark } from '@/lib/emoji';
import { canonicalMember, MEMBER_ROLES, memberRole, normalizeMember, sameMember, SELF } from '@/lib/members';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export function MemberPicker({
  members,
  selected,
  onSelect,
  onRemoved,
  showLabel = true,
  scroll = false,
  holdMenu = false,
}: {
  members: string[];
  selected: string;
  onSelect: (name: string) => void;
  onRemoved?: (name: string) => void;
  showLabel?: boolean;
  /** Lay members out in one horizontally scrolling row instead of wrapping. */
  scroll?: boolean;
  /** Move emoji and delete into a drawer opened by pressing and holding a member. */
  holdMenu?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const vault = useVault();
  const pending = normalizeMember(selected);
  const custom = members.filter((name) => !memberRole(name));
  const extra = pending && !memberRole(pending) && !custom.some((name) => sameMember(name, pending)) ? [pending] : [];
  const shown = [...MEMBER_ROLES, ...extra, ...custom];
  const chosen = pending || SELF;

  function add() {
    if (!composing) {
      setComposing(true);
      return;
    }
    const name = canonicalMember(members, draft);
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
      .removeMember(name)
      .then(() => {
        onRemoved?.(name);
        if (sameMember(selected, name)) onSelect(SELF);
      })
      .catch(() => undefined);
  }

  return (
    <View style={[styles.wrap, showLabel ? null : styles.wrapBare]}>
      {showLabel ? <Text style={styles.label}>Family member</Text> : null}
      <ScrollView
        contentContainerStyle={scroll ? styles.peopleRow : styles.people}
        horizontal={scroll}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scroll}
        showsHorizontalScrollIndicator={false}
        style={scroll ? styles.peopleScroll : undefined}
      >
        <AddAvatarChoice accessibilityLabel="Add family member" onPress={add} />
        {shown.map((name) => {
          const removable = custom.some((item) => sameMember(item, name));
          return (
            <View key={name} style={styles.slot}>
              <AvatarChoice
                accessibilityLabel={`File under ${name}`}
                emoji={memberMark(name, vault.memberEmoji)}
                name={name}
                onLongPress={holdMenu ? () => setMenuFor(name) : undefined}
                onPress={() => {
                  if (holdMenu) {
                    if (!sameMember(name, chosen)) onSelect(canonicalMember(members, name));
                    return;
                  }
                  if (sameMember(name, chosen)) {
                    setPendingDelete(null);
                    setEmojiOpen((open) => !open);
                    return;
                  }
                  setEmojiOpen(false);
                  onSelect(canonicalMember(members, name));
                }}
                selected={sameMember(name, chosen)}
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
      {emojiOpen ? (
        <EmojiPicker
          onSelect={(emoji) => {
            void vault
              .setMemberEmoji(chosen, emoji)
              .then(() => setEmojiOpen(false))
              .catch(() => undefined);
          }}
          selected={memberMark(chosen, vault.memberEmoji)}
        />
      ) : null}
      {pendingDelete ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>Delete {pendingDelete}? Documents filed under {pendingDelete} move to Self.</Text>
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
          accessibilityLabel="Family member name"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder="Name"
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
              .setMemberEmoji(menuFor, emoji)
              .then(() => setMenuFor(null))
              .catch(() => undefined);
          }}
          target={
            menuFor
              ? {
                  label: menuFor,
                  emoji: memberMark(menuFor, vault.memberEmoji),
                  deleteNote: custom.some((item) => sameMember(item, menuFor))
                    ? `Documents filed under ${menuFor} move to Self.`
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
