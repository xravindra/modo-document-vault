import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { PressableScale } from '@/components/ui';
import { avatarColor, initials } from '@/lib/avatar';
import { EMOJI_CHOICES, categoryMark, memberMark } from '@/lib/emoji';
import { memberRole } from '@/lib/members';
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

type FigureKind = 'father' | 'mother' | 'brother' | 'sister' | 'self' | 'man' | 'woman';

function figureKind(name: string): FigureKind {
  const role = memberRole(name);
  if (role === 'Father' || role === 'Mother' || role === 'Brother' || role === 'Sister' || role === 'Self') {
    return role.toLowerCase() as FigureKind;
  }
  const label = name.toLocaleLowerCase();
  if (/mother|mom|wife|sister|daughter|aunt|grandma|grandmother|girl|woman|female|niece/.test(label)) return 'woman';
  if (/father|dad|husband|brother|son|uncle|grandpa|grandfather|boy|man|male|nephew/.test(label)) return 'man';
  return 'self';
}

function ink(color: string, weight: number) {
  return {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: weight,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

function WireDrawing({ kind, color, weight = 1.65 }: { kind: FigureKind; color: string; weight?: number }) {
  const pen = ink(color, weight);
  if (kind === 'sister') {
    return (
      <>
        <Path {...pen} d="M22.2 55C19.2 42 21.4 28 25.6 20C25 12 39 11.6 38.8 19.4C43.4 28 46.2 44 41.2 57" />
        <Circle {...pen} cx="32" cy="21" r="6.1" />
        <Path {...pen} d="M17 58.2C19.2 50 23.2 40 25.4 35.2Q32 39.6 38.6 35.2C41.2 41 45.4 51 47.4 58.2Q32 62.6 17 58.2" />
      </>
    );
  }
  if (kind === 'mother') {
    return (
      <>
        <Path {...pen} d="M27 28.4C23.6 27.2 22 22 23.4 16C25.2 8.6 38.8 8.6 40.6 16C42 22 40.4 27.2 37 28.4" />
        <Circle {...pen} cx="32" cy="21.2" r="6.2" />
        <Path {...pen} d="M18.2 58.6C16.4 50 18.6 41 22 36.2Q32 42 42 36.2C45.4 41 47.6 50 45.8 58.6Q32 63 18.2 58.6" />
        <Path {...pen} d="M26.2 46.2Q32 48.6 37.8 46.2" />
      </>
    );
  }
  if (kind === 'woman') {
    return (
      <>
        <Path {...pen} d="M26.2 18.6C26 11 37.6 10.6 38.4 17" />
        <Path {...pen} d="M37.2 16.4C40.6 14.2 46.8 16.6 48.6 23.2C50 28.4 47.2 33.6 44.4 34.8" />
        <Circle {...pen} cx="32" cy="21.4" r="6.1" />
        <Path {...pen} d="M19.4 58C21.2 50 23.6 41 25.6 35.6Q32 39.4 38.4 35.6C40.4 41 42.8 50 44.6 58Q32 61.6 19.4 58" />
      </>
    );
  }
  if (kind === 'father') {
    return (
      <>
        <Path {...pen} d="M25.4 15.4C25.2 8.4 38.8 8.4 38.6 15.6" />
        <Circle {...pen} cx="32" cy="18.4" r="7" />
        <Path {...pen} d="M16.6 58L13.2 44.4C17.8 33.2 24.6 30.2 27.6 33L32 41.2L36.4 33C39.4 30.2 46.2 33.2 50.8 44.4L47.4 58Z" />
      </>
    );
  }
  if (kind === 'brother') {
    return (
      <>
        <Path {...pen} d="M25 16.4L27.4 10L30.2 16.4L32 8.8L34.8 16.2L38 11.2L40.6 17" />
        <Circle {...pen} cx="32" cy="21.2" r="6.2" />
        <Path {...pen} d="M22.4 58L20.2 43.8C24.2 33.6 28.2 31.6 29.8 34.2Q32 39.2 34.2 34.2C35.8 31.6 39.8 33.6 43.8 43.8L41.6 58Z" />
      </>
    );
  }
  if (kind === 'man') {
    return (
      <>
        <Path {...pen} d="M26.4 16.6C26.2 10.2 33 9.2 34.2 15C36.4 9.6 40.4 10.4 40 16.8" />
        <Circle {...pen} cx="32" cy="20" r="6.5" />
        <Path {...pen} d="M18.6 58L15.8 44C20.8 32.6 26.4 30.6 29 33.6L32 39.4L35 33.6C37.6 30.6 43.2 32.6 48.2 44L45.4 58Z" />
        <Path {...pen} d="M32 39.4V48" />
      </>
    );
  }
  return (
    <>
      <Path {...pen} d="M25 18.4C24.4 10.4 40.4 9.6 40.6 18.2C40.8 22 38.4 23.6 36 21.2" />
      <Circle {...pen} cx="32" cy="20.2" r="6.5" />
      <Path {...pen} d="M19.4 58L16.8 44C22 32.8 26.8 30.8 29.2 33.8Q32 38.6 34.8 33.8C37.2 30.8 42 32.8 47.2 44L44.6 58Z" />
    </>
  );
}

function FigureFrame({ selected, size, children }: { selected: boolean; size: number; children: ReactNode }) {
  return (
    <View
      style={[
        styles.figure,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? theme.gold : theme.line,
          backgroundColor: selected ? 'rgba(180, 83, 26, 0.12)' : theme.inkRaised,
        },
      ]}
    >
      {children}
    </View>
  );
}

export function PersonFigure({ name, selected = false, size = 64 }: { name: string; selected?: boolean; size?: number }) {
  const drawn = Math.round(size * 0.86);
  return (
    <FigureFrame selected={selected} size={size}>
      <Svg width={drawn} height={drawn} viewBox="0 0 64 64" pointerEvents="none">
        <WireDrawing kind={figureKind(name)} color={selected ? theme.gold : theme.paper} />
      </Svg>
    </FigureFrame>
  );
}

export function EveryoneFigure({ selected = false, size = 64 }: { selected?: boolean; size?: number }) {
  const pair = selected ? theme.gold : theme.paper;
  return (
    <FigureFrame selected={selected} size={size}>
      <Svg width={size} height={size} viewBox="0 0 64 64" pointerEvents="none">
        <G transform="translate(-4 8) scale(0.68)">
          <WireDrawing kind="sister" color={pair} weight={2.45} />
        </G>
        <G transform="translate(20 8) scale(0.68)">
          <WireDrawing kind="father" color={theme.gold} weight={2.45} />
        </G>
      </Svg>
    </FigureFrame>
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
  mark: { color: theme.paper, fontFamily: font.semibold, textAlign: 'center' },
  emoji: { textAlign: 'center' },
  add: { backgroundColor: theme.inkSoft, borderColor: theme.gold },
  plus: { position: 'absolute' },
  choice: { width: 76, alignItems: 'center', gap: 6 },
  choiceName: { color: theme.paperDim, fontFamily: font.medium, fontSize: 12, lineHeight: 15, textAlign: 'center' },
  choiceNameOn: { color: theme.paper },
  figure: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
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
