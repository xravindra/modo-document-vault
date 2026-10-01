export async function deviceBiometricsAvailable(): Promise<boolean> {
  return false;
}

export async function fingerprintEnrolled(): Promise<boolean> {
  return false;
}

export async function promptBiometrics(): Promise<boolean> {
  return false;
}
