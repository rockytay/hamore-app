import { Stack } from 'expo-router';

export default function StudentsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'תלמידים' }} />
      <Stack.Screen name="[id]" options={{ title: 'פרטי תלמיד', headerBackTitle: 'תלמידים' }} />
    </Stack>
  );
}
