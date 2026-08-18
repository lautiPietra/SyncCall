export type MessageType = 'text' | 'image' | 'audio';

export const MESSAGE_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const;
export type MessageReactionEmoji = (typeof MESSAGE_REACTION_EMOJIS)[number];

export interface MessageReaction {
  emoji: MessageReactionEmoji;
  userId: string;
}

export interface Message {
  id: string;
  conversation: string;
  sender: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
  /** Solo para mensajes de audio: duración en segundos. */
  durationSec?: number;
  createdAt: string;
  readAt?: string;
  /** Presente si el remitente editó el mensaje después de enviarlo. */
  editedAt?: string;
  /** El contenido/imagen ya se borraron server-side; el cliente muestra un placeholder. */
  deleted: boolean;
  reactions: MessageReaction[];
}

export interface MessagesPageResponse {
  messages: Message[];
  nextCursor: string | null;
}
