import { describe, expect, it } from 'vitest';
import * as callRegistry from '../../src/sockets/callRegistry';

let counter = 0;
/** IDs únicos por test: el registro de llamadas es un singleton en memoria para todo el
 * proceso, así que sin esto los tests se pisarían entre sí (mismo userId/conversationId
 * "ya ocupado" de un test anterior). */
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

describe('llamadas DM: crear, aceptar, terminar', () => {
  it('crea una llamada ringing con el caller ya adentro', () => {
    const conversationId = uid('conv');
    const caller = uid('caller');
    const callee = uid('callee');

    const entry = callRegistry.createDmCall(conversationId, caller, 'socket-caller', callee);
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('ringing');
    expect(entry!.participants.has(caller)).toBe(true);
    expect(entry!.participants.has(callee)).toBe(false);
    expect(callRegistry.isUserBusy(caller)).toBe(true);
    // El callee todavía no "atendió": no debería contar como ocupado hasta aceptar.
    expect(callRegistry.isUserBusy(callee)).toBe(false);
  });

  it('devuelve null si ya hay una llamada activa en esa misma conversación', () => {
    const conversationId = uid('conv');
    const caller = uid('caller');
    const callee = uid('callee');
    callRegistry.createDmCall(conversationId, caller, 'socket-1', callee);

    // El callee intenta "llamar de vuelta" en la misma conversación mientras suena.
    const second = callRegistry.createDmCall(conversationId, callee, 'socket-2', caller);
    expect(second).toBeNull();
  });

  it('devuelve null si el caller ya está ocupado en otra llamada', () => {
    const caller = uid('caller');
    const calleeA = uid('calleeA');
    const calleeB = uid('calleeB');
    callRegistry.createDmCall(uid('conv'), caller, 'socket-1', calleeA);

    const second = callRegistry.createDmCall(uid('conv'), caller, 'socket-2', calleeB);
    expect(second).toBeNull();
  });

  it('devuelve null si el callee ya está en una llamada ACTIVA (aceptada) con otra persona', () => {
    const callee = uid('callee');
    const otherCaller = uid('otherCaller');
    const newCaller = uid('newCaller');
    const first = callRegistry.createDmCall(uid('conv'), otherCaller, 'socket-1', callee)!;
    callRegistry.acceptDmCall(first.id, callee, 'socket-callee');

    const second = callRegistry.createDmCall(uid('conv'), newCaller, 'socket-2', callee);
    expect(second).toBeNull();
  });

  it('un usuario puede recibir llamadas de dos personas distintas a la vez mientras ninguna contestó (no cuenta como "ocupado" todavía sonando)', () => {
    // No es un bug: mientras el callee no acepta ninguna, `isUserBusy` solo marca ocupado al
    // caller. Documenta el comportamiento real: si acepta una, la otra sigue "sonando" en el
    // registro hasta que el que llama la cancele o hasta el timeout de 60s (ring timeout),
    // no se cancela sola por haber contestado la otra.
    const callee = uid('callee');
    const callerA = uid('callerA');
    const callerB = uid('callerB');
    const entryA = callRegistry.createDmCall(uid('conv'), callerA, 'socket-a', callee);
    const entryB = callRegistry.createDmCall(uid('conv'), callerB, 'socket-b', callee);
    expect(entryA).not.toBeNull();
    expect(entryB).not.toBeNull();

    callRegistry.acceptDmCall(entryA!.id, callee, 'socket-callee');
    // entryB sigue viva en el registro, sonando, aunque el callee ya esté hablando con A.
    expect(callRegistry.getCall(entryB!.id)?.status).toBe('ringing');
  });

  it('acceptDmCall solo funciona para el callee esperado, y no dos veces', () => {
    const conversationId = uid('conv');
    const caller = uid('caller');
    const callee = uid('callee');
    const stranger = uid('stranger');
    const entry = callRegistry.createDmCall(conversationId, caller, 'socket-caller', callee)!;

    expect(callRegistry.acceptDmCall(entry.id, stranger, 'socket-x')).toBeNull();

    const accepted = callRegistry.acceptDmCall(entry.id, callee, 'socket-callee');
    expect(accepted).not.toBeNull();
    expect(accepted!.status).toBe('active');
    expect(callRegistry.isUserBusy(callee)).toBe(true);
    expect(accepted!.connectedAt).toBeTruthy();

    // Aceptarla de nuevo (doble click, reintento) ya no encuentra un estado "ringing".
    expect(callRegistry.acceptDmCall(entry.id, callee, 'socket-callee-2')).toBeNull();
  });

  it('endCall libera a ambos participantes y permite llamar de nuevo en esa conversación', () => {
    const conversationId = uid('conv');
    const caller = uid('caller');
    const callee = uid('callee');
    const entry = callRegistry.createDmCall(conversationId, caller, 'socket-caller', callee)!;
    callRegistry.acceptDmCall(entry.id, callee, 'socket-callee');

    const ended = callRegistry.endCall(entry.id, caller);
    expect(ended).not.toBeNull();
    expect(callRegistry.isUserBusy(caller)).toBe(false);
    expect(callRegistry.isUserBusy(callee)).toBe(false);
    expect(callRegistry.getCall(entry.id)).toBeUndefined();

    // La conversación quedó libre: se puede iniciar una llamada nueva ahí.
    const again = callRegistry.createDmCall(conversationId, caller, 'socket-caller-2', callee);
    expect(again).not.toBeNull();
  });

  it('endCall funciona con el callee que todavía está sonando (rechazo antes de aceptar)', () => {
    const conversationId = uid('conv');
    const caller = uid('caller');
    const callee = uid('callee');
    const entry = callRegistry.createDmCall(conversationId, caller, 'socket-caller', callee)!;

    const ended = callRegistry.endCall(entry.id, callee);
    expect(ended).not.toBeNull();
    expect(callRegistry.isUserBusy(caller)).toBe(false);
  });

  it('endCall devuelve null para alguien que no participa de esa llamada', () => {
    const entry = callRegistry.createDmCall(uid('conv'), uid('caller'), 'socket-1', uid('callee'))!;
    expect(callRegistry.endCall(entry.id, uid('stranger'))).toBeNull();
  });
});

