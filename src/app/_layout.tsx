import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlinkProvider } from '../state/BlinkProvider';
import { usePalette } from '../theme/usePalette';
import { InAppReminderBanner } from '../components/InAppReminderBanner';
import { NativeNotificationBridge } from '../notifications/NativeNotificationBridge';

export default function RootLayout() {
  const palette = usePalette();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.background }}>
      <BlinkProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="note/[id]" />
        </Stack>
        <InAppReminderBanner />
        <NativeNotificationBridge />
      </BlinkProvider>
    </GestureHandlerRootView>
  );
}
