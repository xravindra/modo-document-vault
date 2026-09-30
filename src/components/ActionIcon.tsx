import { StyleSheet, View } from 'react-native';

export type ActionName = 'share' | 'save' | 'download' | 'add' | 'details' | 'extract' | 'remove' | 'unlock' | 'lock';

export function ActionIcon({ name, color }: { name: ActionName; color: string }) {
  if (name === 'share') {
    return (
      <View style={styles.box}>
        <View style={[styles.dot, styles.shareTop, { backgroundColor: color }]} />
        <View style={[styles.dot, styles.shareLeft, { backgroundColor: color }]} />
        <View style={[styles.dot, styles.shareRight, { backgroundColor: color }]} />
        <View style={[styles.shareLink, styles.shareUp, { backgroundColor: color }]} />
        <View style={[styles.shareLink, styles.shareAcross, { backgroundColor: color }]} />
      </View>
    );
  }
  if (name === 'save') {
    return (
      <View style={styles.box}>
        <View style={[styles.checkShort, { backgroundColor: color }]} />
        <View style={[styles.checkLong, { backgroundColor: color }]} />
      </View>
    );
  }
  if (name === 'download') {
    return (
      <View style={styles.box}>
        <View style={[styles.stem, { backgroundColor: color }]} />
        <View style={[styles.arrowLeft, { backgroundColor: color }]} />
        <View style={[styles.arrowRight, { backgroundColor: color }]} />
        <View style={[styles.tray, { backgroundColor: color }]} />
      </View>
    );
  }
  if (name === 'add') {
    return (
      <View style={styles.box}>
        <View style={[styles.plusV, { backgroundColor: color }]} />
        <View style={[styles.plusH, { backgroundColor: color }]} />
      </View>
    );
  }
  if (name === 'extract') {
    return (
      <View style={styles.box}>
        <View style={[styles.extractPage, { borderColor: color }]} />
        <View style={[styles.extractLine, { backgroundColor: color, top: 5 }]} />
        <View style={[styles.extractLine, { backgroundColor: color, top: 9 }]} />
        <View style={[styles.extractLine, styles.extractLineShort, { backgroundColor: color, top: 13 }]} />
      </View>
    );
  }
  if (name === 'details') {
    return (
      <View style={styles.box}>
        <View style={[styles.line, { backgroundColor: color, top: 3 }]} />
        <View style={[styles.line, { backgroundColor: color, top: 8 }]} />
        <View style={[styles.line, styles.lineShort, { backgroundColor: color, top: 13 }]} />
      </View>
    );
  }
  if (name === 'lock') {
    return (
      <View style={styles.box}>
        <View style={[styles.lockShackle, { borderColor: color }]} />
        <View style={[styles.lockBody, { backgroundColor: color }]} />
      </View>
    );
  }
  if (name === 'unlock') {
    return (
      <View style={styles.box}>
        <View style={[styles.keyHead, { borderColor: color }]} />
        <View style={[styles.keyStem, { backgroundColor: color }]} />
        <View style={[styles.keyTooth, { backgroundColor: color }]} />
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <View style={[styles.cross, styles.crossA, { backgroundColor: color }]} />
      <View style={[styles.cross, styles.crossB, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 18, height: 18 },
  dot: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
  shareTop: { top: 0, left: 7 },
  shareLeft: { top: 12, left: 0 },
  shareRight: { top: 12, left: 14 },
  shareLink: { position: 'absolute', height: 1.5, borderRadius: 1 },
  shareUp: { width: 8, left: 6, top: 6, transform: [{ rotate: '62deg' }] },
  shareAcross: { width: 8, left: 6, top: 11, transform: [{ rotate: '-62deg' }] },
  checkShort: {
    position: 'absolute',
    width: 6,
    height: 2,
    left: 2,
    top: 9,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  checkLong: {
    position: 'absolute',
    width: 11,
    height: 2,
    left: 5,
    top: 8,
    borderRadius: 1,
    transform: [{ rotate: '-48deg' }],
  },
  stem: { position: 'absolute', width: 2, height: 8, left: 8, top: 1, borderRadius: 1 },
  arrowLeft: {
    position: 'absolute',
    width: 6,
    height: 2,
    left: 4,
    top: 8,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  arrowRight: {
    position: 'absolute',
    width: 6,
    height: 2,
    left: 8,
    top: 8,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },
  tray: { position: 'absolute', width: 12, height: 2, left: 3, bottom: 1, borderRadius: 1 },
  plusV: { position: 'absolute', width: 2, height: 12, left: 8, top: 3, borderRadius: 1 },
  plusH: { position: 'absolute', width: 12, height: 2, left: 3, top: 8, borderRadius: 1 },
  extractPage: {
    position: 'absolute',
    width: 14,
    height: 16,
    left: 2,
    top: 1,
    borderWidth: 1.5,
    borderRadius: 2,
  },
  extractLine: { position: 'absolute', width: 8, height: 1.5, left: 5, borderRadius: 1 },
  extractLineShort: { width: 5 },
  line: { position: 'absolute', width: 14, height: 2, left: 2, borderRadius: 1 },
  lineShort: { width: 9 },
  lockShackle: {
    position: 'absolute',
    width: 8,
    height: 6,
    left: 5,
    top: 1,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  lockBody: { position: 'absolute', width: 12, height: 8, left: 3, top: 8, borderRadius: 2 },
  keyHead: {
    position: 'absolute',
    width: 8,
    height: 8,
    left: 1,
    top: 5,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  keyStem: { position: 'absolute', width: 8, height: 2, left: 8, top: 8, borderRadius: 1 },
  keyTooth: { position: 'absolute', width: 2, height: 3, left: 13, top: 10, borderRadius: 1 },
  cross: { position: 'absolute', width: 14, height: 2, left: 2, top: 8, borderRadius: 1 },
  crossA: { transform: [{ rotate: '45deg' }] },
  crossB: { transform: [{ rotate: '-45deg' }] },
});
