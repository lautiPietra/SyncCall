import { useNavigate } from 'react-router-dom';
import { FramedAvatar } from '../../../components/ui/AvatarFrame';
import { Spinner } from '../../../components/ui/Spinner';
import { useMessageRequests } from '../../../app/MessageRequestsProvider';

const TIME_FORMATTER = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function MessageRequestsPage() {
  const { requests, loading, error, respondingIds, accept, decline } = useMessageRequests();
  const navigate = useNavigate();

  return (
    <div className="px-4 py-8 lg:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-1 border-b border-surface-border/60 pb-4">
        <h1 className="text-xl font-semibold text-white">Solicitudes de mensajes</h1>
        <p className="text-sm text-text-description">
          Cuando un amigo nuevo te escribe por primera vez, el mensaje aparece acá hasta que decidís si querés recibirlo.
        </p>
      </div>

      {error && <p className="mx-auto mt-4 max-w-2xl text-sm text-status-dnd">{error}</p>}

      <div className="mx-auto mt-4 max-w-2xl">
        {loading ? (
          <div className="flex justify-center py-14">
            <Spinner size={28} />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-base font-medium text-white">No tenés solicitudes pendientes</p>
            <p className="text-sm text-text-description">Los mensajes de gente que te escriba por primera vez van a aparecer acá.</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-surface-border/40">
            {requests.map((req) => {
              const isResponding = respondingIds.has(req.conversationId);
              return (
                <div key={req.conversationId} className="flex items-center gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/chat/${req.user.id}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <FramedAvatar frame={req.user.avatarFrame} src={req.user.avatarUrl} alt={req.user.displayName} size={44} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{req.user.displayName}</p>
                      <p className="truncate text-xs text-text-description">
                        {req.lastMessage
                          ? req.lastMessage.type === 'image'
                            ? '📷 Imagen'
                            : req.lastMessage.type === 'audio'
                              ? '🎤 Mensaje de voz'
                              : req.lastMessage.content
                          : 'Te quiere mandar un mensaje'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-text-disabled">
                      {TIME_FORMATTER.format(new Date(req.createdAt))}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {isResponding && <Spinner size={16} />}
                    <button
                      type="button"
                      onClick={() => void accept(req.conversationId)}
                      disabled={isResponding}
                      className="rounded-full bg-status-online/15 px-3.5 py-1.5 text-xs font-medium text-status-online transition-colors hover:bg-status-online/25 disabled:opacity-50"
                    >
                      Aceptar
                    </button>
                    <button
                      type="button"
                      onClick={() => void decline(req.conversationId)}
                      disabled={isResponding}
                      className="rounded-full bg-status-dnd/15 px-3.5 py-1.5 text-xs font-medium text-status-dnd transition-colors hover:bg-status-dnd/25 disabled:opacity-50"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
