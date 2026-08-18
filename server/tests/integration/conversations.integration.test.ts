import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { User } from '../../src/features/users/users.model';
import { Friendship } from '../../src/features/friends/friendship.model';
import { Message } from '../../src/features/messages/messages.model';
import { issueJwt } from '../../src/features/auth/auth.service';
import * as messagesService from '../../src/features/messages/messages.service';
import * as conversationsService from '../../src/features/conversations/conversations.service';

const app = createApp();

async function createTestUser(overrides: Record<string, unknown> = {}) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const user = await User.create({
    googleId: `g-${suffix}`,
    username: `user${suffix}`,
    displayName: 'Test User',
    avatarUrl: 'https://example.com/a.png',
    accentColor: '#5B6DFF',
    ...overrides,
  });
  const token = issueJwt(user._id.toString());
  return { user, token };
}

async function makeFriends(userAId: string, userBId: string): Promise<void> {
  const [userA, userB] = [userAId, userBId].sort();
  await Friendship.create({ userA, userB });
}

function authed(token: string) {
  return { Cookie: `token=${token}`, 'X-Requested-With': 'XMLHttpRequest' };
}

describe('POST /api/conversations', () => {
  it('devuelve 403 si los usuarios no son amigos', async () => {
    const { token } = await createTestUser();
    const { user: other } = await createTestUser();

    const res = await request(app).post('/api/conversations').set(authed(token)).send({ friendId: other._id.toString() });

    expect(res.status).toBe(403);
  });

  it('crea la conversación entre amigos y es idempotente', async () => {
    const { token, user } = await createTestUser();
    const { user: other } = await createTestUser();
    await makeFriends(user._id.toString(), other._id.toString());

    const res1 = await request(app).post('/api/conversations').set(authed(token)).send({ friendId: other._id.toString() });
    expect(res1.status).toBe(201);

    const res2 = await request(app).post('/api/conversations').set(authed(token)).send({ friendId: other._id.toString() });
    expect(res2.status).toBe(201);
    expect(res2.body.conversation.id).toBe(res1.body.conversation.id);
  });

  it('permite que un mismo usuario tenga conversaciones con varios amigos distintos', async () => {
    // Regresión: un índice único sobre un campo array ({participants: [...]}) es multikey
    // y bloqueaba esto (cualquier usuario repetido entre 2 documentos disparaba E11000),
    // aunque los pares fueran distintos. Por eso ahora es participantA/participantB.
    const { token, user } = await createTestUser();
    const { user: friendB } = await createTestUser();
    const { user: friendC } = await createTestUser();
    await makeFriends(user._id.toString(), friendB._id.toString());
    await makeFriends(user._id.toString(), friendC._id.toString());

    const resB = await request(app).post('/api/conversations').set(authed(token)).send({ friendId: friendB._id.toString() });
    expect(resB.status).toBe(201);

    const resC = await request(app).post('/api/conversations').set(authed(token)).send({ friendId: friendC._id.toString() });
    expect(resC.status).toBe(201);
    expect(resC.body.conversation.id).not.toBe(resB.body.conversation.id);

    const listRes = await request(app).get('/api/conversations').set(authed(token));
    expect(listRes.status).toBe(200);
    expect(listRes.body.conversations).toHaveLength(2);
  });
});

