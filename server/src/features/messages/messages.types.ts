import type { Document, Types } from 'mongoose';
import type { MessageReactionEmoji, MessageType } from '@synccall/shared';

export interface MessageReactionSubdocument {
  emoji: MessageReactionEmoji;
  user: Types.ObjectId;
}

export interface MessageDocument extends Document<Types.ObjectId> {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  type: MessageType;
  ciphertext: string;
  iv: string;
  authTag: string;
  mediaUrl?: string;
  durationSec?: number;
  createdAt: Date;
  readAt?: Date;
  editedAt?: Date;
  deleted: boolean;
  reactions: MessageReactionSubdocument[];
}
