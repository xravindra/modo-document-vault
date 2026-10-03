import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/ui';
import { hapticTick } from '@/lib/haptics';
import { PIN_LENGTH } from '@/lib/pin';
import { font, theme } from '@/theme';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
];

export function PinDots({
  length,
  total = PIN_LENGTH,
  shake,
}: {
  length: number;
  total?: number;
  shake: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  return (
    <Animated.View style={[styles.dots, style]}>
      {Array.from({ length: total }, (_, index) => (
        <View key={index} style={[styles.dot, index < length ? styles.dotOn : null]} />
      ))}
    </Animated.View>
  );
}

export function PinPad({
  value,
  length = PIN_LENGTH,
  disabled,
  onChange,
  onComplete,
  sideAction,
}: {
  value: string;
  length?: number;
  disabled?: boolean;
  onChange: (next: string) => void;
  onComplete: (pin: string) => void;
  sideAction?: { label: string; onPress: () => void };
}) {
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  function press(key: string) {
    if (disabled) return;
    hapticTick();
    const current = valueRef.current;
    if (key === 'del') {
      const next = current.slice(0, -1);
      valueRef.current = next;
      onChange(next);
      return;
    }
    if (!key || current.length >= length) return;
    const next = current + key;
    valueRef.current = next;
    onChange(next);
    if (next.length === length) onComplete(next);
  }

  return (
    <View style={styles.pad} accessibilityLabel="PIN pad">
      {ROWS.map((row) => (
        <View key={row.join('-')} style={styles.row}>
          {row.map((key) =>
            key === '' ? (
              sideAction ? (
                <PressableScale
                  key="side"
                  accessibilityLabel={sideAction.label}
                  disabled={disabled}
                  onPress={() => {
                    if (disabled) return;
                    hapticTick();
                    sideAction.onPress();
                  }}
                  style={styles.key}
                >
                  <BackupMark />
                </PressableScale>
              ) : (
                <View key="spacer" style={styles.key} />
              )
            ) : (
              <PressableScale
                key={key}
                accessibilityLabel={key === 'del' ? 'Delete digit' : `Digit ${key}`}
                disabled={disabled}
                onPress={() => press(key)}
                style={styles.key}
              >
                {key === 'del' ? <Icon color={theme.gold} name="back" size={22} weight={2} /> : <Text style={styles.keyText}>{key}</Text>}
              </PressableScale>
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function BackupMark() {
  return (
    <View style={styles.mark}>
      <View style={styles.markStem} />
      <View style={styles.markLeft} />
      <View style={styles.markRight} />
      <View style={styles.markTray} />
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 14, justifyContent: 'center', marginTop: 28, marginBottom: 8 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.inkSoft,
  },
  dotOn: { backgroundColor: theme.paper },
  pad: { marginTop: 12, gap: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-evenly' },
  key: {
    width: '28%',
    maxWidth: 76,
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
  },
  keyText: { color: theme.paper, fontFamily: font.medium, fontSize: 26 },
  mark: { width: 22, height: 22, alignItems: 'center' },
  markStem: { width: 2, height: 9, borderRadius: 1, backgroundColor: theme.gold, marginTop: 1 },
  markLeft: {
    position: 'absolute',
    top: 7,
    left: 5,
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.gold,
    transform: [{ rotate: '42deg' }],
  },
  markRight: {
    position: 'absolute',
    top: 7,
    right: 5,
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.gold,
    transform: [{ rotate: '-42deg' }],
  },
  markTray: { position: 'absolute', left: 3, right: 3, bottom: 1, height: 2, borderRadius: 1, backgroundColor: theme.gold },
});