describe('llamadas de grupo: unirse, salir, cupo', () => {
  it('el primer participante crea la llamada pero no marca connectedAt hasta que se suma alguien más', () => {
    const channelId = uid('channel');
    const groupId = uid('group');
    const first = uid('user');

    const result = callRegistry.joinGroupCall(channelId, groupId, first, 'socket-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.connectedAt).toBeUndefined();
    expect(result.entry.participants.size).toBe(1);

    const second = uid('user');
    const result2 = callRegistry.joinGroupCall(channelId, groupId, second, 'socket-2');
    expect(result2.ok).toBe(true);
    if (!result2.ok) return;
    expect(result2.entry.connectedAt).toBeTruthy();
    expect(result2.entry.participants.size).toBe(2);
  });

  it('reingresar con el mismo userId es idempotente (no duplica participante ni revienta)', () => {
    const channelId = uid('channel');
    const groupId = uid('group');
    const user = uid('user');
    callRegistry.joinGroupCall(channelId, groupId, user, 'socket-1');

    const result = callRegistry.joinGroupCall(channelId, groupId, user, 'socket-1-reconectado');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.participants.size).toBe(1);
    expect(result.entry.participants.get(user)?.socketId).toBe('socket-1-reconectado');
  });

  it('no deja unirse si el usuario ya está ocupado en otra llamada (DM o de grupo)', () => {
    const busyUser = uid('user');
    callRegistry.createDmCall(uid('conv'), busyUser, 'socket-dm', uid('otherparty'));

    const result = callRegistry.joinGroupCall(uid('channel'), uid('group'), busyUser, 'socket-group');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('busy');
  });

  it(`respeta el cupo máximo de ${callRegistry.MAX_GROUP_CALL_PARTICIPANTS} participantes`, () => {
    const channelId = uid('channel');
    const groupId = uid('group');

    for (let i = 0; i < callRegistry.MAX_GROUP_CALL_PARTICIPANTS; i++) {
      const result = callRegistry.joinGroupCall(channelId, groupId, uid('user'), `socket-${i}`);
      expect(result.ok).toBe(true);
    }

    const overflow = callRegistry.joinGroupCall(channelId, groupId, uid('user'), 'socket-overflow');
    expect(overflow.ok).toBe(false);
    if (overflow.ok) return;
    expect(overflow.reason).toBe('full');
  });

  it('salir libera el cupo para que otro pueda entrar', () => {
    const channelId = uid('channel');
    const groupId = uid('group');
    const participants: string[] = [];
    for (let i = 0; i < callRegistry.MAX_GROUP_CALL_PARTICIPANTS; i++) {
      const user = uid('user');
      participants.push(user);
      callRegistry.joinGroupCall(channelId, groupId, user, `socket-${i}`);
    }

    callRegistry.leaveGroupCall(channelId, participants[0]);
    const rejoin = callRegistry.joinGroupCall(channelId, groupId, uid('newuser'), 'socket-new');
    expect(rejoin.ok).toBe(true);
  });

  it('cuando el último participante se va, la llamada desaparece del registro', () => {
    const channelId = uid('channel');
    const groupId = uid('group');
    const user = uid('user');
    callRegistry.joinGroupCall(channelId, groupId, user, 'socket-1');

    const left = callRegistry.leaveGroupCall(channelId, user);
    expect(left).not.toBeNull();
    expect(left!.participants.size).toBe(0);
    expect(callRegistry.isUserBusy(user)).toBe(false);

    // El registro quedó libre: una llamada nueva en ese canal arranca de cero (sin connectedAt).
    const fresh = callRegistry.joinGroupCall(channelId, groupId, uid('user'), 'socket-2');
    expect(fresh.ok).toBe(true);
    if (fresh.ok) {
      expect(fresh.entry.connectedAt).toBeUndefined();
    }
  });

  it('leaveGroupCall devuelve null si el usuario no estaba en una llamada de ese canal', () => {
    expect(callRegistry.leaveGroupCall(uid('channel'), uid('user'))).toBeNull();
  });

  it('forceEndGroupCall corta la llamada entera y libera a todos, incluso con el cupo lleno', () => {
    const channelId = uid('channel');
    const groupId = uid('group');
    const participants: string[] = [];
    for (let i = 0; i < callRegistry.MAX_GROUP_CALL_PARTICIPANTS; i++) {
      const user = uid('user');
      participants.push(user);
      callRegistry.joinGroupCall(channelId, groupId, user, `socket-${i}`);
    }

    const ended = callRegistry.forceEndGroupCall(channelId);
    expect(ended).not.toBeNull();
    participants.forEach((p) => expect(callRegistry.isUserBusy(p)).toBe(false));
    expect(callRegistry.forceEndGroupCall(channelId)).toBeNull();
  });
});

