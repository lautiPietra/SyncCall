export interface GroupMessage {
  id: string;
  channel: string;
  group: string;
  sender: string;
  content: string;
  createdAt: string;
  editedAt?: string;
  deleted: boolean;
}

export interface GroupMessagesPageResponse {
  messages: GroupMessage[];
  nextCursor: string | null;
}