describe('mensajes: envío, cifrado en la base y lectura', () => {
  it('cifra el contenido en la base (sin texto plano) y lo desencripta al leerlo', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());

    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());

    const { message, recipientId, recipientUnreadCount } = await messagesService.sendMessage(
      conversation.id,
      userA._id.toString(),
      { content: 'Hola, ¿cómo va?' },
    );

    expect(message.content).toBe('Hola, ¿cómo va?');
    expect(recipientId).toBe(userB._id.toString());
    // Es el primer mensaje de la conversación: queda como solicitud pendiente, así que
    // todavía no cuenta como no-leído en los DMs normales del destinatario.
    expect(recipientUnreadCount).toBe(0);

    const rawDoc = await Message.findById(message.id).lean();
    expect(rawDoc).toBeTruthy();
    expect(JSON.stringify(rawDoc)).not.toContain('Hola');
    expect(rawDoc!.ciphertext).toBeTruthy();

    const page = await messagesService.getMessages(conversation.id, userB._id.toString(), { limit: 50 });
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0].content).toBe('Hola, ¿cómo va?');
  });

  it('permite un mensaje de imagen sin caption (contenido vacío)', async () => {
    // Regresión: cifrar '' da un ciphertext de largo 0, y Mongoose trata '' como "ausente"
    // en un campo String required, así que rechazaba estos mensajes.
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());

    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), {
      content: '',
      mediaUrl: 'https://res.cloudinary.com/demo/image/upload/synccall/messages/foo.jpg',
    });

    expect(message.type).toBe('image');
    expect(message.content).toBe('');
    expect(message.mediaUrl).toContain('cloudinary');

    const page = await messagesService.getMessages(conversation.id, userB._id.toString(), { limit: 50 });
    expect(page.messages[0].type).toBe('image');
    expect(page.messages[0].mediaUrl).toBe(message.mediaUrl);
  });

  it('permite un mensaje de voz: type "audio" y duración persisten y se leen bien', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());

    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), {
      content: '',
      mediaUrl: 'https://res.cloudinary.com/demo/video/upload/synccall/messages/voice.webm',
      type: 'audio',
      durationSec: 12.4,
    });

    expect(message.type).toBe('audio');
    expect(message.durationSec).toBe(12.4);
    expect(message.mediaUrl).toContain('cloudinary');

    const page = await messagesService.getMessages(conversation.id, userB._id.toString(), { limit: 50 });
    expect(page.messages[0].type).toBe('audio');
    expect(page.messages[0].durationSec).toBe(12.4);
  });

  it('rechaza leer o mandar mensajes a quien no participa de la conversación', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    const { user: outsider } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());

    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());

    await expect(
      messagesService.sendMessage(conversation.id, outsider._id.toString(), { content: 'intruso' }),
    ).rejects.toThrow();
    await expect(
      messagesService.getMessages(conversation.id, outsider._id.toString(), { limit: 50 }),
    ).rejects.toThrow();
  });

  it('pagina el historial con cursor y sin perder ni duplicar mensajes', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());

    for (let i = 0; i < 5; i += 1) {
      await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: `mensaje ${i}` });
    }

    const firstPage = await messagesService.getMessages(conversation.id, userA._id.toString(), { limit: 3 });
    expect(firstPage.messages).toHaveLength(3);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await messagesService.getMessages(conversation.id, userA._id.toString(), {
      limit: 3,
      before: firstPage.nextCursor!,
    });
    expect(secondPage.messages).toHaveLength(2);
    expect(secondPage.nextCursor).toBeNull();

    const allContents = [...secondPage.messages, ...firstPage.messages].map((m) => m.content);
    expect(new Set(allContents).size).toBe(5);
  });
});

describe('GET /api/conversations y POST /:id/read', () => {
  it('lista conversaciones con preview del último mensaje y contador de no leídos, ya aceptada la solicitud', async () => {
    const { token: tokenA, user: userA } = await createTestUser();
    const { token: tokenB, user: userB } = await createTestUser({ username: 'friendb' });
    await makeFriends(userA._id.toString(), userB._id.toString());

    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'primer mensaje' });
    // Acepta la solicitud para que la conversación pase a los DMs normales de userB.
    await conversationsService.respondMessageRequest(conversation.id, userB._id.toString(), 'accepted');

    const listRes = await request(app).get('/api/conversations').set(authed(tokenB));
    expect(listRes.status).toBe(200);
    expect(listRes.body.conversations).toHaveLength(1);
    expect(listRes.body.conversations[0].lastMessage.content).toBe('primer mensaje');
    expect(listRes.body.conversations[0].unreadCount).toBe(1);
    expect(listRes.body.conversations[0].otherUser.username).toBe(userA.username);

    const readRes = await request(app).post(`/api/conversations/${conversation.id}/read`).set(authed(tokenB));
    expect(readRes.status).toBe(204);

    const afterRead = await request(app).get('/api/conversations').set(authed(tokenB));
    expect(afterRead.body.conversations[0].unreadCount).toBe(0);

    // El emisor nunca acumula no-leídos por sus propios mensajes.
    const listResA = await request(app).get('/api/conversations').set(authed(tokenA));
    expect(listResA.body.conversations[0].unreadCount).toBe(0);
  });
});

