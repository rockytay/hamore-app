import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AuthProvider, useSession } from '@/hooks/use-auth';
import { CalendarEventsProvider } from '@/hooks/use-calendar-events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { StudentsProvider } from '@/hooks/use-students';
import { UpdatesProvider } from '@/hooks/use-updates';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <UpdatesProvider>
          <StudentsProvider>
            <CalendarEventsProvider>
              <RootNavigator />
              <AnimatedSplashOverlay />
            </CalendarEventsProvider>
          </StudentsProvider>
        </UpdatesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

/** Shows sign-in when nobody is signed in, otherwise the teacher or student side by role. */
function RootNavigator() {
  const session = useSession();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={session?.role === 'teacher'}>
        <Stack.Screen name="(teacher)" />
      </Stack.Protected>

      <Stack.Protected guard={session?.role === 'student'}>
        <Stack.Screen name="student" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" options={{ animation: 'slide_from_left' }} />
      </Stack.Protected>
    </Stack>
  );
}
