import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import { avatarColor, initials } from '@/lib/avatar';
import { EMOJI_CHOICES, categoryMark, memberMark } from '@/lib/emoji';
import { kindLabel } from '@/lib/types';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export function Avatar({
  name,
  emoji,
  size = 52,
  selected = false,
}: {
  name: string;
  emoji?: string;
  size?: number;
  selected?: boolean;
}) {
  const glyph = emoji || initials(name);
  const ring = size < 32 ? 2 : 3;
  const fontSize = emoji
    ? Math.max(12, Math.round(size * 0.46))
    : Math.max(9, Math.round(size * (Array.from(glyph).length > 1 ? 0.3 : 0.38)));
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ring,
          backgroundColor: avatarColor(name),
          borderColor: selected ? theme.paper : 'transparent',
        },
      ]}
    >
      <Text style={[emoji ? styles.emoji : styles.mark, { fontSize, lineHeight: Math.round(fontSize * 1.2) }]}>{glyph}</Text>
    </View>
  );
}

export function MemberAvatar({ name, size, selected }: { name: string; size?: number; selected?: boolean }) {
  const vault = useVault();
  return <Avatar emoji={memberMark(name, vault.memberEmoji)} name={name} selected={selected} size={size} />;
}

export function CategoryAvatar({ kind, size, selected }: { kind: string; size?: number; selected?: boolean }) {
  const vault = useVault();
  return <Avatar emoji={categoryMark(kind, vault.categoryEmoji)} name={kindLabel(kind)} selected={selected} size={size} />;
}

export function EmojiPicker({ selected, onSelect }: { selected: string; onSelect: (emoji: string) => void }) {
  return (
    <View style={styles.grid}>
      {EMOJI_CHOICES.map((emoji) => {
        const on = emoji === selected;
        return (
          <PressableScale
            key={emoji}
            accessibilityLabel={`Choose emoji ${emoji}`}
            onPress={() => onSelect(emoji)}
            style={[styles.emojiHit, on ? styles.emojiHitOn : null]}
          >
            <Text style={styles.emojiChoice}>{emoji}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function AddAvatar({ size = 52 }: { size?: number }) {
  const arm = Math.max(2, Math.round(size * 0.08));
  const span = Math.round(size * 0.34);
  return (
    <View
      style={[
        styles.circle,
        styles.add,
        { width: size, height: size, borderRadius: size / 2, borderWidth: size < 32 ? 2 : 3 },
      ]}
    >
      <View style={[styles.plus, { width: arm, height: span, borderRadius: arm, backgroundColor: theme.gold }]} />
      <View style={[styles.plus, { width: span, height: arm, borderRadius: arm, backgroundColor: theme.gold }]} />
    </View>
  );
}

export function AvatarChoice({
  name,
  emoji,
  selected,
  onPress,
  accessibilityLabel,
}: {
  name: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <PressableScale accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.choice}>
      <Avatar emoji={emoji} name={name} selected={selected} />
      <Text numberOfLines={2} style={[styles.choiceName, selected ? styles.choiceNameOn : null]}>
        {name}
      </Text>
    </PressableScale>
  );
}

export function AddAvatarChoice({ onPress, accessibilityLabel }: { onPress: () => void; accessibilityLabel: string }) {
  return (
    <PressableScale accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.choice}>
      <AddAvatar />
      <Text numberOfLines={1} style={styles.choiceName}>
        Add
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mark: { color: theme.ink, fontFamily: font.semibold, textAlign: 'center' },
  emoji: { textAlign: 'center' },
  add: { backgroundColor: theme.inkSoft, borderColor: theme.gold },
  plus: { position: 'absolute' },
  choice: { width: 76, alignItems: 'center', gap: 6 },
  choiceName: { color: theme.paperDim, fontFamily: font.medium, fontSize: 12, lineHeight: 15, textAlign: 'center' },
  choiceNameOn: { color: theme.paper },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  emojiHit: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
  },
  emojiHitOn: { borderColor: theme.gold, backgroundColor: theme.inkSoft },
  emojiChoice: { fontSize: 22, lineHeight: 26, textAlign: 'center' },
});
