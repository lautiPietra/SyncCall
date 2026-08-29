import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
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
    const { group, defaultChannel, defaultVoiceChannel } = await groupsService.createGroup(owner._id.toString(), 'Grupo', [
      member._id.toString(),
    ]);
    await acceptInvite(group._id.toString(), member._id.toString());
    return { owner, member, outsider, group, defaultChannel, defaultVoiceChannel };
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
    await expect(groupsService.createChannel(group._id.toString(), memberId, 'random', 'text')).rejects.toThrow();
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

    const channel = await groupsService.createChannel(group._id.toString(), owner._id.toString(), 'random', 'text');
    expect(channel.name).toBe('random');

    await groupsService.deleteChannel(group._id.toString(), channel._id.toString(), owner._id.toString());
    // Quedan los 2 canales por defecto (texto + voz) que se crean junto con el grupo.
    const remaining = await Channel.countDocuments({ group: group._id });
    expect(remaining).toBe(2);
  });

  it('el dueño puede crear y borrar canales de voz, y aparecen unidos por nombre entre tipos', async () => {
    const { owner, group, defaultVoiceChannel } = await setup();

    // "general" ya existe como canal de voz por defecto, pero un canal de TEXTO con el mismo
    // nombre no debería chocar (son namespaces separados por tipo).
    const textChannel = await groupsService.createChannel(group._id.toString(), owner._id.toString(), 'general-2', 'text');
    expect(textChannel.type).toBe('text');

    const voiceChannel = await groupsService.createChannel(group._id.toString(), owner._id.toString(), 'random-voz', 'voice');
    expect(voiceChannel.type).toBe('voice');

    // A diferencia de los canales de texto, no hay problema en quedarse sin ningún canal de voz.
    await groupsService.deleteChannel(group._id.toString(), defaultVoiceChannel._id.toString(), owner._id.toString());
    await groupsService.deleteChannel(group._id.toString(), voiceChannel._id.toString(), owner._id.toString());
    const remainingVoice = await Channel.countDocuments({ group: group._id, type: 'voice' });
    expect(remainingVoice).toBe(0);
  });

  it('el dueño puede renombrar un canal, pero no a un nombre ya usado', async () => {
    const { owner, group, defaultChannel } = await setup();
    const channel = await groupsService.createChannel(group._id.toString(), owner._id.toString(), 'random', 'text');

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

  it('no se puede borrar el único canal de texto del grupo', async () => {
    const { owner, group, defaultChannel } = await setup();
    await expect(
      groupsService.deleteChannel(group._id.toString(), defaultChannel._id.toString(), owner._id.toString()),
    ).rejects.toThrow('No podés eliminar el único canal de texto del grupo');
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

describe('capacidad: límite de 50 miembros', () => {
  async function makeGroupWithMemberCount(count: number) {
    const owner = await createTestUser();
    const members: { user: unknown; role: string }[] = [{ user: owner._id, role: 'owner' }];
    for (let i = 0; i < count - 1; i++) {
      const u = await createTestUser({ username: `capmember${i}` });
      members.push({ user: u._id, role: 'member' });
    }
    const group = await Group.create({ name: 'Capacidad', owner: owner._id, members });
    return { owner, group };
  }

  it('rechaza invitar una vez que el grupo (miembros + pendientes) llega a 50', async () => {
    const { owner, group } = await makeGroupWithMemberCount(50);
    const friend = await createTestUser();
    await makeFriends(owner._id.toString(), friend._id.toString());

    await expect(groupsService.inviteMember(group._id.toString(), owner._id.toString(), friend._id.toString())).rejects.toThrow(
      `Los grupos tienen un máximo de 50 miembros`,
    );
  });

  it('rechaza aceptar una invitación si el grupo se llenó mientras estaba pendiente', async () => {
    const { owner, group } = await makeGroupWithMemberCount(49);
    const friend = await createTestUser();
    await makeFriends(owner._id.toString(), friend._id.toString());
    await groupsService.inviteMember(group._id.toString(), owner._id.toString(), friend._id.toString());

    // El grupo se llena por otra vía (ya no hay lugar) antes de que el invitado responda.
    await Group.updateOne({ _id: group._id }, { $push: { members: { user: new Types.ObjectId(), role: 'member' } } });

    const invite = await GroupInvite.findOne({ group: group._id, invitedUser: friend._id });
    await expect(groupsService.respondGroupInvite(invite!._id.toString(), friend._id.toString(), 'accepted')).rejects.toThrow(
      'El grupo ya está lleno',
    );
  });

  it('condición de carrera: varias aceptaciones simultáneas en un grupo casi lleno nunca superan el cupo', async () => {
    const { owner, group } = await makeGroupWithMemberCount(49);
    // Se crean las invitaciones directo (no vía inviteMember): en la vida real pudieron haberse
    // mandado en momentos distintos, cuando todavía había lugar de sobra; lo que se quiere
    // probar acá es qué pasa si más de una se ACEPTA a la vez ya con el grupo casi lleno.
    const invitees = await Promise.all(Array.from({ length: 8 }, (_, i) => createTestUser({ username: `raceinv${i}` })));
    await GroupInvite.insertMany(
      invitees.map((inv) => ({ group: group._id, invitedUser: inv._id, invitedBy: owner._id })),
    );
    const invites = await GroupInvite.find({ group: group._id });

    const results = await Promise.allSettled(
      invites.map((inv) => groupsService.respondGroupInvite(inv._id.toString(), inv.invitedUser.toString(), 'accepted')),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    expect(fulfilled).toBe(1);
    const refreshed = await Group.findById(group._id).lean();
    expect(refreshed?.members).toHaveLength(50);
  });

  it('condición de carrera: invitar a la misma persona dos veces a la vez no revienta con un 500', async () => {
    const owner = await createTestUser();
    const friend = await createTestUser();
    await makeFriends(owner._id.toString(), friend._id.toString());
    const { group } = await groupsService.createGroup(owner._id.toString(), 'Grupo', []);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => groupsService.inviteMember(group._id.toString(), owner._id.toString(), friend._id.toString())),
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected.every((r) => r.reason.message === 'Ya tiene una invitación pendiente a este grupo')).toBe(true);
  });

  it('condición de carrera: sacar a varios miembros distintos a la vez no pierde ninguna baja', async () => {
    const { owner, group } = await makeGroupWithMemberCount(7);
    const before = await Group.findById(group._id).lean();
    const targets = before!.members.filter((m) => m.user.toString() !== owner._id.toString()).slice(0, 4);

    const results = await Promise.allSettled(
      targets.map((m) => groupsService.removeMember(group._id.toString(), owner._id.toString(), m.user.toString())),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const after = await Group.findById(group._id).lean();
    expect(after?.members).toHaveLength(3);
    for (const t of targets) {
      expect(after?.members.some((m) => m.user.toString() === t.user.toString())).toBe(false);
    }
  });
});

describe('capacidad: grupo con muchos miembros y detalle', () => {
  it('lista el detalle de un grupo con 50 miembros correctamente y rápido', async () => {
    const owner = await createTestUser();
    const members: { user: unknown; role: string }[] = [{ user: owner._id, role: 'owner' }];
    for (let i = 0; i < 49; i++) {
      const u = await createTestUser({ username: `bigmember${i}` });
      members.push({ user: u._id, role: 'member' });
    }
    const group = await Group.create({ name: 'Grupo grande', owner: owner._id, members });
    await Channel.create({ group: group._id, name: 'general', type: 'text' });

    const start = Date.now();
    const detail = await groupsService.getGroupDetail(group._id.toString(), owner._id.toString());
    const elapsedMs = Date.now() - start;

    expect(detail.members).toHaveLength(50);
    expect(elapsedMs).toBeLessThan(5000);
  });
});
