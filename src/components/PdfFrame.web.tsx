import { createElement } from 'react';

export function PdfFrame({ uri }: { uri: string }) {
  return createElement('iframe', {
    src: uri,
    title: 'Document preview',
    style: {
      width: '100%',
      height: 420,
      border: 'none',
      borderRadius: 18,
      background: '#0c1210',
      marginTop: 16,
    },
  });
}