describe('multi-pestaña: removeSocket solo afecta si es el socket registrado para esa llamada', () => {
  it('cerrar una pestaña que NO está en la llamada no la afecta', () => {
    const conversationId = uid('conv');
    const caller = uid('caller');
    const callee = uid('callee');
    const entry = callRegistry.createDmCall(conversationId, caller, 'socket-tab-1', callee)!;
    callRegistry.acceptDmCall(entry.id, callee, 'socket-callee');

    // El caller tiene otra pestaña abierta con un socket distinto; esa es la que se cierra.
    const affected = callRegistry.removeSocket(caller, 'socket-tab-2-sin-relacion');
    expect(affected).toHaveLength(0);
    expect(callRegistry.getCall(entry.id)).toBeDefined();
    expect(callRegistry.isUserBusy(caller)).toBe(true);
  });

  it('cerrar la pestaña que sí estaba en la llamada la termina (DM)', () => {
    const conversationId = uid('conv');
    const caller = uid('caller');
    const callee = uid('callee');
    const entry = callRegistry.createDmCall(conversationId, caller, 'socket-caller', callee)!;
    callRegistry.acceptDmCall(entry.id, callee, 'socket-callee');

    const affected = callRegistry.removeSocket(caller, 'socket-caller');
    expect(affected).toHaveLength(1);
    expect(callRegistry.getCall(entry.id)).toBeUndefined();
    expect(callRegistry.isUserBusy(callee)).toBe(false);
  });

  it('cerrar la pestaña que sí estaba en la llamada de grupo solo lo saca a él', () => {
    const channelId = uid('channel');
    const groupId = uid('group');
    const userA = uid('userA');
    const userB = uid('userB');
    callRegistry.joinGroupCall(channelId, groupId, userA, 'socket-a');
    callRegistry.joinGroupCall(channelId, groupId, userB, 'socket-b');

    const affected = callRegistry.removeSocket(userA, 'socket-a');
    expect(affected).toHaveLength(1);
    expect(callRegistry.isUserBusy(userA)).toBe(false);
    expect(callRegistry.isUserBusy(userB)).toBe(true);
    expect(callRegistry.getCall(affected[0].id)?.participants.size).toBe(1);
  });
});

describe('sincronización de llamadas de grupo activas por groupId', () => {
  it('getActiveGroupCallsForGroup solo devuelve las llamadas de ESE grupo', () => {
    const groupA = uid('groupA');
    const groupB = uid('groupB');
    callRegistry.joinGroupCall(uid('channel'), groupA, uid('user'), 'socket-1');
    callRegistry.joinGroupCall(uid('channel'), groupB, uid('user'), 'socket-2');

    const activeForA = callRegistry.getActiveGroupCallsForGroup(groupA);
    expect(activeForA).toHaveLength(1);
    expect(activeForA[0].groupId).toBe(groupA);
  });
});
