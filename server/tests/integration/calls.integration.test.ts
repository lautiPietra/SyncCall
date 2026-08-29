import { describe, expect, it } from 'vitest';
import { SOCKET_EVENTS } from '@synccall/shared';
import { User } from '../../src/features/users/users.model';
import { Friendship } from '../../src/features/friends/friendship.model';
import * as groupsService from '../../src/features/groups/groups.service';
import { GroupInvite } from '../../src/features/groups/groupInvites.model';
import * as conversationsService from '../../src/features/conversations/conversations.service';
import { registerCallHandlers, handleCallDisconnect, syncActiveGroupCallsToSocket } from '../../src/sockets/handlers/call.handlers';
import { addConnection } from '../../src/sockets/presence';
import { MAX_GROUP_CALL_PARTICIPANTS } from '../../src/sockets/callRegistry';

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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface EmittedEvent {
  room: string;
  event: string;
  payload: unknown;
}

class FakeBroadcast {
  constructor(
    private io: FakeIO,
    private rooms: string[],
  ) {}
  to(room: string): FakeBroadcast {
    this.rooms.push(room);
    return this;
  }
  emit(event: string, payload: unknown): void {
    this.rooms.forEach((room) => this.io.log.push({ room, event, payload }));
  }
}

class FakeIO {
  log: EmittedEvent[] = [];
  to(room: string): FakeBroadcast {
    return new FakeBroadcast(this, [room]);
  }
  eventsFor(userId: string, event: string): unknown[] {
    return this.log.filter((e) => e.room === `user:${userId}` && e.event === event).map((e) => e.payload);
  }
  eventsForGroup(groupId: string, event: string): unknown[] {
    return this.log.filter((e) => e.room === `group:${groupId}` && e.event === event).map((e) => e.payload);
  }
}

class FakeSocket {
  handlers = new Map<string, (payload: never) => void>();
  emitted: { event: string; payload: unknown }[] = [];
  constructor(public id: string) {}
  on(event: string, cb: (payload: never) => void): void {
    this.handlers.set(event, cb);
  }
  emit(event: string, payload: unknown): void {
    this.emitted.push({ event, payload });
  }
  async trigger(event: string, payload: unknown): Promise<void> {
    const cb = this.handlers.get(event);
    if (!cb) {
      throw new Error(`No hay handler registrado para ${event}`);
    }
    cb(payload as never);
    await sleep(60);
  }
}

async function setupDm() {
  const userA = await createTestUser();
  const userB = await createTestUser();
  await makeFriends(userA._id.toString(), userB._id.toString());
  const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
  addConnection(userA._id.toString(), 'presence-a');
  addConnection(userB._id.toString(), 'presence-b');

  const io = new FakeIO();
  const socketA = new FakeSocket('socket-a');
  const socketB = new FakeSocket('socket-b');
  registerCallHandlers(io as never, socketA as never, userA._id.toString());
  registerCallHandlers(io as never, socketB as never, userB._id.toString());

  return { userA, userB, conversation, io, socketA, socketB };
}

