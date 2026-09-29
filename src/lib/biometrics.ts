import * as LocalAuthentication from 'expo-local-authentication';

export async function deviceBiometricsAvailable(): Promise<boolean> {
  const [hardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hardware && enrolled;
}

export async function promptBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock MODO',
    cancelLabel: 'Use PIN',
    disableDeviceFallback: false,
  });
  return result.success;
}
