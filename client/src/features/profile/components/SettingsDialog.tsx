import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/AuthProvider';
import { useAudioDevicePreferences } from '../../../app/AudioDevicePreferencesProvider';
import { useFriends } from '../../../app/FriendsProvider';
import { useNotificationPreferences } from '../../../app/NotificationPreferencesProvider';
import { ApiClientError } from '../../../lib/apiClient';
import { applyAccentColor } from '../../../lib/accentColor';
import { isAudioOutputSelectionSupported } from '../../../lib/audioOutput';
import { isDesktopNotificationSupported } from '../../../lib/desktopNotifications';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Toggle } from '../../../components/ui/Toggle';
import { GitHubIcon, GoogleIcon } from '../../auth/components/OAuthButtons';
import { updateProfile } from '../api/profile.api';

type Category = 'account' | 'appearance' | 'audio' | 'notifications' | 'privacy';

const MEMBER_SINCE_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const CATEGORIES: { id: Category; label: string; icon: () => ReactNode }[] = [
  { id: 'account', label: 'Cuenta', icon: UserIcon },
  { id: 'appearance', label: 'Apariencia', icon: PaletteIcon },
  { id: 'audio', label: 'Audio', icon: HeadphonesIcon },
  { id: 'notifications', label: 'Notificaciones', icon: BellIcon },
  { id: 'privacy', label: 'Privacidad', icon: LockIcon },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { user, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState<Category>('account');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmUsername, setConfirmUsername] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeToClose(onClose);

  if (!user) {
    return null;
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount(confirmUsername.trim());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo eliminar la cuenta');
      setDeleting(false);
    }
  }

  function goToProfile(): void {
    onClose();
    navigate('/profile');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-surface-border/60 bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        aria-label="Configuración"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border/60 px-5 py-3.5">
          <h2 className="text-base font-semibold text-white">Configuración</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar configuración"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-description transition-colors hover:bg-surface-hover hover:text-white"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-surface-border/60 bg-sidebar p-3 sm:w-52">
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <SettingsNavButton key={id} active={category === id} onClick={() => setCategory(id)} icon={<Icon />}>
                {label}
              </SettingsNavButton>
            ))}
          </nav>

          <div className="no-scrollbar flex-1 overflow-y-auto p-6">
            {category === 'account' && (
              <div className="flex flex-col gap-5">
                <SettingsCard>
                  <div className="flex items-center gap-4 p-5">
                    <FramedAvatar frame={user.avatarFrame} src={user.avatarUrl} alt={user.displayName} size={58} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{user.displayName}</p>
                      <p className="truncate text-xs text-text-description">@{user.username}</p>
                      <p className="mt-0.5 text-[11px] text-text-disabled">
                        Miembro desde {MEMBER_SINCE_FORMATTER.format(new Date(user.createdAt))}
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={goToProfile} className="shrink-0">
                      Editar perfil
                    </Button>
                  </div>
                  <SettingRow
                    title="Método de acceso"
                    control={
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-bg/60 py-1 pl-1.5 pr-3 text-xs font-medium text-white">
                        {user.provider === 'google' ? <GoogleIcon /> : <GitHubIcon />}
                        {user.provider === 'google' ? 'Google' : 'GitHub'}
                      </span>
                    }
                  />
                </SettingsCard>

                <div className="rounded-xl border border-status-dnd/30 p-5">
                  <p className="mb-1 text-sm font-semibold text-status-dnd">Zona de peligro</p>
                  <p className="mb-3 text-xs leading-relaxed text-text-description">
                    Al eliminar tu cuenta salís de todos tus grupos (los que sos dueño se eliminan del todo), dejás
                    de ser amigo de tus contactos, y no vas a poder volver a iniciar sesión. Los mensajes que ya
                    mandaste quedan en las conversaciones, pero se muestran a nombre de "Usuario eliminado".
                  </p>

                  {!confirmingDelete ? (
                    <Button variant="danger" size="sm" onClick={() => setConfirmingDelete(true)}>
                      Eliminar cuenta
                    </Button>
                  ) : (
                    <div className="flex flex-col gap-3 rounded-lg bg-bg/60 p-3.5">
                      <p className="text-xs text-text-description">
                        Escribí <span className="font-semibold text-white">{user.username}</span> para confirmar.
                        Esta acción no se puede deshacer.
                      </p>
                      <Input
                        value={confirmUsername}
                        onChange={(e) => setConfirmUsername(e.target.value)}
                        placeholder={user.username}
                        autoFocus
                        disabled={deleting}
                      />
                      {error && <p className="text-xs text-status-dnd">{error}</p>}
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setConfirmingDelete(false);
                            setConfirmUsername('');
                            setError(null);
                          }}
                          disabled={deleting}
                          size="sm"
                        >
                          Cancelar
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => void handleDelete()}
                          loading={deleting}
                          disabled={confirmUsername !== user.username}
                          size="sm"
                        >
                          Eliminar mi cuenta para siempre
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {category === 'appearance' && <AppearanceSettings onGoToProfile={goToProfile} />}
            {category === 'audio' && <AudioSettings />}
            {category === 'notifications' && <NotificationSettings />}
            {category === 'privacy' && <PrivacySettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

const ACCENT_PRESETS = ['#5B6DFF', '#7A5AF8', '#22C55E', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];

function AppearanceSettings({ onGoToProfile }: { onGoToProfile: () => void }) {
  const { user, setUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  async function pickColor(hex: string): Promise<void> {
    if (!user || hex.toLowerCase() === user.accentColor.toLowerCase() || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    applyAccentColor(hex);
    try {
      const { user: updated } = await updateProfile({ accentColor: hex });
      setUser(updated);
    } catch (err) {
      applyAccentColor(user.accentColor);
      setError(err instanceof ApiClientError ? err.message : 'No se pudo guardar el color');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <div className="p-5">
          <p className="text-sm font-medium text-white">Color de acento</p>
          <p className="mt-0.5 text-xs text-text-description">Define el color de botones, links y resaltados en toda la app.</p>
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            {ACCENT_PRESETS.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => void pickColor(hex)}
                aria-label={`Usar color ${hex}`}
                disabled={saving}
                style={{ backgroundColor: hex }}
                className={`h-9 w-9 shrink-0 rounded-full transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-60 ${
                  user.accentColor.toLowerCase() === hex.toLowerCase() ? 'ring-2 ring-white ring-offset-2 ring-offset-card' : ''
                }`}
              />
            ))}
            <label
              className={`relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-surface-border text-text-description transition-colors hover:border-white hover:text-white ${
                saving ? 'pointer-events-none opacity-60' : ''
              }`}
              title="Elegir otro color"
            >
              <PaletteIcon />
              <input
                type="color"
                value={user.accentColor}
                onChange={(e) => void pickColor(e.target.value)}
                disabled={saving}
                aria-label="Elegir un color de acento personalizado"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
          {error && <p className="mt-2.5 text-xs text-status-dnd">{error}</p>}
        </div>
        <SettingRow
          title="Avatar, marco y placa"
          description="Se editan desde tu perfil."
          control={
            <Button variant="secondary" size="sm" onClick={onGoToProfile} className="shrink-0">
              Ir a mi perfil
            </Button>
          }
        />
      </SettingsCard>
    </div>
  );
}

function AudioSettings() {
  const { inputDeviceId, outputDeviceId, setInputDeviceId, setOutputDeviceId } = useAudioDevicePreferences();
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const outputSupported = isAudioOutputSelectionSupported();

  useEffect(() => {
    let cancelled = false;

    async function loadDevices(): Promise<void> {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
        if (!cancelled) {
          setError('Tu navegador no permite elegir dispositivos de audio.');
          setLoading(false);
        }
        return;
      }
      try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        const labelsHidden = devices.some((d) => d.kind === 'audioinput' && !d.label);
        if (labelsHidden && navigator.mediaDevices.getUserMedia) {
          // Los nombres de los dispositivos solo se ven una vez que se dio permiso de mic al
          // menos una vez: se pide brevemente solo para desbloquearlos, no para usarlo.
          try {
            const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
            probe.getTracks().forEach((track) => track.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
          } catch {
            // Sin permiso los dispositivos igual se listan, solo que sin nombre.
          }
        }
        if (cancelled) {
          return;
        }
        setInputs(devices.filter((d) => d.kind === 'audioinput'));
        setOutputs(devices.filter((d) => d.kind === 'audiooutput'));
      } catch {
        if (!cancelled) {
          setError('No se pudieron listar los dispositivos de audio.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDevices();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="p-5 text-sm text-text-description">Buscando dispositivos de audio...</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <div className="p-5">
          <p className="text-sm font-medium text-white">Micrófono</p>
          <p className="mt-0.5 text-xs text-text-description">El que se usa para hablar en las llamadas.</p>
          <select
            value={inputDeviceId ?? ''}
            onChange={(e) => setInputDeviceId(e.target.value || null)}
            className="mt-3 w-full rounded-lg border border-surface-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-primary"
          >
            <option value="">Predeterminado del sistema</option>
            {inputs.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Micrófono ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="p-5">
          <p className="text-sm font-medium text-white">Auriculares / parlantes</p>
          <p className="mt-0.5 text-xs text-text-description">Por dónde se escucha a los demás en las llamadas.</p>
          {outputSupported ? (
            <select
              value={outputDeviceId ?? ''}
              onChange={(e) => setOutputDeviceId(e.target.value || null)}
              className="mt-3 w-full rounded-lg border border-surface-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-primary"
            >
              <option value="">Predeterminado del sistema</option>
              {outputs.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Salida ${i + 1}`}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-3 text-xs text-text-disabled">Tu navegador no permite elegir la salida de audio (probá con Chrome o Edge).</p>
          )}
        </div>
      </SettingsCard>

      {error && <p className="text-xs text-status-dnd">{error}</p>}
    </div>
  );
}

function NotificationSettings() {
  const { mutedAll, setMutedAll, mutedFriendIds, setFriendMuted, desktopNotificationsEnabled, setDesktopNotificationsEnabled } =
    useNotificationPreferences();
  const { friends } = useFriends();
  const [togglingDesktop, setTogglingDesktop] = useState(false);
  const [desktopBlocked, setDesktopBlocked] = useState(false);

  const mutedFriends = friends.filter((f) => mutedFriendIds.has(f.user.id));
  const desktopSupported = isDesktopNotificationSupported();

  async function handleToggleDesktop(next: boolean): Promise<void> {
    setTogglingDesktop(true);
    setDesktopBlocked(false);
    const finalValue = await setDesktopNotificationsEnabled(next);
    setDesktopBlocked(next && !finalValue);
    setTogglingDesktop(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <SettingRow
          title="Silenciar todo"
          description="No suena nada al recibir mensajes nuevos, en ningún chat ni grupo."
          control={<Toggle checked={mutedAll} onChange={setMutedAll} ariaLabel="Silenciar todas las notificaciones" />}
        />
        <div>
          <SettingRow
            title="Notificaciones de escritorio"
            description="Un aviso del sistema operativo cuando llega un mensaje y no tenés la pestaña abierta."
            control={
              <Toggle
                checked={desktopNotificationsEnabled}
                onChange={(next) => void handleToggleDesktop(next)}
                disabled={togglingDesktop || !desktopSupported}
                ariaLabel="Notificaciones de escritorio"
              />
            }
          />
          {!desktopSupported && (
            <p className="px-5 pb-4 text-xs text-text-disabled">Tu navegador no soporta notificaciones de escritorio.</p>
          )}
          {desktopBlocked && (
            <p className="px-5 pb-4 text-xs text-status-dnd">
              El navegador bloqueó el permiso. Habilitalo desde la configuración del sitio y volvé a intentar.
            </p>
          )}
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="p-5">
          <p className="text-sm font-medium text-white">Amigos silenciados</p>
          <p className="mt-0.5 text-xs text-text-description">No te avisa cuando te escriben, aunque no esté silenciado todo.</p>
          {mutedFriends.length === 0 ? (
            <p className="mt-2 text-xs text-text-disabled">No silenciaste a ningún amigo.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-0.5">
              {mutedFriends.map(({ friendshipId, user }) => (
                <div key={friendshipId} className="flex items-center gap-2.5 rounded-md py-1">
                  <FramedAvatar frame={user.avatarFrame} src={user.avatarUrl} alt={user.displayName} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-description">{user.displayName}</span>
                  <button
                    type="button"
                    onClick={() => setFriendMuted(user.id, false)}
                    className="shrink-0 text-xs text-primary transition-colors hover:underline"
                  >
                    Activar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}

function PrivacySettings() {
  const { user, setUser } = useAuth();
  const [saving, setSaving] = useState<'friendRequests' | 'search' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  async function updateSetting(key: 'allowFriendRequests' | 'visibleInSearch', value: boolean): Promise<void> {
    setSaving(key === 'allowFriendRequests' ? 'friendRequests' : 'search');
    setError(null);
    try {
      const { user: updated } = await updateProfile({ [key]: value });
      setUser(updated);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo guardar el cambio');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <SettingRow
          title="Solicitudes de amistad"
          description="Si lo apagás, nadie va a poder mandarte una solicitud de amistad nueva."
          control={
            <Toggle
              checked={user.allowFriendRequests}
              onChange={(next) => void updateSetting('allowFriendRequests', next)}
              disabled={saving === 'friendRequests'}
              ariaLabel="Permitir solicitudes de amistad"
            />
          }
        />
        <SettingRow
          title="Aparecer en búsquedas"
          description="Si lo apagás, no vas a salir cuando alguien busque tu usuario para agregarte."
          control={
            <Toggle
              checked={user.visibleInSearch}
              onChange={(next) => void updateSetting('visibleInSearch', next)}
              disabled={saving === 'search'}
              ariaLabel="Aparecer en la búsqueda de usuarios"
            />
          }
        />
      </SettingsCard>

      {error && <p className="text-xs text-status-dnd">{error}</p>}

      <p className="flex items-start gap-2 rounded-lg bg-bg/40 p-4 text-xs leading-relaxed text-text-description">
        <InfoIcon />
        Solo tus amigos te pueden escribir, y el primer mensaje de cada uno queda pendiente hasta que lo aceptás
        desde "Solicitudes de mensajes". Esto ya funciona así siempre, no hace falta configurarlo.
      </p>
    </div>
  );
}

function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-surface-border/50 rounded-xl border border-surface-border/60">{children}</div>;
}

function SettingRow({ title, description, control }: { title: string; description?: string; control: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        {description && <p className="mt-0.5 text-xs text-text-description">{description}</p>}
      </div>
      {control}
    </div>
  );
}

function SettingsNavButton({
  active = false,
  onClick,
  icon,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  icon: ReactNode;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${
        active ? 'bg-surface-hover text-white' : 'text-text-description hover:bg-surface-hover/60 hover:text-white'
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M12 22a10 10 0 1 1 10-10c0 2.21-1.79 4-4 4h-1.5a1.5 1.5 0 0 0-1.06 2.56c.4.4.56.98.56 1.44 0 1.1-.9 2-2 2Z" />
      <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function HeadphonesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 15.5a2.5 2.5 0 0 1-2.5 2.5H17v-6h1.5A2.5 2.5 0 0 1 21 14.5Z" />
      <path d="M3 15.5A2.5 2.5 0 0 0 5.5 18H7v-6H5.5A2.5 2.5 0 0 0 3 14.5Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}