describe('llamadas DM vía sockets: invitar, aceptar, rechazar, cancelar', () => {
  it('rechaza invitar si ya no son amigos', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    await Friendship.deleteMany({});
    addConnection(userB._id.toString(), 'presence-b');

    const io = new FakeIO();
    const socketA = new FakeSocket('socket-a');
    registerCallHandlers(io as never, socketA as never, userA._id.toString());

    await socketA.trigger(SOCKET_EVENTS.CALL_INVITE, { conversationId: conversation.id });

    const errors = io.eventsFor(userA._id.toString(), SOCKET_EVENTS.CALL_ERROR);
    expect(errors).toHaveLength(1);
    expect((errors[0] as { message: string }).message).toContain('Ya no son amigos');
    expect(io.eventsFor(userA._id.toString(), SOCKET_EVENTS.CALL_INVITE)).toHaveLength(0);
  });

  it('rechaza invitar si el destinatario no está online', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    const conversation = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    // userB nunca se conecta (no addConnection).

    const io = new FakeIO();
    const socketA = new FakeSocket('socket-a');
    registerCallHandlers(io as never, socketA as never, userA._id.toString());

    await socketA.trigger(SOCKET_EVENTS.CALL_INVITE, { conversationId: conversation.id });

    const errors = io.eventsFor(userA._id.toString(), SOCKET_EVENTS.CALL_ERROR);
    expect(errors).toHaveLength(1);
    expect((errors[0] as { message: string }).message).toContain('no está disponible');
  });

  it('flujo completo: invitar, sonar en ambos lados, aceptar, y que ambos se enteren', async () => {
    const { userA, userB, conversation, io, socketA } = await setupDm();

    await socketA.trigger(SOCKET_EVENTS.CALL_INVITE, { conversationId: conversation.id });
    const invitesA = io.eventsFor(userA._id.toString(), SOCKET_EVENTS.CALL_INVITE);
    const invitesB = io.eventsFor(userB._id.toString(), SOCKET_EVENTS.CALL_INVITE);
    expect(invitesA).toHaveLength(1);
    expect(invitesB).toHaveLength(1);
    const callId = (invitesB[0] as { callId: string }).callId;
    expect((invitesB[0] as { fromUserId: string }).fromUserId).toBe(userA._id.toString());

    const { socketB } = await (async () => {
      // Reconstruye socketB registrado sobre la misma io para aceptar la llamada.
      const socketB = new FakeSocket('socket-b');
      registerCallHandlers(io as never, socketB as never, userB._id.toString());
      return { socketB };
    })();

    await socketB.trigger(SOCKET_EVENTS.CALL_ACCEPT, { callId });
    const acceptsA = io.eventsFor(userA._id.toString(), SOCKET_EVENTS.CALL_ACCEPT);
    const acceptsB = io.eventsFor(userB._id.toString(), SOCKET_EVENTS.CALL_ACCEPT);
    expect(acceptsA).toHaveLength(1);
    expect(acceptsB).toHaveLength(1);
  });

  it('la llamada ocupada (callee ya en otra llamada activa) avisa CALL_BUSY solo al que llama', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const userC = await createTestUser();
    await makeFriends(userA._id.toString(), userB._id.toString());
    await makeFriends(userC._id.toString(), userB._id.toString());
    const convAB = await conversationsService.getOrCreateConversation(userA._id.toString(), userB._id.toString());
    const convCB = await conversationsService.getOrCreateConversation(userC._id.toString(), userB._id.toString());
    addConnection(userB._id.toString(), 'presence-b');
    addConnection(userA._id.toString(), 'presence-a');
    addConnection(userC._id.toString(), 'presence-c');

    const io = new FakeIO();
    const socketA = new FakeSocket('socket-a');
    const socketB = new FakeSocket('socket-b');
    const socketC = new FakeSocket('socket-c');
    registerCallHandlers(io as never, socketA as never, userA._id.toString());
    registerCallHandlers(io as never, socketB as never, userB._id.toString());
    registerCallHandlers(io as never, socketC as never, userC._id.toString());

    await socketA.trigger(SOCKET_EVENTS.CALL_INVITE, { conversationId: convAB.id });
    const callId = (io.eventsFor(userB._id.toString(), SOCKET_EVENTS.CALL_INVITE)[0] as { callId: string }).callId;
    await socketB.trigger(SOCKET_EVENTS.CALL_ACCEPT, { callId });

    await socketC.trigger(SOCKET_EVENTS.CALL_INVITE, { conversationId: convCB.id });
    const busy = io.eventsFor(userC._id.toString(), SOCKET_EVENTS.CALL_BUSY);
    expect(busy).toHaveLength(1);
  });

  it('cancelar antes de que contesten avisa a ambos lados con CALL_CANCEL', async () => {
    const { userA, userB, conversation, io, socketA } = await setupDm();
    await socketA.trigger(SOCKET_EVENTS.CALL_INVITE, { conversationId: conversation.id });
    const callId = (io.eventsFor(userB._id.toString(), SOCKET_EVENTS.CALL_INVITE)[0] as { callId: string }).callId;

    await socketA.trigger(SOCKET_EVENTS.CALL_CANCEL, { callId });
    expect(io.eventsFor(userA._id.toString(), SOCKET_EVENTS.CALL_CANCEL)).toHaveLength(1);
    expect(io.eventsFor(userB._id.toString(), SOCKET_EVENTS.CALL_CANCEL)).toHaveLength(1);
  });
});

