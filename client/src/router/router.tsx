import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AppLayout } from '../app/AppLayout';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { ProfilePage } from '../features/profile/pages/ProfilePage';
import { FriendsPage } from '../features/friends/pages/FriendsPage';
import { ChatPage } from '../features/chat/pages/ChatPage';
import { MessageRequestsPage } from '../features/chat/pages/MessageRequestsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <FriendsPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/message-requests', element: <MessageRequestsPage /> },
          { path: '/chat/:friendId', element: <ChatPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
