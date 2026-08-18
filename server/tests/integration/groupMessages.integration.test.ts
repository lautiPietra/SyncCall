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
      groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), outsider._id.toString(), 'hola'),
    ).rejects.toThrow('No formás parte de este grupo');
  });

  it('un miembro puede mandar y leer mensajes del canal', async () => {
    const { member, defaultChannel } = await setup();
    const { message } = await groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), member._id.toString(), 'hola a todos');
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
      groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), member._id.toString(), 'ya no debería poder'),
    ).rejects.toThrow('No formás parte de este grupo');
  });
});

describe('editGroupMessage / deleteGroupMessage', () => {
  it('rechaza que alguien que no es el autor edite o borre', async () => {
    const { owner, member, defaultChannel } = await setup();
    const { message } = await groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), member._id.toString(), 'original');

    await expect(groupMessagesService.editGroupMessage(message.id, owner._id.toString(), 'ajeno')).rejects.toThrow(
      'Solo podés editar tus propios mensajes',
    );
    await expect(groupMessagesService.deleteGroupMessage(message.id, owner._id.toString())).rejects.toThrow(
      'Solo podés eliminar tus propios mensajes',
    );
  });

  it('el autor puede editar y borrar su propio mensaje', async () => {
    const { member, defaultChannel } = await setup();
    const { message } = await groupMessagesService.sendGroupMessage(defaultChannel._id.toString(), member._id.toString(), 'original');

    const { message: edited } = await groupMessagesService.editGroupMessage(message.id, member._id.toString(), 'corregido');
    expect(edited.content).toBe('corregido');
    expect(edited.editedAt).toBeTruthy();

    const { message: deleted } = await groupMessagesService.deleteGroupMessage(message.id, member._id.toString());
    expect(deleted.deleted).toBe(true);
    expect(deleted.content).toBe('');
  });
});
