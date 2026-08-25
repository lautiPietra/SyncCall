import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  CallBusyPayload,
  CallErrorPayload,
  CallGroupJoinPayload,
  CallGroupStatePayload,
  CallIdPayload,
  CallInviteRelayPayload,
  CallLifecycleRelayPayload,
  CallSignalRelayPayload,
  PublicUser,
} from '@synccall/shared';
import { SOCKET_EVENTS } from '@synccall/shared';
import { useAuth } from './AuthProvider';
import { useNotificationPreferences } from './NotificationPreferencesProvider';
import { useSocketConnected } from './SocketProvider';
import { useToast } from './ToastProvider';
import { socket } from '../lib/socketClient';
import { ICE_SERVERS } from '../lib/webrtcConfig';
import { playCallEndSound, playRingtone } from '../lib/notificationSound';
import { showDesktopNotification } from '../lib/desktopNotifications';

type CallStatus = 'outgoing-ringing' | 'connecting' | 'active';
/** Si la pantalla completa de la llamada está visible o el usuario la minimizó para navegar por el resto de la app. */
type CallViewMode = 'full' | 'minimized';

interface CallParticipantState {
  stream: MediaStream | null;
}

interface ActiveCall {
  callId: string;
  kind: 'dm' | 'group';
  contextId: string;
  groupId?: string;
  status: CallStatus;
  remoteUserIds: string[];
  participants: Map<string, CallParticipantState>;
  localStream: MediaStream | null;
  /** Info de perfil de los participantes conocida al iniciar/unirse a la llamada (grupo: los miembros del canal en ese momento; DM: se resuelve en la UI vía useFriends). Permite mostrar avatar/nombre en la pantalla de llamada sin depender de un registro global de usuarios. */
  knownUsers: Map<string, PublicUser>;
  localMuted: boolean;
  startedAt: number | null;
}

interface IncomingCall {
  callId: string;
  conversationId: string;
  fromUserId: string;
}

interface GroupCallAmbient {
  callId: string;
  participantIds: string[];
}

type SignalData =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

interface CallContextValue {
  call: ActiveCall | null;
  incomingCall: IncomingCall | null;
  groupCallState: Map<string, GroupCallAmbient>;
  micError: string | null;
  callViewMode: CallViewMode;
  startDmCall: (conversationId: string, toUserId: string) => void;
  acceptIncomingCall: () => void;
  declineIncomingCall: () => void;
  cancelOutgoingCall: () => void;
  endCall: () => void;
  joinGroupCall: (channelId: string, knownUsers?: Map<string, PublicUser>) => void;
  leaveGroupCall: () => void;
  toggleMute: () => void;
  retryMic: () => void;
  minimizeCall: () => void;
  expandCall: () => void;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

const CLIENT_RING_TIMEOUT_MS = 45_000;

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { mutedAll, mutedFriendIds, desktopNotificationsEnabled } = useNotificationPreferences();
  const { showToast } = useToast();
  const socketConnected = useSocketConnected();

