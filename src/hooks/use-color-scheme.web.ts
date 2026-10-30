import type { ColorSchemeName } from 'react-native';

/**
 * The app is locked to light mode (see `userInterfaceStyle` in app.json).
 */
export function useColorScheme(): NonNullable<ColorSchemeName> {
  return 'light';
}