describe('llamadas de grupo vía sockets: unirse, salir, cupo, sincronización', () => {
  async function setupGroupWithMembers(memberCount: number) {
    const owner = await createTestUser();
    const members = await Promise.all(Array.from({ length: memberCount }, () => createTestUser()));
    for (const m of members) {
      await makeFriends(owner._id.toString(), m._id.toString());
    }
    const { group, defaultVoiceChannel } = await groupsService.createGroup(
      owner._id.toString(),
      'Grupo con voz',
      members.map((m) => m._id.toString()),
    );
    for (const m of members) {
      const invite = await GroupInvite.findOne({ group: group._id, invitedUser: m._id });
      await groupsService.respondGroupInvite(invite!._id.toString(), m._id.toString(), 'accepted');
    }
    return { owner, members, group, voiceChannel: defaultVoiceChannel };
  }

  it('un no-miembro no puede unirse (ignorado en silencio, sin filtrar el estado del grupo)', async () => {
    const { group, voiceChannel } = await setupGroupWithMembers(1);
    const outsider = await createTestUser();

    const io = new FakeIO();
    const socket = new FakeSocket('socket-outsider');
    registerCallHandlers(io as never, socket as never, outsider._id.toString());

    await socket.trigger(SOCKET_EVENTS.CALL_GROUP_JOIN, { channelId: voiceChannel._id.toString() });
    expect(io.eventsForGroup(group._id.toString(), SOCKET_EVENTS.CALL_GROUP_STATE)).toHaveLength(0);
    expect(io.eventsFor(outsider._id.toString(), SOCKET_EVENTS.CALL_ERROR)).toHaveLength(0);
  });

  it('rechaza unirse a un canal que no es de voz', async () => {
    const { owner, group } = await setupGroupWithMembers(0);
    const { channels } = await groupsService.getGroupDetail(group._id.toString(), owner._id.toString());
    const textChannel = channels.find((c) => c.type === 'text')!;

    const io = new FakeIO();
    const socket = new FakeSocket('socket-owner');
    registerCallHandlers(io as never, socket as never, owner._id.toString());

    await socket.trigger(SOCKET_EVENTS.CALL_GROUP_JOIN, { channelId: textChannel._id.toString() });
    const errors = io.eventsFor(owner._id.toString(), SOCKET_EVENTS.CALL_ERROR);
    expect(errors).toHaveLength(1);
    expect((errors[0] as { message: string }).message).toContain('no es de voz');
  });

  it('un miembro se une y el grupo entero recibe el estado actualizado', async () => {
    const { owner, group, voiceChannel } = await setupGroupWithMembers(1);

    const io = new FakeIO();
    const socket = new FakeSocket('socket-owner');
    registerCallHandlers(io as never, socket as never, owner._id.toString());

    await socket.trigger(SOCKET_EVENTS.CALL_GROUP_JOIN, { channelId: voiceChannel._id.toString() });
    const states = io.eventsForGroup(group._id.toString(), SOCKET_EVENTS.CALL_GROUP_STATE);
    expect(states).toHaveLength(1);
    const state = states[0] as { participants: { userId: string }[]; callId: string | null };
    expect(state.participants.map((p) => p.userId)).toEqual([owner._id.toString()]);
    expect(state.callId).toBeTruthy();
  });

  it(`respeta el cupo de ${MAX_GROUP_CALL_PARTICIPANTS} a través del handler real, con error prolijo para quien queda afuera`, async () => {
    const { members, group, voiceChannel } = await setupGroupWithMembers(MAX_GROUP_CALL_PARTICIPANTS + 1);

    const io = new FakeIO();
    for (let i = 0; i < MAX_GROUP_CALL_PARTICIPANTS; i++) {
      const socket = new FakeSocket(`socket-${i}`);
      registerCallHandlers(io as never, socket as never, members[i]._id.toString());
      await socket.trigger(SOCKET_EVENTS.CALL_GROUP_JOIN, { channelId: voiceChannel._id.toString() });
    }

    const overflowSocket = new FakeSocket('socket-overflow');
    registerCallHandlers(io as never, overflowSocket as never, members[MAX_GROUP_CALL_PARTICIPANTS]._id.toString());
    await overflowSocket.trigger(SOCKET_EVENTS.CALL_GROUP_JOIN, { channelId: voiceChannel._id.toString() });

    const errors = io.eventsFor(members[MAX_GROUP_CALL_PARTICIPANTS]._id.toString(), SOCKET_EVENTS.CALL_ERROR);
    expect(errors).toHaveLength(1);
    expect((errors[0] as { message: string }).message).toContain('llena');

    const lastState = io.eventsForGroup(group._id.toString(), SOCKET_EVENTS.CALL_GROUP_STATE).at(-1) as {
      participants: unknown[];
    };
    expect(lastState.participants).toHaveLength(MAX_GROUP_CALL_PARTICIPANTS);
  });

  it('salir del canal actualiza el estado para el resto del grupo', async () => {
    const { owner, members, group, voiceChannel } = await setupGroupWithMembers(1);
    const socketOwner = new FakeSocket('socket-owner');
    const socketMember = new FakeSocket('socket-member');
    const io = new FakeIO();
    registerCallHandlers(io as never, socketOwner as never, owner._id.toString());
    registerCallHandlers(io as never, socketMember as never, members[0]._id.toString());

    await socketOwner.trigger(SOCKET_EVENTS.CALL_GROUP_JOIN, { channelId: voiceChannel._id.toString() });
    await socketMember.trigger(SOCKET_EVENTS.CALL_GROUP_JOIN, { channelId: voiceChannel._id.toString() });

    await socketOwner.trigger(SOCKET_EVENTS.CALL_GROUP_LEAVE, { channelId: voiceChannel._id.toString() });
    const states = io.eventsForGroup(group._id.toString(), SOCKET_EVENTS.CALL_GROUP_STATE);
    const last = states.at(-1) as { participants: { userId: string }[] };
    expect(last.participants.map((p) => p.userId)).toEqual([members[0]._id.toString()]);
  });

  it('syncActiveGroupCallsToSocket le manda el estado actual solo al socket que se conecta (no es un broadcast)', async () => {
    const { owner, group, voiceChannel } = await setupGroupWithMembers(1);
    const io = new FakeIO();
    const socketOwner = new FakeSocket('socket-owner');
    registerCallHandlers(io as never, socketOwner as never, owner._id.toString());
    await socketOwner.trigger(SOCKET_EVENTS.CALL_GROUP_JOIN, { channelId: voiceChannel._id.toString() });

    const newSocket = new FakeSocket('socket-nuevo');
    syncActiveGroupCallsToSocket(newSocket as never, [group._id.toString()]);

    expect(newSocket.emitted).toHaveLength(1);
    expect(newSocket.emitted[0].event).toBe(SOCKET_EVENTS.CALL_GROUP_STATE);
    const payload = newSocket.emitted[0].payload as { participants: { userId: string }[] };
    expect(payload.participants.map((p) => p.userId)).toEqual([owner._id.toString()]);
  });
});

