import { Stack } from 'expo-router';

/** Keeps the lesson list below the request screen, e.g. when it is opened from the home tab. */
export const unstable_settings = {
  anchor: 'index',
};

export default function StudentLessonsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'שיעורים' }} />
      <Stack.Screen name="request" options={{ title: 'בקשת שיעור', headerBackTitle: 'שיעורים' }} />
    </Stack>
  );
}
