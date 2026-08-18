import type { Request, Response } from 'express';
import type { UploadApiResponse } from 'cloudinary';
import { SOCKET_EVENTS } from '@synccall/shared';
import type {
  ConversationUpdatedPayload,
  CreateConversationInput,
  MessageNewPayload,
  MessageRequestNewPayload,
  MessageRequestResolvedPayload,
  PaginateConversationsQueryInput,
  PaginateMessagesQueryInput,
  RespondMessageRequestInput,
} from '@synccall/shared';
import * as conversationsService from './conversations.service';
import * as messagesService from '../messages/messages.service';
import { cloudinary } from '../../config/cloudinary';
import { ApiError } from '../../lib/ApiError';
import { tryGetIo } from '../../sockets/io';

export async function listConversations(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const { limit, before } = req.query as unknown as PaginateConversationsQueryInput;
  const result = await conversationsService.listConversations(userId, { limit, before });
  res.json(result);
}

export async function createConversation(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const { friendId } = req.body as CreateConversationInput;
  const conversation = await conversationsService.getOrCreateConversation(userId, friendId);

  res.status(201).json({
    conversation: {
      id: conversation._id.toString(),
      participants: [conversation.participantA.toString(), conversation.participantB.toString()],
      requestStatus: conversation.requestStatus,
      requestedBy: conversation.requestedBy?.toString() ?? null,
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      createdAt: conversation.createdAt.toISOString(),
    },
  });
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const { limit, before } = req.query as unknown as PaginateMessagesQueryInput;
  const result = await messagesService.getMessages(req.params.id, userId, { limit, before });
  res.json(result);
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  await conversationsService.markConversationRead(req.params.id, userId);
  res.status(204).send();
}

export async function uploadMedia(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new ApiError(400, 'No se recibió ningún archivo');
  }

  const userId = req.user!._id.toString();
  const conversationId = req.params.id;
  const caption = typeof req.body.caption === 'string' ? req.body.caption : '';

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'synccall/messages', resource_type: 'image' },
      (error, uploadResult) => {
        if (error || !uploadResult) {
          reject(error ?? new Error('Error al subir la imagen'));
          return;
        }
        resolve(uploadResult);
      },
    );
    stream.end(req.file!.buffer);
  });

  const { message, recipientId, requestStatus, justAccepted, requestPreview } = await messagesService.sendMessage(
    conversationId,
    userId,
    { content: caption, mediaUrl: result.secure_url },
  );

  emitMessageDelivery({ senderId: userId, recipientId, message, requestStatus, justAccepted, requestPreview });

  res.status(201).json({ message });
}

export async function uploadVoiceMessage(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new ApiError(400, 'No se recibió ningún archivo');
  }

  const userId = req.user!._id.toString();
  const conversationId = req.params.id;

  // Cloudinary trata el audio como resource_type "video" (mismo pipeline de transformación);
  // de ahí sale `duration` sin que el cliente tenga que medirlo ni mandarlo por su cuenta.
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'synccall/messages', resource_type: 'video' },
      (error, uploadResult) => {
        if (error || !uploadResult) {
          reject(error ?? new Error('Error al subir el audio'));
          return;
        }
        resolve(uploadResult);
      },
    );
    stream.end(req.file!.buffer);
  });

  const { message, recipientId, requestStatus, justAccepted, requestPreview } = await messagesService.sendMessage(
    conversationId,
    userId,
    { content: '', mediaUrl: result.secure_url, type: 'audio', durationSec: result.duration },
  );

  emitMessageDelivery({ senderId: userId, recipientId, message, requestStatus, justAccepted, requestPreview });

  res.status(201).json({ message });
}

export async function listRequests(req: Request, res: Response): Promise<void> {
  const result = await conversationsService.listMessageRequests(req.user!._id.toString());
  res.json(result);
}

export async function respondRequest(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const { status } = req.body as RespondMessageRequestInput;
  const { initiatorId } = await conversationsService.respondMessageRequest(req.params.id, userId, status);

  const payload: MessageRequestResolvedPayload = { conversationId: req.params.id, status, resolvedBy: userId };
  tryGetIo()?.to(`user:${userId}`).to(`user:${initiatorId}`).emit(SOCKET_EVENTS.MESSAGE_REQUEST_RESOLVED, payload);

  res.json({ status });
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  const result = await conversationsService.getConversationStatus(userId, req.params.friendId);
  res.json(result);
}

export async function hideConversation(req: Request, res: Response): Promise<void> {
  await conversationsService.hideConversation(req.params.id, req.user!._id.toString());
  res.status(204).send();
}

/**
 * Centraliza qué eventos de socket disparar según a dónde tiene que llegar el mensaje: DMs
 * normales si la solicitud ya está aceptada, o solo al inbox de solicitudes del destinatario
 * mientras siga pendiente (para no mostrarlo como si fuera un mensaje directo todavía).
 */
export function emitMessageDelivery({
  senderId,
  recipientId,
  message,
  requestStatus,
  justAccepted,
  requestPreview,
}: {
  senderId: string;
  recipientId: string;
  message: MessageNewPayload['message'];
  requestStatus: 'pending' | 'accepted' | 'declined';
  justAccepted: boolean;
  requestPreview: MessageRequestNewPayload['request'] | null;
}): void {
  const io = tryGetIo();
  if (!io) {
    return;
  }

  const messagePayload: MessageNewPayload = { message };

  if (requestStatus === 'pending') {
    io.to(`user:${senderId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, messagePayload);
    if (requestPreview) {
      io.to(`user:${recipientId}`).emit(SOCKET_EVENTS.MESSAGE_REQUEST_NEW, { request: requestPreview } satisfies MessageRequestNewPayload);
    }
    return;
  }

  io.to(`user:${senderId}`).to(`user:${recipientId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, messagePayload);

  const conversationPayload: ConversationUpdatedPayload = {
    conversationId: message.conversation,
    lastMessageAt: message.createdAt,
  };
  io.to(`user:${senderId}`).to(`user:${recipientId}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, conversationPayload);

  if (justAccepted) {
    const resolvedPayload: MessageRequestResolvedPayload = {
      conversationId: message.conversation,
      status: 'accepted',
      resolvedBy: senderId,
    };
    io.to(`user:${senderId}`).to(`user:${recipientId}`).emit(SOCKET_EVENTS.MESSAGE_REQUEST_RESOLVED, resolvedPayload);
  }
}
