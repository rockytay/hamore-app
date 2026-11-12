import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import type { PropsWithChildren } from 'react';

import { AuthProvider, useAuth, useSession } from '@/hooks/use-auth';
import { CalendarEventsProvider } from '@/hooks/use-calendar-events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { StudentsProvider } from '@/hooks/use-students';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <SignedInProviders>
          <RootNavigator />
          <AnimatedSplashOverlay />
        </SignedInProviders>
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * Data that belongs to the signed-in account. Keyed by user id so nothing from one
 * account is ever shown to the next one. Students and the calendar come from the
 * database, and the updates feed on the home screen is built from them.
 */
function SignedInProviders({ children }: PropsWithChildren) {
  const session = useSession();
  const accountKey = session?.userId ?? 'signed-out';
  return (
    <StudentsProvider key={accountKey}>
      <CalendarEventsProvider key={accountKey}>{children}</CalendarEventsProvider>
    </StudentsProvider>
  );
}

/** Shows sign-in when nobody is signed in, otherwise the teacher or student side by role. */
function RootNavigator() {
  const { session, loading } = useAuth();

  // Keep the splash screen up while the saved session is checked.
  if (loading) return null;

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

      {/* Opened by the link in the confirmation email, signed in or not. */}
      <Stack.Screen name="auth/callback" />
    </Stack>
  );
}
