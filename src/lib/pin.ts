export const PIN_LENGTH = 4;

export function isPin(value: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(value);
}
