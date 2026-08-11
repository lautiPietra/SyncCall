import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './app/AuthProvider';
import { SocketProvider } from './app/SocketProvider';
import { FriendsProvider } from './app/FriendsProvider';
import { ConversationsProvider } from './app/ConversationsProvider';
import { MessageRequestsProvider } from './app/MessageRequestsProvider';
import { SplashScreen } from './app/SplashScreen';
import { router } from './router/router';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <AuthProvider>
      <SocketProvider>
        <FriendsProvider>
          <ConversationsProvider>
            <MessageRequestsProvider>
              <RouterProvider router={router} />
            </MessageRequestsProvider>
          </ConversationsProvider>
        </FriendsProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
