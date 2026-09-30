import { Clipboard } from 'react-native';

export async function copyText(value: string): Promise<void> {
  Clipboard.setString(value);
}