  const [call, setCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [groupCallState, setGroupCallState] = useState<Map<string, GroupCallAmbient>>(new Map());
  const [micError, setMicError] = useState<string | null>(null);
  const [callViewMode, setCallViewMode] = useState<CallViewMode>('full');

  const callRef = useRef<ActiveCall | null>(null);
  const incomingCallRef = useRef<IncomingCall | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const ringtoneStopRef = useRef<(() => void) | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDmTargetRef = useRef<{ conversationId: string; toUserId: string } | null>(null);
  const joiningGroupChannelRef = useRef<string | null>(null);
  const pendingGroupKnownUsersRef = useRef<Map<string, PublicUser> | null>(null);
  const micErrorRef = useRef<string | null>(null);
  /** Evita reintentar getUserMedia (y volver a mostrar el prompt de permiso) en cada peer nuevo dentro de la misma llamada una vez que ya falló — se vuelve a intentar solo con retryMic(). */
  const micUnavailableRef = useRef(false);

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  function clearRingTimeout(): void {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }

  function stopRingtone(): void {
    ringtoneStopRef.current?.();
    ringtoneStopRef.current = null;
  }

  /** Cierra todo lo que haya quedado abierto (peers, mic, ringtone, timers) y resetea el estado a "sin llamada". */
  function cleanupCall(): void {
    // Solo suena si la llamada había pasado de "sonando" (nadie atendió todavía): cortar un
    // intento que nunca se conectó no se siente como "colgar" una llamada de verdad.
    if (callRef.current && callRef.current.status !== 'outgoing-ringing') {
      playCallEndSound();
    }
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    pendingIceRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    stopRingtone();
    clearRingTimeout();
    pendingDmTargetRef.current = null;
    joiningGroupChannelRef.current = null;
    pendingGroupKnownUsersRef.current = null;
    micErrorRef.current = null;
    micUnavailableRef.current = false;
    setCall(null);
    setIncomingCall(null);
    setMicError(null);
    setCallViewMode('full');
  }

  /** Nunca aborta la llamada por esto: si no hay mic (permiso negado, sin hardware, etc.) se sigue en modo "solo escuchar" en vez de bloquear a todo el mundo. `micUnavailableRef` evita repetir el prompt de permiso por cada peer nuevo — para reintentar hace falta retryMic(). */
  async function ensureLocalStream(): Promise<MediaStream | null> {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    if (micUnavailableRef.current) {
      return null;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      micUnavailableRef.current = true;
      micErrorRef.current = 'Tu navegador no permite usar el micrófono. Vas a escuchar sin poder hablar.';
      setMicError(micErrorRef.current);
      showToast(micErrorRef.current, 'error');
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      return stream;
    } catch {
      micUnavailableRef.current = true;
      micErrorRef.current = 'No se pudo acceder al micrófono. Vas a escuchar sin poder hablar.';
      setMicError(micErrorRef.current);
      showToast(micErrorRef.current, 'error');
      return null;
    }
  }

  function flushPendingIce(peerId: string, pc: RTCPeerConnection): void {
    const queued = pendingIceRef.current.get(peerId);
    if (!queued) {
      return;
    }
    queued.forEach((candidate) => void pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {}));
    pendingIceRef.current.delete(peerId);
  }

