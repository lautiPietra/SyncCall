export type CallKind = 'dm' | 'group';

export type CallSignalType = 'offer' | 'answer' | 'ice-candidate';

export interface CallParticipantInfo {
  userId: string;
}