describe('desconexión de socket: limpieza de llamadas activas', () => {
  it('DM: si se cae el socket del que está en la llamada, se termina y se avisa a ambos', async () => {
    const { userA, userB, conversation, io, socketA } = await setupDm();
    await socketA.trigger(SOCKET_EVENTS.CALL_INVITE, { conversationId: conversation.id });
    const callId = (io.eventsFor(userB._id.toString(), SOCKET_EVENTS.CALL_INVITE)[0] as { callId: string }).callId;
    const socketB = new FakeSocket('socket-b');
    registerCallHandlers(io as never, socketB as never, userB._id.toString());
    await socketB.trigger(SOCKET_EVENTS.CALL_ACCEPT, { callId });

    handleCallDisconnect(io as never, userA._id.toString(), 'socket-a');
    await sleep(30);

    expect(io.eventsFor(userA._id.toString(), SOCKET_EVENTS.CALL_END)).toHaveLength(1);
    expect(io.eventsFor(userB._id.toString(), SOCKET_EVENTS.CALL_END)).toHaveLength(1);
  });

  it('grupo: si se cae el socket de un participante, el resto se entera por CALL_GROUP_STATE', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    await makeFriends(owner._id.toString(), member._id.toString());
    const { group, defaultVoiceChannel } = await groupsService.createGroup(owner._id.toString(), 'Grupo', [member._id.toString()]);
    const invite = await GroupInvite.findOne({ group: group._id, invitedUser: member._id });
    await groupsService.respondGroupInvite(invite!._id.toString(), member._id.toString(), 'accepted');

    const io = new FakeIO();
    const socketOwner = new FakeSocket('socket-owner');
    const socketMember = new FakeSocket('socket-member');
    registerCallHandlers(io as never, socketOwner as never, owner._id.toString());
    registerCallHandlers(io as never, socketMember as never, member._id.toString());
    await socketOwner.trigger(SOCKET_EVENTS.CALL_GROUP_JOIN, { channelId: defaultVoiceChannel._id.toString() });
    await socketMember.trigger(SOCKET_EVENTS.CALL_GROUP_JOIN, { channelId: defaultVoiceChannel._id.toString() });

    handleCallDisconnect(io as never, member._id.toString(), 'socket-member');
    await sleep(30);

    const last = io.eventsForGroup(group._id.toString(), SOCKET_EVENTS.CALL_GROUP_STATE).at(-1) as {
      participants: { userId: string }[];
    };
    expect(last.participants.map((p) => p.userId)).toEqual([owner._id.toString()]);
  });
});

