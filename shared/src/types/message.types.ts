export interface Message {
  id: string;
  conversation: string;
  sender: string;
  content: string;
  createdAt: string;
  readAt?: string;
}
