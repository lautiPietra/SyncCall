import { describe, expect, it } from 'vitest';
import { User } from '../../src/features/users/users.model';
import { Friendship } from '../../src/features/friends/friendship.model';
import { Channel, Group } from '../../src/features/groups/groups.model';
import { GroupInvite } from '../../src/features/groups/groupInvites.model';
import * as groupsService from '../../src/features/groups/groups.service';

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

/** Simula lo que hace el usuario invitado al aceptar: busca su invitación pendiente a ese grupo y la responde. */
async function acceptInvite(groupId: string, userId: string): Promise<void> {
  const invite = await GroupInvite.findOne({ group: groupId, invitedUser: userId });
  if (!invite) {
    throw new Error('No hay invitación pendiente para aceptar');
  }
  await groupsService.respondGroupInvite(invite._id.toString(), userId, 'accepted');
}

describe('createGroup', () => {
  it('rechaza agregar a alguien que no es amigo', async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();

    await expect(groupsService.createGroup(owner._id.toString(), 'Mi grupo', [stranger._id.toString()])).rejects.toThrow(
      'Solo podés agregar amigos al grupo',
    );
  });

  it('crea el grupo con #general como canal por defecto y solo al dueño como miembro (el resto queda invitado)', async () => {
    const owner = await createTestUser();
    const friend = await createTestUser();
    await makeFriends(owner._id.toString(), friend._id.toString());

    const { group, defaultChannel, invites } = await groupsService.createGroup(owner._id.toString(), 'Mi grupo', [
      friend._id.toString(),
    ]);
    expect(defaultChannel.name).toBe('general');
    expect(group.members).toHaveLength(1);
    expect(invites).toHaveLength(1);
    expect(invites[0].invitedUser.toString()).toBe(friend._id.toString());

    const summaries = await groupsService.listMyGroups(owner._id.toString());
    expect(summaries).toHaveLength(1);
    expect(summaries[0].defaultChannelId).toBe(defaultChannel._id.toString());
    expect(summaries[0].memberCount).toBe(1);

    // El invitado todavía no lo ve entre sus grupos hasta que acepte.
    expect(await groupsService.listMyGroups(friend._id.toString())).toHaveLength(0);

    const myInvites = await groupsService.listMyGroupInvites(friend._id.toString());
    expect(myInvites).toHaveLength(1);
    expect(myInvites[0].groupId).toBe(group._id.toString());
  });

  it('al aceptar la invitación, la persona pasa a ser miembro real del grupo', async () => {
    const owner = await createTestUser();
    const friend = await createTestUser();
    await makeFriends(owner._id.toString(), friend._id.toString());
    const { group } = await groupsService.createGroup(owner._id.toString(), 'Mi grupo', [friend._id.toString()]);

    await acceptInvite(group._id.toString(), friend._id.toString());

    const refreshed = await Group.findById(group._id);
    expect(refreshed?.members).toHaveLength(2);
    expect(await groupsService.listMyGroups(friend._id.toString())).toHaveLength(1);
    expect(await groupsService.listMyGroupInvites(friend._id.toString())).toHaveLength(0);
  });

  it('al rechazar la invitación, la persona no se agrega al grupo', async () => {
    const owner = await createTestUser();
    const friend = await createTestUser();
    await makeFriends(owner._id.toString(), friend._id.toString());
    const { group } = await groupsService.createGroup(owner._id.toString(), 'Mi grupo', [friend._id.toString()]);

    const invite = await GroupInvite.findOne({ group: group._id, invitedUser: friend._id });
    await groupsService.respondGroupInvite(invite!._id.toString(), friend._id.toString(), 'declined');

    const refreshed = await Group.findById(group._id);
    expect(refreshed?.members).toHaveLength(1);
    expect(await groupsService.listMyGroupInvites(friend._id.toString())).toHaveLength(0);
  });
});

