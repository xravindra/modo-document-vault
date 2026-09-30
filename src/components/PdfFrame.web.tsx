import { useState } from 'react';
import { createElement } from 'react';
import { View } from 'react-native';

export function PdfFrame({ uri, ratio }: { uri: string; ratio: number }) {
  const [width, setWidth] = useState(0);
  const height = width > 0 ? Math.max(1, Math.round(width * ratio)) : 1;
  const src = uri.includes('#') ? uri : `${uri}#toolbar=0&navpanes=0&view=Fit`;
  return (
    <View
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
      style={{
        alignSelf: 'stretch',
        height,
        marginHorizontal: -22,
        marginVertical: 0,
        padding: 0,
        borderWidth: 0,
        borderRadius: 0,
      }}
    >
      {width > 0
        ? createElement('iframe', {
            src,
            title: 'Document preview',
            style: {
              width: '100%',
              height: '100%',
              margin: 0,
              padding: 0,
              border: 'none',
              display: 'block',
              background: '#ffffff',
            },
          })
        : null}
    </View>
  );
}