  /** `localStream` puede ser null (sin mic disponible): igual se agrega un transceiver de audio en solo-recepción, para que la negociación incluya el audio del otro lado aunque yo no pueda hablar. */
  function createPeerConnection(peerId: string, callId: string, localStream: MediaStream | null): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      const data: SignalData = { type: 'ice-candidate', candidate: event.candidate.toJSON() };
      socket.emit(SOCKET_EVENTS.CALL_SIGNAL, { callId, toUserId: peerId, data });
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      setCall((prev) => {
        if (!prev) {
          return prev;
        }
        const next = new Map(prev.participants);
        next.set(peerId, { stream: stream ?? null });
        return { ...prev, participants: next, status: 'active' };
      });
    };

    peerConnectionsRef.current.set(peerId, pc);
    return pc;
  }

  /** Une el estado de peers al roster real (DM: [otro] una vez aceptada; grupo: cada CALL_GROUP_STATE): abre conexiones nuevas (ofrece quien tenga el userId menor) y cierra las que ya no corresponden. Sin mic disponible, sigue igual pero en modo solo-escucha (ver createPeerConnection). */
  async function reconcilePeers(callId: string, myUserId: string, remoteUserIds: string[]): Promise<void> {
    const stream = await ensureLocalStream();
    if (stream) {
      setCall((prev) => (prev && !prev.localStream ? { ...prev, localStream: stream } : prev));
    }

    peerConnectionsRef.current.forEach((pc, peerId) => {
      if (!remoteUserIds.includes(peerId)) {
        pc.close();
        peerConnectionsRef.current.delete(peerId);
        pendingIceRef.current.delete(peerId);
        setCall((prev) => {
          if (!prev) {
            return prev;
          }
          const next = new Map(prev.participants);
          next.delete(peerId);
          return { ...prev, participants: next };
        });
      }
    });

    for (const peerId of remoteUserIds) {
      if (peerConnectionsRef.current.has(peerId)) {
        continue;
      }
      const pc = createPeerConnection(peerId, callId, stream);
      if (myUserId < peerId) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const data: SignalData = { type: 'offer', sdp: offer };
        socket.emit(SOCKET_EVENTS.CALL_SIGNAL, { callId, toUserId: peerId, data });
      }
    }

    setCall((prev) => (prev ? { ...prev, remoteUserIds, status: prev.status === 'outgoing-ringing' ? 'connecting' : prev.status } : prev));
  }

  async function handleSignal(payload: CallSignalRelayPayload): Promise<void> {
    const data = payload.data as SignalData;
    const peerId = payload.fromUserId;

    if (data.type === 'offer') {
      const stream = await ensureLocalStream();
      if (stream) {
        setCall((prev) => (prev && !prev.localStream ? { ...prev, localStream: stream } : prev));
      }
      let pc = peerConnectionsRef.current.get(peerId);
      if (!pc) {
        pc = createPeerConnection(peerId, payload.callId, stream);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      flushPendingIce(peerId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const answerData: SignalData = { type: 'answer', sdp: answer };
      socket.emit(SOCKET_EVENTS.CALL_SIGNAL, { callId: payload.callId, toUserId: peerId, data: answerData });
    } else if (data.type === 'answer') {
      const pc = peerConnectionsRef.current.get(peerId);
      if (!pc) {
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      flushPendingIce(peerId, pc);
    } else if (data.type === 'ice-candidate') {
      const pc = peerConnectionsRef.current.get(peerId);
      if (!pc || !pc.remoteDescription) {
        const queued = pendingIceRef.current.get(peerId) ?? [];
        queued.push(data.candidate);
        pendingIceRef.current.set(peerId, queued);
        return;
      }
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
    }
  }

  useEffect(() => {
    if (!userId) {
      return;
    }
    const myUserId = userId;

    function onCallInvite(payload: CallInviteRelayPayload): void {
      if (payload.fromUserId === myUserId) {
        const target = pendingDmTargetRef.current;
        pendingDmTargetRef.current = null;
        setCall({
          callId: payload.callId,
          kind: 'dm',
          contextId: payload.conversationId,
          status: 'outgoing-ringing',
          remoteUserIds: target ? [target.toUserId] : [],
          participants: new Map(),
          localStream: null,
          knownUsers: new Map(),
          localMuted: false,
          startedAt: null,
        });
        clearRingTimeout();
        ringTimeoutRef.current = setTimeout(() => {
          if (callRef.current?.callId === payload.callId && callRef.current.status === 'outgoing-ringing') {
            socket.emit(SOCKET_EVENTS.CALL_CANCEL, { callId: payload.callId } satisfies CallIdPayload);
            cleanupCall();
            showToast('No contestó la llamada', 'info');
          }
        }, CLIENT_RING_TIMEOUT_MS);
        return;
      }

      setIncomingCall({ callId: payload.callId, conversationId: payload.conversationId, fromUserId: payload.fromUserId });
      if (!mutedAll && !mutedFriendIds.has(payload.fromUserId)) {
        ringtoneStopRef.current = playRingtone();
        if (desktopNotificationsEnabled) {
          showDesktopNotification('Llamada entrante', { body: 'Te está llamando', tag: payload.callId });
        }
      }
    }

    function onCallAccept(payload: CallLifecycleRelayPayload): void {
      if (callRef.current?.callId !== payload.callId) {
        return;
      }
      clearRingTimeout();
      void reconcilePeers(payload.callId, myUserId, callRef.current.remoteUserIds);
    }

    function makeTerminationHandler(toastMessage: string) {
      return (payload: CallLifecycleRelayPayload) => {
        const isMine = callRef.current?.callId === payload.callId || incomingCallRef.current?.callId === payload.callId;
        if (!isMine) {
          return;
        }
        cleanupCall();
        if (payload.byUserId !== myUserId) {
          showToast(toastMessage, 'info');
        }
      };
    }

    function onCallBusy(payload: CallBusyPayload): void {
      if (callRef.current?.contextId === payload.conversationId || pendingDmTargetRef.current?.conversationId === payload.conversationId) {
        cleanupCall();
        showToast('Esa persona ya está en otra llamada', 'error');
      }
    }

    function onCallErrorEvent(payload: CallErrorPayload): void {
      showToast(payload.message, 'error');
      if (!payload.callId || callRef.current?.callId === payload.callId || incomingCallRef.current?.callId === payload.callId) {
        cleanupCall();
      }
    }

    function onGroupCallState(payload: CallGroupStatePayload): void {
      setGroupCallState((prev) => {
        const next = new Map(prev);
        if (!payload.callId || payload.participants.length === 0) {
          next.delete(payload.channelId);
        } else {
          next.set(payload.channelId, { callId: payload.callId, participantIds: payload.participants.map((p) => p.userId) });
        }
        return next;
      });

      const amParticipant = payload.participants.some((p) => p.userId === myUserId);
      const isMyJoinConfirmation = joiningGroupChannelRef.current === payload.channelId && amParticipant;
      const isMyOngoingCall = callRef.current?.kind === 'group' && callRef.current.contextId === payload.channelId;

      if (!isMyJoinConfirmation && !isMyOngoingCall) {
        return;
      }

      if (isMyJoinConfirmation) {
        joiningGroupChannelRef.current = null;
        const knownUsers = pendingGroupKnownUsersRef.current ?? new Map();
        pendingGroupKnownUsersRef.current = null;
        setCall({
          callId: payload.callId!,
          kind: 'group',
          contextId: payload.channelId,
          groupId: payload.groupId,
          status: 'connecting',
          remoteUserIds: [],
          participants: new Map(),
          localStream: null,
          knownUsers,
          localMuted: false,
          startedAt: Date.now(),
        });
      }

      if (!amParticipant) {
        cleanupCall();
        return;
      }

      const remoteUserIds = payload.participants.map((p) => p.userId).filter((id) => id !== myUserId);
      void reconcilePeers(payload.callId!, myUserId, remoteUserIds);
    }

    function onCallSignal(payload: CallSignalRelayPayload): void {
      void handleSignal(payload);
    }

    socket.on(SOCKET_EVENTS.CALL_INVITE, onCallInvite);
    socket.on(SOCKET_EVENTS.CALL_ACCEPT, onCallAccept);
    socket.on(SOCKET_EVENTS.CALL_DECLINE, makeTerminationHandler('Rechazaron la llamada'));
    socket.on(SOCKET_EVENTS.CALL_CANCEL, makeTerminationHandler('Cancelaron la llamada'));
    socket.on(SOCKET_EVENTS.CALL_END, makeTerminationHandler('Se cortó la llamada'));
    socket.on(SOCKET_EVENTS.CALL_BUSY, onCallBusy);
    socket.on(SOCKET_EVENTS.CALL_ERROR, onCallErrorEvent);
    socket.on(SOCKET_EVENTS.CALL_GROUP_STATE, onGroupCallState);
    socket.on(SOCKET_EVENTS.CALL_SIGNAL, onCallSignal);

    return () => {
      socket.off(SOCKET_EVENTS.CALL_INVITE, onCallInvite);
      socket.off(SOCKET_EVENTS.CALL_ACCEPT, onCallAccept);
      socket.off(SOCKET_EVENTS.CALL_DECLINE);
      socket.off(SOCKET_EVENTS.CALL_CANCEL);
      socket.off(SOCKET_EVENTS.CALL_END);
      socket.off(SOCKET_EVENTS.CALL_BUSY, onCallBusy);
      socket.off(SOCKET_EVENTS.CALL_ERROR, onCallErrorEvent);
      socket.off(SOCKET_EVENTS.CALL_GROUP_STATE, onGroupCallState);
      socket.off(SOCKET_EVENTS.CALL_SIGNAL, onCallSignal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mutedAll, mutedFriendIds, desktopNotificationsEnabled, showToast]);

  // Si se corta el socket propio (red caída, server reiniciado) no tiene sentido seguir
  // mostrando una llamada que ya no puede recibir señalización: se corta del lado del cliente.
  useEffect(() => {
    if (!socketConnected) {
      cleanupCall();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketConnected]);

  useEffect(() => {
    return () => cleanupCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startDmCall(conversationId: string, toUserId: string): void {
    if (callRef.current || incomingCallRef.current) {
      showToast('Ya estás en una llamada', 'error');
      return;
    }
    pendingDmTargetRef.current = { conversationId, toUserId };
    socket.emit(SOCKET_EVENTS.CALL_INVITE, { conversationId });
  }

  function acceptIncomingCall(): void {
    const current = incomingCallRef.current;
    if (!current || !userId) {
      return;
    }
    stopRingtone();
    setIncomingCall(null);
    setCall({
      callId: current.callId,
      kind: 'dm',
      contextId: current.conversationId,
      status: 'connecting',
      remoteUserIds: [current.fromUserId],
      participants: new Map(),
      localStream: null,
      knownUsers: new Map(),
      localMuted: false,
      startedAt: Date.now(),
    });
    socket.emit(SOCKET_EVENTS.CALL_ACCEPT, { callId: current.callId } satisfies CallIdPayload);
    void reconcilePeers(current.callId, userId, [current.fromUserId]);
  }

  function declineIncomingCall(): void {
    const current = incomingCallRef.current;
    if (current) {
      socket.emit(SOCKET_EVENTS.CALL_DECLINE, { callId: current.callId } satisfies CallIdPayload);
    }
    cleanupCall();
  }

  function cancelOutgoingCall(): void {
    const current = callRef.current;
    if (current) {
      socket.emit(SOCKET_EVENTS.CALL_CANCEL, { callId: current.callId } satisfies CallIdPayload);
    }
    cleanupCall();
  }

  function hangUp(): void {
    const current = callRef.current;
    if (!current) {
      return;
    }
    if (current.kind === 'dm') {
      socket.emit(SOCKET_EVENTS.CALL_END, { callId: current.callId } satisfies CallIdPayload);
    } else {
      socket.emit(SOCKET_EVENTS.CALL_GROUP_LEAVE, { channelId: current.contextId });
    }
    cleanupCall();
  }

  function joinGroupCall(channelId: string, knownUsers?: Map<string, PublicUser>): void {
    if (callRef.current || incomingCallRef.current) {
      showToast('Ya estás en una llamada', 'error');
      return;
    }
    joiningGroupChannelRef.current = channelId;
    pendingGroupKnownUsersRef.current = knownUsers ?? null;
    socket.emit(SOCKET_EVENTS.CALL_GROUP_JOIN, { channelId } satisfies CallGroupJoinPayload);
  }

  function toggleMute(): void {
    setCall((prev) => {
      if (!prev) {
        return prev;
      }
      const nextMuted = !prev.localMuted;
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
      return { ...prev, localMuted: nextMuted };
    });
  }

  /** Reintenta conseguir el micrófono en medio de una llamada que arrancó en modo solo-escucha (permiso denegado la primera vez, o recién se conectó un mic). Si funciona, agrega el track a cada peer ya conectado y renegocia (nuevo offer) para que empiecen a recibir audio de este lado. */
  async function retryMic(): Promise<void> {
    const current = callRef.current;
    if (!current || !userId) {
      return;
    }
    micUnavailableRef.current = false;
    micErrorRef.current = null;
    setMicError(null);
    const stream = await ensureLocalStream();
    if (!stream) {
      return;
    }
    setCall((prev) => (prev ? { ...prev, localStream: stream } : prev));

    for (const [peerId, pc] of peerConnectionsRef.current) {
      if (pc.getSenders().some((sender) => sender.track)) {
        continue;
      }
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const data: SignalData = { type: 'offer', sdp: offer };
      socket.emit(SOCKET_EVENTS.CALL_SIGNAL, { callId: current.callId, toUserId: peerId, data });
    }
  }

  function minimizeCall(): void {
    if (callRef.current) {
      setCallViewMode('minimized');
    }
  }

  function expandCall(): void {
    setCallViewMode('full');
  }

  const value: CallContextValue = {
    call,
    incomingCall,
    groupCallState,
    micError,
    callViewMode,
    startDmCall,
    acceptIncomingCall,
    declineIncomingCall,
    cancelOutgoingCall,
    endCall: hangUp,
    joinGroupCall,
    leaveGroupCall: hangUp,
    toggleMute,
    retryMic,
    minimizeCall,
    expandCall,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error('useCall debe usarse dentro de <CallProvider>');
  }
  return ctx;
}
