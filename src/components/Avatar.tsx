import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui';
import { EMOJI_CHOICES, categoryMark, memberMark } from '@/lib/emoji';
import { useVault } from '@/state/VaultContext';
import { font, theme, tint } from '@/theme';

const FAMILY = '👪';

/** Round tinted tile holding an emoji. */
export function EmojiCircle({
  emoji,
  selected = false,
  size = 48,
  editable = false,
}: {
  emoji: string;
  selected?: boolean;
  size?: number;
  /** Shows a small pencil badge so people know a tap changes the emoji. */
  editable?: boolean;
}) {
  const fontSize = Math.max(12, Math.round(size * 0.5));
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: selected ? 2 : 0,
            borderColor: theme.gold,
            backgroundColor: selected ? tint(0.18) : tint(0.08),
          },
        ]}
      >
        <Text style={[styles.emoji, { fontSize, lineHeight: Math.round(fontSize * 1.25) }]}>{emoji}</Text>
      </View>
      {editable ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✎</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A family member's emoji, or the whole family when `name` is omitted. */
export function PersonIcon({ name, selected = false, size = 48 }: { name?: string; selected?: boolean; size?: number }) {
  const vault = useVault();
  return <EmojiCircle emoji={name === undefined ? FAMILY : memberMark(name, vault.memberEmoji)} selected={selected} size={size} />;
}

export function CategoryIcon({ kind, selected = false, size = 48 }: { kind: string; selected?: boolean; size?: number }) {
  const vault = useVault();
  return <EmojiCircle emoji={categoryMark(kind, vault.categoryEmoji)} selected={selected} size={size} />;
}

export function MemberAvatar({ name, size, selected }: { name: string; size?: number; selected?: boolean }) {
  return <PersonIcon name={name} selected={selected} size={size} />;
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
        { width: size, height: size, borderRadius: size / 2, borderWidth: size < 32 ? 1.5 : 2 },
      ]}
    >
      <View style={[styles.plus, { width: arm, height: span, borderRadius: arm, backgroundColor: theme.gold }]} />
      <View style={[styles.plus, { width: span, height: arm, borderRadius: arm, backgroundColor: theme.gold }]} />
    </View>
  );
}

/** Picker choice. Tapping the chosen one again is how its emoji gets changed. */
export function AvatarChoice({
  name,
  emoji,
  selected,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  name: string;
  emoji: string;
  selected: boolean;
  onPress: () => void;
  /** When set, edits live in a hold menu, so the pencil badge is hidden. */
  onLongPress?: () => void;
  accessibilityLabel: string;
}) {
  const label = onLongPress
    ? `${accessibilityLabel}${selected ? ', selected' : ''}. Press and hold for options`
    : selected
      ? `${accessibilityLabel}, selected. Tap to change the emoji`
      : accessibilityLabel;
  return (
    <PressableScale accessibilityLabel={label} onLongPress={onLongPress} onPress={onPress} style={styles.choice}>
      <EmojiCircle editable={selected && !onLongPress} emoji={emoji} selected={selected} size={52} />
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
  emoji: { textAlign: 'center' },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.gold,
    borderWidth: 2,
    borderColor: theme.inkRaised,
  },
  badgeText: { color: theme.inkRaised, fontSize: 10, lineHeight: 12, fontFamily: font.semibold },
  add: { backgroundColor: theme.inkSoft, borderColor: tint(0.45), borderStyle: 'dashed' },
  plus: { position: 'absolute' },
  choice: { width: 76, alignItems: 'center', gap: 6 },
  choiceName: { color: theme.paperDim, fontFamily: font.medium, fontSize: 12, lineHeight: 15, textAlign: 'center' },
  choiceNameOn: { color: theme.paper, fontFamily: font.semibold },
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
