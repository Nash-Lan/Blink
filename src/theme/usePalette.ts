import { useColorScheme } from 'react-native';
import { darkPalette, lightPalette } from './colors';

export function usePalette() {
  return useColorScheme() === 'dark' ? darkPalette : lightPalette;
}
