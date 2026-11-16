import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';

import { CustomTabList, TabButton } from '@/components/app-tabs.web';

/** The student side of the app on the web, styled like the teacher tabs. */
export default function StudentTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/student" asChild>
            <TabButton>בית</TabButton>
          </TabTrigger>
          <TabTrigger name="lessons" href="/student/lessons" asChild>
            <TabButton>שיעורים</TabButton>
          </TabTrigger>
          <TabTrigger name="progress" href="/student/progress" asChild>
            <TabButton>התקדמות</TabButton>
          </TabTrigger>
          <TabTrigger name="payments" href="/student/payments" asChild>
            <TabButton>תשלומים</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/student/profile" asChild>
            <TabButton>פרופיל</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}
