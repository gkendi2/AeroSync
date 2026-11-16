
import { useAeroSyncTheme } from '@/context/ThemeContext';

export function useColorScheme() {
  const { colorScheme } = useAeroSyncTheme();
  return colorScheme;
}
