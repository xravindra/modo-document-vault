import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AddAvatarChoice, AvatarChoice, EmojiPicker } from '@/components/Avatar';
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
}: {
  members: string[];
  selected: string;
  onSelect: (name: string) => void;
  onRemoved?: (name: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
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

  function remove() {
    const name = pendingDelete;
    if (!name) return;
    setPendingDelete(null);
    void vault
      .removeMember(name)
      .then(() => {
        onRemoved?.(name);
        if (sameMember(selected, name)) onSelect(SELF);
      })
      .catch(() => undefined);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Family member</Text>
      <View style={styles.people}>
        {shown.map((name) => {
          const removable = custom.some((item) => sameMember(item, name));
          return (
            <View key={name} style={styles.slot}>
              <AvatarChoice
                accessibilityLabel={`File under ${name}`}
                emoji={memberMark(name, vault.memberEmoji)}
                name={name}
                onPress={() => onSelect(canonicalMember(members, name))}
                selected={sameMember(name, chosen)}
              />
              {removable ? (
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
        <AddAvatarChoice accessibilityLabel="Add family member" onPress={add} />
      </View>
      <PressableScale accessibilityLabel="Set family member emoji" onPress={() => setEmojiOpen((open) => !open)} style={styles.emojiToggle}>
        <Text style={styles.emojiToggleText}>{emojiOpen ? 'Close emojis' : 'Set emoji'}</Text>
      </PressableScale>
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
            <PressableScale accessibilityLabel={`Delete ${pendingDelete}`} onPress={remove} style={styles.delete}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginTop: 18 },
  label: {
    color: theme.gold,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
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
  emojiToggle: { alignSelf: 'flex-start', marginTop: 12 },
  emojiToggleText: { color: theme.gold, fontFamily: font.medium, fontSize: 14 },
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