describe('administración del grupo (solo el dueño)', () => {
  async function setup() {
    const owner = await createTestUser();
    const member = await createTestUser();
    const outsider = await createTestUser();
    await makeFriends(owner._id.toString(), member._id.toString());
    const { group, defaultChannel } = await groupsService.createGroup(owner._id.toString(), 'Grupo', [member._id.toString()]);
    await acceptInvite(group._id.toString(), member._id.toString());
    return { owner, member, outsider, group, defaultChannel };
  }

  it('un no-dueño no puede actualizar el grupo', async () => {
    const { member, group } = await setup();
    await expect(groupsService.updateGroup(group._id.toString(), member._id.toString(), { name: 'Nuevo nombre' })).rejects.toThrow(
      'Solo el dueño o un administrador del grupo puede hacer esto',
    );
  });

  it('un no-dueño no puede borrar el grupo, crear/borrar canales ni invitar/sacar miembros', async () => {
    const { member, outsider, group, defaultChannel } = await setup();
    const memberId = member._id.toString();

    await expect(groupsService.deleteGroup(group._id.toString(), memberId)).rejects.toThrow();
    await expect(groupsService.createChannel(group._id.toString(), memberId, 'random')).rejects.toThrow();
    await expect(groupsService.deleteChannel(group._id.toString(), defaultChannel._id.toString(), memberId)).rejects.toThrow();
    await expect(groupsService.inviteMember(group._id.toString(), memberId, outsider._id.toString())).rejects.toThrow();
    await expect(groupsService.removeMember(group._id.toString(), memberId, outsider._id.toString())).rejects.toThrow();
  });

  it('el dueño puede renombrar, cambiar descripción, y crear/borrar canales', async () => {
    const { owner, group } = await setup();
    const updated = await groupsService.updateGroup(group._id.toString(), owner._id.toString(), {
      name: 'Renombrado',
      description: 'Una descripción',
    });
    expect(updated.name).toBe('Renombrado');
    expect(updated.description).toBe('Una descripción');

    const channel = await groupsService.createChannel(group._id.toString(), owner._id.toString(), 'random');
    expect(channel.name).toBe('random');

    await groupsService.deleteChannel(group._id.toString(), channel._id.toString(), owner._id.toString());
    const remaining = await Channel.countDocuments({ group: group._id });
    expect(remaining).toBe(1);
  });

  it('el dueño puede renombrar un canal, pero no a un nombre ya usado', async () => {
    const { owner, group, defaultChannel } = await setup();
    const channel = await groupsService.createChannel(group._id.toString(), owner._id.toString(), 'random');

    const renamed = await groupsService.renameChannel(group._id.toString(), channel._id.toString(), owner._id.toString(), 'renombrado');
    expect(renamed.name).toBe('renombrado');

    await expect(
      groupsService.renameChannel(group._id.toString(), channel._id.toString(), owner._id.toString(), 'general'),
    ).rejects.toThrow('Ya existe un canal con ese nombre');
    // Case-insensitive: 'GENERAL' también choca con el #general existente (defaultChannel).
    await expect(
      groupsService.renameChannel(group._id.toString(), defaultChannel._id.toString(), owner._id.toString(), 'renombrado'),
    ).rejects.toThrow('Ya existe un canal con ese nombre');
  });

  it('un no-dueño no puede renombrar un canal', async () => {
    const { member, group, defaultChannel } = await setup();
    await expect(
      groupsService.renameChannel(group._id.toString(), defaultChannel._id.toString(), member._id.toString(), 'nuevo-nombre'),
    ).rejects.toThrow('Solo el dueño o un administrador del grupo puede hacer esto');
  });

  it('no se puede borrar el único canal del grupo', async () => {
    const { owner, group, defaultChannel } = await setup();
    await expect(
      groupsService.deleteChannel(group._id.toString(), defaultChannel._id.toString(), owner._id.toString()),
    ).rejects.toThrow('No podés eliminar el único canal del grupo');
  });

  it('el dueño puede cancelar una invitación pendiente', async () => {
    const owner = await createTestUser();
    const friend = await createTestUser();
    const invitee = await createTestUser();
    await makeFriends(owner._id.toString(), friend._id.toString());
    await makeFriends(owner._id.toString(), invitee._id.toString());
    const { group } = await groupsService.createGroup(owner._id.toString(), 'Grupo', [friend._id.toString()]);
    await groupsService.inviteMember(group._id.toString(), owner._id.toString(), invitee._id.toString());

    let pending = await groupsService.listPendingInvitesForGroup(group._id.toString(), owner._id.toString());
    expect(pending).toHaveLength(2);

    await groupsService.cancelGroupInvite(group._id.toString(), owner._id.toString(), invitee._id.toString());

    pending = await groupsService.listPendingInvitesForGroup(group._id.toString(), owner._id.toString());
    expect(pending).toHaveLength(1);
    expect(await groupsService.listMyGroupInvites(invitee._id.toString())).toHaveLength(0);
  });
});

