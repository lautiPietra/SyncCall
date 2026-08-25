import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './app/AuthProvider';
import { SocketProvider } from './app/SocketProvider';
import { FriendsProvider } from './app/FriendsProvider';
import { NotificationPreferencesProvider } from './app/NotificationPreferencesProvider';
import { AudioDevicePreferencesProvider } from './app/AudioDevicePreferencesProvider';
import { ConversationsProvider } from './app/ConversationsProvider';
import { GroupsProvider } from './app/GroupsProvider';
import { MessageRequestsProvider } from './app/MessageRequestsProvider';
import { CallProvider } from './app/CallProvider';
import { ToastProvider } from './app/ToastProvider';
import { SplashScreen } from './app/SplashScreen';
import { router } from './router/router';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <ToastProvider>
      <AuthProvider>
        <SocketProvider>
          <FriendsProvider>
            <NotificationPreferencesProvider>
              <AudioDevicePreferencesProvider>
                <ConversationsProvider>
                  <GroupsProvider>
                    <MessageRequestsProvider>
                      <CallProvider>
                        <RouterProvider router={router} />
                      </CallProvider>
                    </MessageRequestsProvider>
                  </GroupsProvider>
                </ConversationsProvider>
              </AudioDevicePreferencesProvider>
            </NotificationPreferencesProvider>
          </FriendsProvider>
        </SocketProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
