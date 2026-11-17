import { Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useStudent, type Student } from '@/hooks/use-students';

/**
 * Frame for the screens of a student's file (teacher side): finds the student from the
 * route and scrolls the content. Former students are shown read-only.
 */
export function TeacherFileScreen({ children }: { children: (student: Student) => ReactNode }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const student = useStudent(id);

  return (
    <ThemedView style={styles.container}>
      {/* "automatic" keeps content below the iOS navigation header instead of under it */}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        {student ? (
          <>
            <Stack.Screen options={{ headerBackTitle: student.firstName }} />
            <ThemedText type="small" themeColor="textSecondary">
              {student.name}
              {student.removal ? ' · תלמיד/ה לשעבר (לקריאה בלבד)' : ''}
            </ThemedText>
            {children(student)}
          </>
        ) : (
          <ThemedText themeColor="textSecondary">התלמיד לא נמצא.</ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
  },
});