describe('membresía', () => {
  it('el dueño no puede sacarse a sí mismo vía removeMember, ni abandonar el grupo vía leaveGroup', async () => {
    const owner = await createTestUser();
    const friend = await createTestUser();
    await makeFriends(owner._id.toString(), friend._id.toString());
    const { group } = await groupsService.createGroup(owner._id.toString(), 'Grupo', [friend._id.toString()]);

    await expect(groupsService.removeMember(group._id.toString(), owner._id.toString(), owner._id.toString())).rejects.toThrow(
      'No se puede sacar al dueño del grupo',
    );
    await expect(groupsService.leaveGroup(group._id.toString(), owner._id.toString())).rejects.toThrow(
      'El dueño no puede abandonar el grupo',
    );
  });

  it('un miembro puede salir del grupo voluntariamente', async () => {
    const owner = await createTestUser();
    const friend = await createTestUser();
    await makeFriends(owner._id.toString(), friend._id.toString());
    const { group } = await groupsService.createGroup(owner._id.toString(), 'Grupo', [friend._id.toString()]);
    await acceptInvite(group._id.toString(), friend._id.toString());

    await groupsService.leaveGroup(group._id.toString(), friend._id.toString());
    const refreshed = await Group.findById(group._id);
    expect(refreshed?.members).toHaveLength(1);
  });
});

describe('rol de administrador', () => {
  async function setup() {
    const owner = await createTestUser();
    const admin = await createTestUser();
    const member = await createTestUser();
    const outsider = await createTestUser();
    await makeFriends(owner._id.toString(), admin._id.toString());
    await makeFriends(owner._id.toString(), member._id.toString());
    await makeFriends(owner._id.toString(), outsider._id.toString());
    const { group, defaultChannel } = await groupsService.createGroup(owner._id.toString(), 'Grupo', [
      admin._id.toString(),
      member._id.toString(),
    ]);
    await acceptInvite(group._id.toString(), admin._id.toString());
    await acceptInvite(group._id.toString(), member._id.toString());
    await groupsService.setMemberRole(group._id.toString(), owner._id.toString(), admin._id.toString(), 'admin');
    return { owner, admin, member, outsider, group, defaultChannel };
  }

  it('solo el dueño puede ascender/descender administradores', async () => {
    const { owner, admin, member, group } = await setup();

    await expect(groupsService.setMemberRole(group._id.toString(), admin._id.toString(), member._id.toString(), 'admin')).rejects.toThrow(
      'Solo el dueño del grupo puede hacer esto',
    );
    await expect(groupsService.setMemberRole(group._id.toString(), owner._id.toString(), owner._id.toString(), 'admin')).rejects.toThrow(
      'El dueño ya administra el grupo',
    );

    const demoted = await groupsService.setMemberRole(group._id.toString(), owner._id.toString(), admin._id.toString(), 'member');
    expect(demoted.role).toBe('member');
  });

  it('un admin puede editar el grupo, crear/borrar canales, invitar y sacar a un miembro normal', async () => {
    const { admin, member, outsider, group, defaultChannel } = await setup();
    const adminId = admin._id.toString();
    await makeFriends(adminId, outsider._id.toString());

    const updated = await groupsService.updateGroup(group._id.toString(), adminId, { name: 'Editado por admin' });
    expect(updated.name).toBe('Editado por admin');

    const channel = await groupsService.createChannel(group._id.toString(), adminId, 'moderacion');
    await groupsService.deleteChannel(group._id.toString(), channel._id.toString(), adminId);

    await groupsService.inviteMember(group._id.toString(), adminId, outsider._id.toString());
    await acceptInvite(group._id.toString(), outsider._id.toString());

    await groupsService.removeMember(group._id.toString(), adminId, member._id.toString());
    const refreshed = await Group.findById(group._id);
    expect(refreshed?.members.some((m) => m.user.toString() === member._id.toString())).toBe(false);
    // defaultChannel sigue existiendo (no se puede borrar el único canal): confirma que el borrado de arriba fue el nuevo, no #general.
    expect(await Channel.exists({ _id: defaultChannel._id })).toBeTruthy();
  });

  it('un admin no puede sacar a otro admin ni borrar el grupo', async () => {
    const { admin, group } = await setup();
    const secondOwnerFriend = await createTestUser();
    await makeFriends((await User.findById(group.owner))!._id.toString(), secondOwnerFriend._id.toString());
    await groupsService.inviteMember(group._id.toString(), group.owner.toString(), secondOwnerFriend._id.toString());
    await acceptInvite(group._id.toString(), secondOwnerFriend._id.toString());
    await groupsService.setMemberRole(group._id.toString(), group.owner.toString(), secondOwnerFriend._id.toString(), 'admin');

    await expect(
      groupsService.removeMember(group._id.toString(), admin._id.toString(), secondOwnerFriend._id.toString()),
    ).rejects.toThrow('Solo el dueño puede sacar a un administrador');
    await expect(groupsService.deleteGroup(group._id.toString(), admin._id.toString())).rejects.toThrow(
      'Solo el dueño del grupo puede hacer esto',
    );
  });
});