describe('señalización WebRTC: solo entre participantes de la misma llamada', () => {
  it('relaya la señal entre dos participantes activos', async () => {
    const { userA, userB, conversation, io, socketA } = await setupDm();
    await socketA.trigger(SOCKET_EVENTS.CALL_INVITE, { conversationId: conversation.id });
    const callId = (io.eventsFor(userB._id.toString(), SOCKET_EVENTS.CALL_INVITE)[0] as { callId: string }).callId;
    const socketB = new FakeSocket('socket-b');
    registerCallHandlers(io as never, socketB as never, userB._id.toString());
    await socketB.trigger(SOCKET_EVENTS.CALL_ACCEPT, { callId });

    await socketA.trigger(SOCKET_EVENTS.CALL_SIGNAL, { callId, toUserId: userB._id.toString(), data: { sdp: 'offer-fake' } });
    const signals = io.eventsFor(userB._id.toString(), SOCKET_EVENTS.CALL_SIGNAL);
    expect(signals).toHaveLength(1);
    expect((signals[0] as { fromUserId: string }).fromUserId).toBe(userA._id.toString());
  });

  it('no relaya señales si alguno de los dos no es participante de esa llamada', async () => {
    const { userA, conversation, io, socketA } = await setupDm();
    await socketA.trigger(SOCKET_EVENTS.CALL_INVITE, { conversationId: conversation.id });
    const callId = (io.eventsFor(userA._id.toString(), SOCKET_EVENTS.CALL_INVITE)[0] as { callId: string }).callId;

    const outsider = await createTestUser();
    await socketA.trigger(SOCKET_EVENTS.CALL_SIGNAL, { callId, toUserId: outsider._id.toString(), data: {} });
    expect(io.eventsFor(outsider._id.toString(), SOCKET_EVENTS.CALL_SIGNAL)).toHaveLength(0);
  });
});
