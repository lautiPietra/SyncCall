import { describe, expect, it } from 'vitest';
import { User } from '../../src/features/users/users.model';
import { Friendship } from '../../src/features/friends/friendship.model';
import { GroupInvite } from '../../src/features/groups/groupInvites.model';
import * as groupsService from '../../src/features/groups/groups.service';
import * as groupMessagesService from '../../src/features/groups/groupMessages.service';

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

async function setup() {
  const owner = await createTestUser();
  const member = await createTestUser();
  const outsider = await createTestUser();
  await makeFriends(owner._id.toString(), member._id.toString());
  const { group, defaultChannel } = await groupsService.createGroup(owner._id.toString(), 'Grupo', [member._id.toString()]);

  const invite = await GroupInvite.findOne({ group: group._id, invitedUser: member._id });
  await groupsService.respondGroupInvite(invite!._id.toString(), member._id.toString(), 'accepted');

  return { owner, member, outsider, group, defaultChannel };
}

describe('sendGroupMessage', () => {
  it('rechaza mandar un mensaje si no sos miembro del grupo', async () => {
    const { outsider, defaultChannel } = await setup();
    await expect(
      groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), outsider._id.toString(), { content: 'hola' }),
    ).rejects.toThrow('No formás parte de este grupo');
  });

  it('un miembro puede mandar y leer mensajes del canal', async () => {
    const { member, defaultChannel } = await setup();
    const { message } = await groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), member._id.toString(), { content: 'hola a todos' });
    expect(message.content).toBe('hola a todos');
    expect(message.sender).toBe(member._id.toString());

    const page = await groupMessagesService.getGroupMessages(defaultChannel._id.toString(), member._id.toString(), { limit: 50 });
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0].content).toBe('hola a todos');
  });

  it('después de que te saquen del grupo ya no podés mandar mensajes', async () => {
    const { owner, member, defaultChannel, group } = await setup();
    await groupsService.removeMember(group._id.toString(), owner._id.toString(), member._id.toString());

    await expect(
      groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), member._id.toString(), { content: 'ya no debería poder' }),
    ).rejects.toThrow('No formás parte de este grupo');
  });
});

describe('editGroupMessage / deleteGroupMessage', () => {
  it('rechaza que alguien que no es el autor edite o borre', async () => {
    const { owner, member, defaultChannel } = await setup();
    const { message } = await groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), member._id.toString(), { content: 'original' });

    await expect(groupMessagesService.editGroupMessage(message.id, owner._id.toString(), 'ajeno')).rejects.toThrow(
      'Solo podés editar tus propios mensajes',
    );
    await expect(groupMessagesService.deleteGroupMessage(message.id, owner._id.toString())).rejects.toThrow(
      'Solo podés eliminar tus propios mensajes',
    );
  });

  it('el autor puede editar y borrar su propio mensaje', async () => {
    const { member, defaultChannel } = await setup();
    const { message } = await groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), member._id.toString(), { content: 'original' });

    const { message: edited } = await groupMessagesService.editGroupMessage(message.id, member._id.toString(), 'corregido');
    expect(edited.content).toBe('corregido');
    expect(edited.editedAt).toBeTruthy();

    const { message: deleted } = await groupMessagesService.deleteGroupMessage(message.id, member._id.toString());
    expect(deleted.deleted).toBe(true);
    expect(deleted.content).toBe('');
  });
});

describe('historial al unirse a un grupo con mensajes previos', () => {
  it('un miembro nuevo no ve mensajes de antes de unirse, solo los posteriores', async () => {
    const owner = await createTestUser();
    const newcomer = await createTestUser();
    await makeFriends(owner._id.toString(), newcomer._id.toString());
    const { group, defaultChannel } = await groupsService.createGroup(owner._id.toString(), 'Grupo', []);

    await groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), owner._id.toString(), { content: 'mensaje viejo' });

    await groupsService.inviteMember(group._id.toString(), owner._id.toString(), newcomer._id.toString());
    const invite = await GroupInvite.findOne({ group: group._id, invitedUser: newcomer._id });
    await groupsService.respondGroupInvite(invite!._id.toString(), newcomer._id.toString(), 'accepted');

    await groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), owner._id.toString(), { content: 'mensaje nuevo' });

    const page = await groupMessagesService.getGroupMessages(defaultChannel._id.toString(), newcomer._id.toString(), { limit: 50 });
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0].content).toBe('mensaje nuevo');

    const ownerPage = await groupMessagesService.getGroupMessages(defaultChannel._id.toString(), owner._id.toString(), { limit: 50 });
    expect(ownerPage.messages).toHaveLength(2);
  });
});

