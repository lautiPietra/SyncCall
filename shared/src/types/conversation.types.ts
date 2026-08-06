export interface Conversation {
  id: string;
  participants: [string, string];
  lastMessageAt: string;
  createdAt: string;
}
