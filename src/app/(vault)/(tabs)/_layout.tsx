import { Tabs } from 'expo-router';

import { Dock } from '@/components/Dock';
import { theme } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <Dock state={props.state} navigation={props.navigation} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.ink },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Documents' }} />
      <Tabs.Screen name="library" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="security" options={{ href: null }} />
    </Tabs>
  );
}
