/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  colors: ThemeColors;
}

interface ThemeColors {
  // Backgrounds
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgCard: string;
  bgCardHover: string;
  bgInput: string;
  bgSidebar: string;
  bgHeader: string;
  
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  
  // Borders
  borderPrimary: string;
  borderSecondary: string;
  
  // Accents (same for both themes)
  accentPrimary: string;
  accentSecondary: string;
  accentSuccess: string;
  accentError: string;
  accentWarning: string;
}

const darkTheme: ThemeColors = {
  bgPrimary: 'linear-gradient(135deg, #0B0F19 0%, #1a1f2e 100%)',
  bgSecondary: '#1a1f2e',
  bgTertiary: 'rgba(255, 255, 255, 0.05)',
  bgCard: 'rgba(255, 255, 255, 0.05)',
  bgCardHover: 'rgba(255, 255, 255, 0.08)',
  bgInput: 'rgba(255, 255, 255, 0.05)',
  bgSidebar: 'rgba(0, 0, 0, 0.3)',
  bgHeader: 'rgba(255, 255, 255, 0.05)',
  
  textPrimary: '#ffffff',
  textSecondary: '#E5E7EB',
  textMuted: '#9CA3AF',
  
  borderPrimary: 'rgba(255, 255, 255, 0.1)',
  borderSecondary: 'rgba(255, 255, 255, 0.05)',
  
  accentPrimary: '#6366F1',
  accentSecondary: '#22D3EE',
  accentSuccess: '#10B981',
  accentError: '#EF4444',
  accentWarning: '#F59E0B',
};

const lightTheme: ThemeColors = {
  bgPrimary: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)',
  bgSecondary: '#ffffff',
  bgTertiary: '#f8fafc',
  bgCard: '#ffffff',
  bgCardHover: '#f1f5f9',
  bgInput: '#f1f5f9',
  bgSidebar: '#f8fafc',
  bgHeader: '#ffffff',
  
  textPrimary: '#1a1f2e',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  
  borderPrimary: 'rgba(0, 0, 0, 0.1)',
  borderSecondary: 'rgba(0, 0, 0, 0.05)',
  
  accentPrimary: '#6366F1',
  accentSecondary: '#22D3EE',
  accentSuccess: '#10B981',
  accentError: '#EF4444',
  accentWarning: '#F59E0B',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage for saved theme
    const savedTheme = localStorage.getItem('theme') as Theme;
    return savedTheme || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const colors = theme === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};