describe('Solicitudes de mensajes', () => {
  it('el primer mensaje entre amigos queda pendiente: no aparece en los DMs del destinatario sino en sus solicitudes', async () => {
    const { token: tokenA, user: userA } = await createTestUser();
    const { token: tokenB, user: userB } = await createTestUser({ username: 'destinatario' });
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());

    const { requestStatus, isNewRequest } = await messagesService.sendMessage(conversation.id, userA._id.toString(), {
      content: 'hola, nos hicimos amigos recién',
    });
    expect(requestStatus).toBe('pending');
    expect(isNewRequest).toBe(true);

    const dmListB = await request(app).get('/api/conversations').set(authed(tokenB));
    expect(dmListB.body.conversations).toHaveLength(0);

    const requestsB = await request(app).get('/api/conversations/requests').set(authed(tokenB));
    expect(requestsB.status).toBe(200);
    expect(requestsB.body.requests).toHaveLength(1);
    expect(requestsB.body.requests[0].user.username).toBe(userA.username);
    expect(requestsB.body.requests[0].lastMessage.content).toBe('hola, nos hicimos amigos recién');

    // Para quien la inició, la conversación se comporta como una normal desde el principio.
    const dmListA = await request(app).get('/api/conversations').set(authed(tokenA));
    expect(dmListA.body.conversations).toHaveLength(1);
  });

  it('el iniciador puede seguir mandando mensajes mientras la solicitud sigue pendiente', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());

    await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'uno' });
    const second = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'dos' });
    expect(second.requestStatus).toBe('pending');
    expect(second.justAccepted).toBe(false);
  });

  it('PATCH /api/conversations/:id/request acepta la solicitud y la mueve a los DMs', async () => {
    const { user: userA } = await createTestUser();
    const { token: tokenB, user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });

    const acceptRes = await request(app)
      .patch(`/api/conversations/${conversation.id}/request`)
      .set(authed(tokenB))
      .send({ status: 'accepted' });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe('accepted');

    const dmListB = await request(app).get('/api/conversations').set(authed(tokenB));
    expect(dmListB.body.conversations).toHaveLength(1);
    expect(dmListB.body.conversations[0].unreadCount).toBe(1);

    const requestsB = await request(app).get('/api/conversations/requests').set(authed(tokenB));
    expect(requestsB.body.requests).toHaveLength(0);
  });

  it('rechazar bloquea al iniciador hasta que se reactive desde el perfil', async () => {
    const { user: userA } = await createTestUser();
    const { token: tokenB, user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });

    const declineRes = await request(app)
      .patch(`/api/conversations/${conversation.id}/request`)
      .set(authed(tokenB))
      .send({ status: 'declined' });
    expect(declineRes.status).toBe(200);
    expect(declineRes.body.status).toBe('declined');

    await expect(
      messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'insisto' }),
    ).rejects.toThrow('Este usuario no acepta mensajes tuyos por ahora');

    // "Activar mensajes" desde el perfil de ese amigo: el destinatario puede reabrirla en
    // cualquier momento, no solo mientras está pendiente.
    const reactivateRes = await request(app)
      .patch(`/api/conversations/${conversation.id}/request`)
      .set(authed(tokenB))
      .send({ status: 'accepted' });
    expect(reactivateRes.status).toBe(200);

    const { requestStatus } = await messagesService.sendMessage(conversation.id, userA._id.toString(), {
      content: 'ahora sí me dejan escribir',
    });
    expect(requestStatus).toBe('accepted');
  });

  it('solo el destinatario (no quien inició la solicitud ni un tercero) puede aceptarla o rechazarla', async () => {
    const { token: tokenA, user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    const { token: tokenOutsider } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });

    const selfRes = await request(app)
      .patch(`/api/conversations/${conversation.id}/request`)
      .set(authed(tokenA))
      .send({ status: 'accepted' });
    expect(selfRes.status).toBe(403);

    const outsiderRes = await request(app)
      .patch(`/api/conversations/${conversation.id}/request`)
      .set(authed(tokenOutsider))
      .send({ status: 'accepted' });
    expect(outsiderRes.status).toBe(403);
  });

  it('GET /api/conversations/status/:friendId refleja si existe conversación y su estado', async () => {
    const { token: tokenA, user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());

    const beforeRes = await request(app)
      .get(`/api/conversations/status/${userB._id.toString()}`)
      .set(authed(tokenA));
    expect(beforeRes.body).toEqual({ exists: false, conversationId: null, requestStatus: null, requestedBy: null });

    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });

    const afterRes = await request(app)
      .get(`/api/conversations/status/${userB._id.toString()}`)
      .set(authed(tokenA));
    expect(afterRes.body.exists).toBe(true);
    expect(afterRes.body.requestStatus).toBe('pending');
    expect(afterRes.body.requestedBy).toBe(userA._id.toString());
  });
});