describe('remitente de mensajes de quien ya no es miembro', () => {
  it('el historial sigue mostrando nombre y foto reales de alguien que salió del grupo', async () => {
    const { owner, member, defaultChannel, group } = await setup();
    await groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), member._id.toString(), { content: 'chau grupo' });

    await groupsService.removeMember(group._id.toString(), owner._id.toString(), member._id.toString());

    const page = await groupMessagesService.getGroupMessages(defaultChannel._id.toString(), owner._id.toString(), { limit: 50 });
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0].sender).toBe(member._id.toString());
    expect(page.messages[0].senderInfo.displayName).toBe(member.displayName);
    expect(page.messages[0].senderInfo.avatarUrl).toBe(member.avatarUrl);
  });
});

describe('mensajes de sistema al salir/expulsar de un grupo', () => {
  it('al salir, se genera un mensaje de sistema que ven los que quedan, con el nombre real de quien se fue', async () => {
    const { owner, member, defaultChannel, group } = await setup();

    const remainingGroup = await groupsService.leaveGroup(group._id.toString(), member._id.toString());
    const systemMessage = await groupMessagesService.createGroupSystemMessage(
      group._id.toString(),
      member._id.toString(),
      'member_left',
      remainingGroup.members.map((m) => m.user.toString()),
    );

    expect(systemMessage).not.toBeNull();
    expect(systemMessage!.message.type).toBe('system');
    expect(systemMessage!.message.systemEvent).toBe('member_left');
    expect(systemMessage!.message.senderInfo.displayName).toBe(member.displayName);
    expect(systemMessage!.message.channel).toBe(defaultChannel._id.toString());

    const page = await groupMessagesService.getGroupMessages(defaultChannel._id.toString(), owner._id.toString(), { limit: 50 });
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0].type).toBe('system');
    expect(page.messages[0].systemEvent).toBe('member_left');
  });

  it('al expulsar a alguien, se genera un mensaje de sistema distinto ("expulsado")', async () => {
    const { owner, member, defaultChannel, group } = await setup();

    const remainingGroup = await groupsService.removeMember(group._id.toString(), owner._id.toString(), member._id.toString());
    const systemMessage = await groupMessagesService.createGroupSystemMessage(
      group._id.toString(),
      member._id.toString(),
      'member_removed',
      remainingGroup.members.map((m) => m.user.toString()),
    );

    expect(systemMessage!.message.systemEvent).toBe('member_removed');

    const page = await groupMessagesService.getGroupMessages(defaultChannel._id.toString(), owner._id.toString(), { limit: 50 });
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0].systemEvent).toBe('member_removed');
  });
});

describe('contador de no leídos', () => {
  it('mandar un mensaje suma no leídos para el resto de los miembros, pero no para quien lo mandó', async () => {
    const { owner, member, defaultChannel, group } = await setup();
    await groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), member._id.toString(), { content: 'hola' });

    const ownerSummaries = await groupsService.listMyGroups(owner._id.toString());
    expect(ownerSummaries.find((g) => g.id === group._id.toString())?.unreadCount).toBe(1);

    const memberSummaries = await groupsService.listMyGroups(member._id.toString());
    expect(memberSummaries.find((g) => g.id === group._id.toString())?.unreadCount).toBe(0);

    const { channelUnreadCounts } = await groupsService.getGroupDetail(group._id.toString(), owner._id.toString());
    expect(channelUnreadCounts.get(defaultChannel._id.toString())).toBe(1);
  });

  it('marcar un canal como leído resetea el contador solo para quien lo marcó', async () => {
    const { owner, member, defaultChannel, group } = await setup();
    await groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), member._id.toString(), { content: 'hola' });

    await groupMessagesService.markChannelRead(defaultChannel._id.toString(), owner._id.toString());

    const ownerSummaries = await groupsService.listMyGroups(owner._id.toString());
    expect(ownerSummaries.find((g) => g.id === group._id.toString())?.unreadCount).toBe(0);

    // Un segundo mensaje en otro canal también cuenta para el total del grupo.
    const secondChannel = await groupsService.createChannel(group._id.toString(), owner._id.toString(), 'random');
    await groupMessagesService.sendGroupMessage(secondChannel._id.toString(), member._id.toString(), { content: 'otro mensaje' });

    const summariesAfter = await groupsService.listMyGroups(owner._id.toString());
    expect(summariesAfter.find((g) => g.id === group._id.toString())?.unreadCount).toBe(1);
  });
});
