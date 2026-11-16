import {
    createContext,
    useContext,
    useMemo,
    type ReactNode,
} from 'react';

export type AppColorScheme = 'light';

type ThemeContextType = {
  colorScheme: AppColorScheme;
  isThemeReady: boolean;
};

const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined
);

type ThemeProviderProps = {
  children: ReactNode;
};

export function AeroSyncThemeProvider({
  children,
}: ThemeProviderProps) {
  const value = useMemo(
    () => ({
      colorScheme: 'light' as const,
      isThemeReady: true,
    }),
    []
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAeroSyncTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error(
      'useAeroSyncTheme must be used inside AeroSyncThemeProvider'
    );
  }

  return context;
}