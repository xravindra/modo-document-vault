import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { PressableScale } from '@/components/ui';
import { avatarColor, initials } from '@/lib/avatar';
import { EMOJI_CHOICES, memberMark } from '@/lib/emoji';
import { memberRole } from '@/lib/members';
import { useVault } from '@/state/VaultContext';
import { font, theme, tint } from '@/theme';

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

type Glyph = keyof typeof MaterialCommunityIcons.glyphMap;

export function Glyph(name: string): Glyph {
  const role = memberRole(name);
  if (role === 'Self') return 'account';
  if (role === 'Father') return 'face-man';
  if (role === 'Mother') return 'face-woman';
  if (role === 'Brother') return 'human-male';
  if (role === 'Sister') return 'human-female';
  const label = name.toLocaleLowerCase();
  if (/grand|nana|nani|dada|dadi|grandpa|grandma/.test(label)) return 'human-cane';
  if (/daughter|girl|niece/.test(label)) return 'human-female-girl';
  if (/son|boy|nephew|baby|kid|child/.test(label)) return 'human-child';
  if (/mom|wife|aunt|woman|female|lady/.test(label)) return 'face-woman-profile';
  if (/dad|husband|uncle|man|male/.test(label)) return 'face-man-profile';
  return 'account-outline';
}

const KIND_GLYPH: Record<string, Glyph> = {
  identity: 'card-account-details-outline',
  card: 'credit-card-outline',
  travel: 'airplane',
  health: 'heart-pulse',
  finance: 'bank-outline',
  legal: 'scale-balance',
  other: 'file-document-outline',
};

const CATEGORY_HINTS: [RegExp, Glyph][] = [
  [/school|college|education|degree|mark|exam/, 'school-outline'],
  [/home|house|property|rent|land/, 'home-outline'],
  [/car|vehicle|bike|licen[cs]e|rc\b/, 'car-outline'],
  [/insur|policy/, 'shield-check-outline'],
  [/tax|bill|receipt|invoice/, 'receipt'],
  [/work|job|office|salary|employ/, 'briefcase-outline'],
  [/medic|hospital|doctor|vaccin/, 'heart-pulse'],
  [/pet|dog|cat/, 'paw'],
  [/certif|award/, 'certificate-outline'],
  [/bank|loan|invest|money/, 'cash-multiple'],
  [/phone|mobile|sim/, 'cellphone'],
  [/utility|electric|power|gas|water/, 'lightning-bolt-outline'],
  [/wedding|marriage/, 'ring'],
  [/baby|birth/, 'baby-carriage'],
];

export function categoryGlyph(kind: string): Glyph {
  const known = KIND_GLYPH[kind];
  if (known) return known;
  const label = kind.toLocaleLowerCase();
  return CATEGORY_HINTS.find(([pattern]) => pattern.test(label))?.[1] ?? 'folder-outline';
}

function GlyphCircle({ glyph, selected, size }: { glyph: Glyph; selected: boolean; size: number }) {
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: selected ? theme.gold : tint(0.10),
        },
      ]}
    >
      <MaterialCommunityIcons color={selected ? theme.ink : theme.gold} name={glyph} size={Math.round(size * 0.52)} />
    </View>
  );
}

export function CategoryIcon({ kind, selected = false, size = 48 }: { kind: string; selected?: boolean; size?: number }) {
  return <GlyphCircle glyph={categoryGlyph(kind)} selected={selected} size={size} />;
}

export function CategoryChoice({
  kind,
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  kind: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <PressableScale accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.choice}>
      <CategoryIcon kind={kind} selected={selected} size={52} />
      <Text numberOfLines={2} style={[styles.choiceName, selected ? styles.choiceNameOn : null]}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Round icon tile for a family member, or the whole family when `name` is omitted. */
export function PersonIcon({ name, selected = false, size = 48 }: { name?: string; selected?: boolean; size?: number }) {
  return <GlyphCircle glyph={name === undefined ? 'account-group' : Glyph(name)} selected={selected} size={size} />;
}

export function MemberAvatar({ name, size, selected }: { name: string; size?: number; selected?: boolean }) {
  const vault = useVault();
  return <Avatar emoji={memberMark(name, vault.memberEmoji)} name={name} selected={selected} size={size} />;
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
  mark: { color: theme.paper, fontFamily: font.semibold, textAlign: 'center' },
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
