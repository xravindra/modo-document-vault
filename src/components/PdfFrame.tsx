import { useEffect, useState } from 'react';
import { Paths } from 'expo-file-system';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { renderPdfPage } from '@/lib/pdfPage';
import { font, theme } from '@/theme';

function allows(url: string): boolean {
  return !/^https?:/i.test(url);
}

const drawsPdf = Platform.OS === 'ios';

export function PdfFrame({ uri, ratio }: { uri: string; ratio: number }) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const height = width > 0 ? Math.max(1, Math.round(width * ratio)) : 1;
  const source = drawsPdf ? uri : page;

  useEffect(() => {
    if (drawsPdf) return undefined;
    let live = true;
    let file: { exists: boolean; delete: () => void } | null = null;
    setPage(null);
    setFailed(false);
    void (async () => {
      try {
        const next = await renderPdfPage(uri);
        if (!live) {
          if (next.exists) next.delete();
          return;
        }
        file = next;
        setPage(next.uri);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
      if (file?.exists) file.delete();
    };
  }, [uri]);

  return (
    <View
      accessibilityLabel="Document preview"
      collapsable={false}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
      pointerEvents="none"
      style={[styles.frame, { height }]}
    >
      {failed ? <Text style={styles.failed}>Could not show this PDF.</Text> : null}
      {width > 0 && source && !failed ? (
        <WebView
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          allowingReadAccessToURL={Paths.cache.uri}
          androidLayerType="hardware"
          cacheEnabled={false}
          onError={() => setFailed(true)}
          onShouldStartLoadWithRequest={(request) => allows(request.url)}
          originWhitelist={['*']}
          overScrollMode="never"
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          source={{ uri: source }}
          style={styles.web}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  web: {
    flex: 1,
    backgroundColor: '#ffffff',
    opacity: 0.99,
  },
  failed: {
    color: theme.ink,
    fontFamily: font.body,
    fontSize: 15,
    lineHeight: 22,
    padding: 16,
  },
});
