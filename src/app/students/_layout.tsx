import { Stack } from 'expo-router';

/** Keeps the student list below a student's profile, e.g. when it is opened right after adding a student. */
export const unstable_settings = {
  anchor: 'index',
};

export default function StudentsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'תלמידים' }} />
      <Stack.Screen name="[id]" options={{ title: 'פרטי תלמיד', headerBackTitle: 'תלמידים' }} />
    </Stack>
  );
}
