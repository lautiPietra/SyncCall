import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { AvatarFrameId, NameplateId, User, UserStatus } from '@synccall/shared';
import { AVATAR_FRAME_IDS, NAMEPLATE_IDS } from '@synccall/shared';
import { AVATAR_FRAME_LABELS, FramedAvatar } from '../../../components/ui/AvatarFrame';
import { Button } from '../../../components/ui/Button';
import { Input, Textarea } from '../../../components/ui/Input';
import { NAMEPLATE_LABELS, NameplatePreview } from '../../../components/ui/Nameplate';
import { STATUS_LABELS, StatusDot } from '../../../components/ui/StatusDot';
import { useFriends } from '../../../app/FriendsProvider';
import { useProfile } from '../hooks/useProfile';

const STATUSES: UserStatus[] = ['online', 'idle', 'dnd', 'invisible'];

const MEMBER_SINCE_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function ProfilePage() {
  const { user, saving, uploadingAvatar, uploadingBanner, error, save, changeAvatar, changeBanner } =
    useProfile();
  const { friends } = useFriends();

  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarFrame, setAvatarFrame] = useState<AvatarFrameId>(user?.avatarFrame ?? 'none');
  const [nameplate, setNameplate] = useState<NameplateId>(user?.nameplate ?? 'none');
  const [status, setStatus] = useState<UserStatus>(user?.status ?? 'online');
  const [savedMessage, setSavedMessage] = useState(false);

  // Si el perfil cambia por fuera de este formulario (otra pestaña, otro dispositivo, o el
  // eco del propio guardado) hay que traer esos valores acá, pero solo campo por campo y
  // solo si no los tocaste vos: si estabas escribiendo algo distinto, no te lo pisamos.
  const lastSyncedRef = useRef<User | null>(user);
  useEffect(() => {
    if (!user) {
      return;
    }
    const prev = lastSyncedRef.current;
    setUsername((current) => (current === (prev?.username ?? '') ? user.username : current));
    setDisplayName((current) => (current === (prev?.displayName ?? '') ? user.displayName : current));
    setBio((current) => (current === (prev?.bio ?? '') ? (user.bio ?? '') : current));
    setAvatarFrame((current) => (current === (prev?.avatarFrame ?? 'none') ? user.avatarFrame : current));
    setNameplate((current) => (current === (prev?.nameplate ?? 'none') ? user.nameplate : current));
    setStatus((current) => (current === (prev?.status ?? 'online') ? user.status : current));
    lastSyncedRef.current = user;
  }, [user]);

  if (!user) {
    return null;
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSavedMessage(false);
    const ok = await save({ username, displayName, bio, avatarFrame, nameplate, status });
    if (ok) {
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2500);
    }
  }

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) {
      void changeAvatar(file);
    }
    e.target.value = '';
  }

  function handleBannerChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) {
      void changeBanner(file);
    }
    e.target.value = '';
  }

  return (
    <div className="px-4 py-10">
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/30">
            <UserGearIcon />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Mi perfil</h1>
            <p className="text-xs text-text-description">Gestioná tu cuenta y preferencias</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-surface-border/60 bg-card shadow-lg shadow-black/20">
          <div className="relative h-32">
            {user.bannerUrl ? (
              <img
                src={user.bannerUrl}
                alt="Banner del perfil"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-r from-primary via-secondary to-primary-light" />
            )}

            <label
              className={`absolute right-3 top-3 flex cursor-pointer items-center gap-1.5 rounded-full border border-white/25 bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/55 ${
                uploadingBanner ? 'pointer-events-none opacity-70' : ''
              }`}
            >
              <CameraIcon />
              {uploadingBanner ? 'Subiendo...' : 'Cambiar banner'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleBannerChange}
                disabled={uploadingBanner}
              />
            </label>
          </div>
          <div className="flex flex-col items-center gap-3 p-6 pt-0">
            <div className="-mt-12 rounded-full border-4 border-card shadow-lg">
              <FramedAvatar frame={avatarFrame} src={user.avatarUrl} alt={user.displayName} size={92} status={status} />
            </div>
            <div className="text-center">
              <p className="font-semibold text-white">{displayName || user.displayName}</p>
              <p className="text-sm text-text-description">@{username || user.username}</p>
              <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-text-disabled">
                <CalendarIcon />
                Miembro desde {MEMBER_SINCE_FORMATTER.format(new Date(user.createdAt))}
              </p>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-text-disabled">
                <FriendsGroupIcon />
                {friends.length} {friends.length === 1 ? 'amigo' : 'amigos'}
              </p>
            </div>
            <label
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 ${
                uploadingAvatar ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              <CameraIcon />
              {uploadingAvatar ? 'Subiendo...' : 'Cambiar avatar'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
                disabled={uploadingAvatar}
              />
            </label>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl bg-card p-6">
          <Input
            label="Nombre de usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
          />
          <Input
            label="Nombre visible"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
          />
          <Textarea
            label="Biografía"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={190}
            rows={3}
          />

          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-description">
              <FrameIcon />
              Elegir marco
            </span>
            <div className="flex flex-wrap gap-3">
              {AVATAR_FRAME_IDS.map((frameId) => (
                <button
                  key={frameId}
                  type="button"
                  onClick={() => setAvatarFrame(frameId)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg p-2 transition-colors ${
                    avatarFrame === frameId ? 'bg-primary/10 ring-1 ring-primary/50' : 'hover:bg-surface-hover'
                  }`}
                  aria-label={AVATAR_FRAME_LABELS[frameId]}
                >
                  <FramedAvatar frame={frameId} src={user.avatarUrl} alt="" size={40} />
                  <span
                    className={`text-[11px] ${avatarFrame === frameId ? 'text-white' : 'text-text-description'}`}
                  >
                    {AVATAR_FRAME_LABELS[frameId]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-description">
              <PlateIcon />
              Elegir placa
            </span>
            <p className="text-xs text-text-disabled">
              Se muestra detrás de tu nombre en Mensajes Directos (el tuyo y el de tus amigos que la tengan) — no aparece en la lista de Amigos.
            </p>
            <div className="flex flex-wrap gap-3">
              {NAMEPLATE_IDS.map((plateId) => (
                <button
                  key={plateId}
                  type="button"
                  onClick={() => setNameplate(plateId)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg p-2 transition-colors ${
                    nameplate === plateId ? 'bg-primary/10 ring-1 ring-primary/50' : 'hover:bg-surface-hover'
                  }`}
                  aria-label={NAMEPLATE_LABELS[plateId]}
                >
                  <NameplatePreview nameplate={plateId} />
                  <span
                    className={`text-[11px] ${nameplate === plateId ? 'text-white' : 'text-text-description'}`}
                  >
                    {NAMEPLATE_LABELS[plateId]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-description">
              <StatusDot status={status} size={10} />
              Estado
            </span>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    status === s
                      ? 'border-primary bg-primary/10 text-white'
                      : 'border-surface-border text-text-description hover:border-surface-hover'
                  }`}
                >
                  <StatusDot status={s} />
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-status-dnd">{error}</p>}
          {savedMessage && <p className="text-sm text-status-online">Perfil actualizado</p>}

          <Button type="submit" loading={saving} className="self-start">
            {!saving && <CheckIcon />}
            Guardar cambios
          </Button>
        </form>
      </div>
    </div>
  );
}

function UserGearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="8" r="3.5" />
      <path d="M4.5 19.5a5.5 5.5 0 0 1 8.7-4.47" />
      <circle cx="18" cy="17.5" r="2.5" />
      <path d="M18 13.8v.9M18 20.3v.9M14.8 17.5h.9M20.3 17.5h.9M15.4 14.9l.65.65M19.95 19.45l.65.65M20.6 14.9l-.65.65M16.05 19.45l-.65.65" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function PlateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M2.5 14.5h19" opacity="0.5" />
    </svg>
  );
}

function FrameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="9" strokeDasharray="2.5 3.5" opacity="0.5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function FriendsGroupIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7" />
      <path d="M15 13.2c2.9.4 5 2.1 5 6.8" />
    </svg>
  );
}
