import { Stack } from 'expo-router';

/** Keeps the profile below the details screen, e.g. when it is opened from a reminder. */
export const unstable_settings = {
  anchor: 'index',
};

export default function StudentProfileLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'פרופיל' }} />
      <Stack.Screen name="details" options={{ title: 'פרטים אישיים ואיסוף', headerBackTitle: 'פרופיל' }} />
    </Stack>
  );
}
