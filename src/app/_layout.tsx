import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { CalendarEventsProvider } from '@/hooks/use-calendar-events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CurrentUserProvider } from '@/hooks/use-current-user';
import { StudentsProvider } from '@/hooks/use-students';
import { UpdatesProvider } from '@/hooks/use-updates';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <CurrentUserProvider>
        <UpdatesProvider>
          <StudentsProvider>
            <CalendarEventsProvider>
              <AnimatedSplashOverlay />
              <AppTabs />
            </CalendarEventsProvider>
          </StudentsProvider>
        </UpdatesProvider>
      </CurrentUserProvider>
    </ThemeProvider>
  );
}
