import StudentTabs from '@/components/student-tabs';
import { StudentPortalProvider } from '@/hooks/use-student-portal';

/** The student side of the app. Its data is loaded once here for all the tabs. */
export default function StudentLayout() {
  return (
    <StudentPortalProvider>
      <StudentTabs />
    </StudentPortalProvider>
  );
}
