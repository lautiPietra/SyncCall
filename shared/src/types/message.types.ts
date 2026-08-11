export type MessageType = 'text' | 'image';

export interface Message {
  id: string;
  conversation: string;
  sender: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
  createdAt: string;
  readAt?: string;
}

export interface MessagesPageResponse {
  messages: Message[];
  nextCursor: string | null;
}
