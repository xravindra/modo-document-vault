import * as LocalAuthentication from 'expo-local-authentication';

export async function deviceBiometricsAvailable(): Promise<boolean> {
  const [hardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hardware && enrolled;
}

export async function fingerprintEnrolled(): Promise<boolean> {
  const [enrolled, types] = await Promise.all([
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  return enrolled && types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
}

export async function promptBiometrics(): Promise<boolean> {
  const fingerprint = await fingerprintEnrolled();
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: fingerprint ? 'Unlock with your fingerprint' : 'Unlock MODO',
    promptSubtitle: fingerprint ? 'MODO' : undefined,
    cancelLabel: 'Use PIN',
    disableDeviceFallback: true,
    requireConfirmation: false,
    biometricsSecurityLevel: 'strong',
  });
  return result.success;
}