describe('Eliminar de mensajes directos (ocultar conversación)', () => {
  it('agregar un amigo nuevo no crea conversación: no aparece en mensajes directos hasta que alguien abre el chat', async () => {
    const { token: tokenA, user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());

    const listRes = await request(app).get('/api/conversations').set(authed(tokenA));
    expect(listRes.body.conversations).toHaveLength(0);
  });

  it('POST /:id/hide oculta la conversación solo para quien la eliminó, el otro la sigue viendo', async () => {
    const { token: tokenA, user: userA } = await createTestUser();
    const { token: tokenB, user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });
    await conversationsService.respondMessageRequest(conversation.id, userB._id.toString(), 'accepted');

    const hideRes = await request(app).post(`/api/conversations/${conversation.id}/hide`).set(authed(tokenA));
    expect(hideRes.status).toBe(204);

    const listA = await request(app).get('/api/conversations').set(authed(tokenA));
    expect(listA.body.conversations).toHaveLength(0);

    const listB = await request(app).get('/api/conversations').set(authed(tokenB));
    expect(listB.body.conversations).toHaveLength(1);
  });

  it('un mensaje nuevo hace reaparecer la conversación para quien la había eliminado', async () => {
    const { token: tokenA, user: userA } = await createTestUser();
    const { token: tokenB, user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });
    await conversationsService.respondMessageRequest(conversation.id, userB._id.toString(), 'accepted');
    await conversationsService.hideConversation(conversation.id, userA._id.toString());

    await messagesService.sendMessage(conversation.id, userB._id.toString(), { content: 'te sigo escribiendo' });

    const listA = await request(app).get('/api/conversations').set(authed(tokenA));
    expect(listA.body.conversations).toHaveLength(1);
  });

  it('reabrir el chat (getOrCreateConversation) también la vuelve a agregar a mensajes directos', async () => {
    const { token: tokenA, user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });
    await conversationsService.hideConversation(conversation.id, userA._id.toString());

    let listA = await request(app).get('/api/conversations').set(authed(tokenA));
    expect(listA.body.conversations).toHaveLength(0);

    await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());

    listA = await request(app).get('/api/conversations').set(authed(tokenA));
    expect(listA.body.conversations).toHaveLength(1);
  });

  it('devuelve 403 si intentás ocultar una conversación de la que no participás', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    const { token: tokenOutsider } = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());

    const res = await request(app).post(`/api/conversations/${conversation.id}/hide`).set(authed(tokenOutsider));
    expect(res.status).toBe(403);
  });
});
