export type Palette = {
  background: string;
  grouped: string;
  card: string;
  text: string;
  secondaryText: string;
  separator: string;
  blue: string;
  red: string;
  green: string;
  orange: string;
  fill: string;
};

export const lightPalette: Palette = {
  background: '#F2F2F7',
  grouped: '#F9F9FB',
  card: '#FFFFFF',
  text: '#111111',
  secondaryText: '#6E6E73',
  separator: '#D8D8DE',
  blue: '#007AFF',
  red: '#FF3B30',
  green: '#34C759',
  orange: '#FF9500',
  fill: '#E9E9EE',
};

export const darkPalette: Palette = {
  background: '#000000',
  grouped: '#1C1C1E',
  card: '#2C2C2E',
  text: '#F5F5F7',
  secondaryText: '#A1A1A6',
  separator: '#3A3A3C',
  blue: '#0A84FF',
  red: '#FF453A',
  green: '#30D158',
  orange: '#FF9F0A',
  fill: '#3A3A3C',
};
