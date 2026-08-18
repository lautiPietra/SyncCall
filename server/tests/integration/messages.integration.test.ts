import { describe, expect, it } from 'vitest';
import { User } from '../../src/features/users/users.model';
import { Friendship } from '../../src/features/friends/friendship.model';
import { Message } from '../../src/features/messages/messages.model';
import * as messagesService from '../../src/features/messages/messages.service';
import * as conversationsService from '../../src/features/conversations/conversations.service';

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
  return user;
}

async function makeFriends(userAId: string, userBId: string): Promise<void> {
  const [userA, userB] = [userAId, userBId].sort();
  await Friendship.create({ userA, userB });
}

describe('sendMessage', () => {
  it('rechaza mandar un mensaje nuevo si ya no son amigos', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'antes de dejar de ser amigos' });

    await Friendship.deleteMany({});

    await expect(
      messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'después de dejar de ser amigos' }),
    ).rejects.toThrow('Ya no son amigos, no podés enviarle mensajes');
  });

  it('el historial previo se puede seguir leyendo aunque ya no sean amigos', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'antes de dejar de ser amigos' });

    await Friendship.deleteMany({});

    const page = await messagesService.getMessages(conversation.id, userB._id.toString(), { limit: 50 });
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0].content).toBe('antes de dejar de ser amigos');
  });
});

describe('editMessage', () => {
  it('el autor puede editar el contenido y queda marcado como editado', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'original' });

    const { message: edited } = await messagesService.editMessage(message.id, userA._id.toString(), 'corregido');

    expect(edited.content).toBe('corregido');
    expect(edited.editedAt).toBeTruthy();

    const page = await messagesService.getMessages(conversation.id, userA._id.toString(), { limit: 50 });
    expect(page.messages[0].content).toBe('corregido');
  });

  it('rechaza que alguien que no es el autor edite el mensaje', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'original' });

    await expect(messagesService.editMessage(message.id, userB._id.toString(), 'intento ajeno')).rejects.toThrow(
      'Solo podés editar tus propios mensajes',
    );
  });

  it('rechaza editar un mensaje ya eliminado', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'original' });
    await messagesService.deleteMessage(message.id, userA._id.toString());

    await expect(messagesService.editMessage(message.id, userA._id.toString(), 'nuevo texto')).rejects.toThrow(
      'No podés editar un mensaje eliminado',
    );
  });
});

describe('deleteMessage', () => {
  it('el autor puede eliminar: se limpia el contenido cifrado en la base y se marca deleted', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'secreto' });

    const { message: deleted } = await messagesService.deleteMessage(message.id, userA._id.toString());
    expect(deleted.deleted).toBe(true);
    expect(deleted.content).toBe('');

    const rawDoc = await Message.findById(message.id).lean();
    expect(JSON.stringify(rawDoc)).not.toContain('secreto');

    const page = await messagesService.getMessages(conversation.id, userB._id.toString(), { limit: 50 });
    expect(page.messages[0].deleted).toBe(true);
    expect(page.messages[0].content).toBe('');
  });

  it('rechaza que alguien que no es el autor elimine el mensaje', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'original' });

    await expect(messagesService.deleteMessage(message.id, userB._id.toString())).rejects.toThrow(
      'Solo podés eliminar tus propios mensajes',
    );
  });

  it('borrar dos veces no rompe nada (idempotente)', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'original' });

    await messagesService.deleteMessage(message.id, userA._id.toString());
    const { message: secondAttempt } = await messagesService.deleteMessage(message.id, userA._id.toString());
    expect(secondAttempt.deleted).toBe(true);
  });
});

describe('reactToMessage', () => {
  it('agrega y luego saca la reacción del mismo usuario (toggle)', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });

    const { message: reacted } = await messagesService.reactToMessage(message.id, userB._id.toString(), '👍');
    expect(reacted.reactions).toEqual([{ emoji: '👍', userId: userB._id.toString() }]);

    const { message: toggled } = await messagesService.reactToMessage(message.id, userB._id.toString(), '👍');
    expect(toggled.reactions).toEqual([]);
  });

  it('dos usuarios pueden reaccionar con el mismo emoji sin pisarse', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });

    await messagesService.reactToMessage(message.id, userA._id.toString(), '🔥');
    const { message: both } = await messagesService.reactToMessage(message.id, userB._id.toString(), '🔥');
    expect(both.reactions).toHaveLength(2);
  });

  it('reaccionar con un emoji distinto reemplaza la reacción anterior del mismo usuario', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });

    await messagesService.reactToMessage(message.id, userB._id.toString(), '👍');
    const { message: switched } = await messagesService.reactToMessage(message.id, userB._id.toString(), '🔥');

    expect(switched.reactions).toEqual([{ emoji: '🔥', userId: userB._id.toString() }]);
  });

  it('removeReaction saca la reacción del usuario sin necesidad de saber qué emoji era', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });

    await messagesService.reactToMessage(message.id, userB._id.toString(), '😮');
    const { message: cleared } = await messagesService.removeReaction(message.id, userB._id.toString());
    expect(cleared.reactions).toEqual([]);

    // Sin reacción previa no rompe (idempotente).
    const { message: stillCleared } = await messagesService.removeReaction(message.id, userB._id.toString());
    expect(stillCleared.reactions).toEqual([]);
  });

  it('rechaza que alguien ajeno a la conversación reaccione', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const outsider = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });

    await expect(messagesService.reactToMessage(message.id, outsider._id.toString(), '😮')).rejects.toThrow();
  });

  it('rechaza reaccionar si ya no son amigos', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });

    await Friendship.deleteMany({});

    await expect(messagesService.reactToMessage(message.id, userB._id.toString(), '👍')).rejects.toThrow(
      'Ya no son amigos, no podés reaccionar a sus mensajes',
    );
  });

  it('rechaza reaccionar a un mensaje eliminado', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const { message } = await messagesService.sendMessage(conversation.id, userA._id.toString(), { content: 'hola' });
    await messagesService.deleteMessage(message.id, userA._id.toString());

    await expect(messagesService.reactToMessage(message.id, userB._id.toString(), '❤️')).rejects.toThrow(
      'No podés reaccionar a un mensaje eliminado',
    );
  });
});
