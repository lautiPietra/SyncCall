import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { GroupInvitePreview } from '@synccall/shared';
import { useGroups } from '../../../app/GroupsProvider';
import { Avatar } from '../../../components/ui/Avatar';
import { SyncCallMark } from '../../../components/ui/SyncCallMark';
import { CreateGroupDialog } from './CreateGroupDialog';
import { GroupInviteDialog } from './GroupInviteDialog';

/** Rail angosto siempre visible a la izquierda de todo (estilo lista de servidores de Discord): acceso rápido a Mensajes Directos y a cada grupo, separado del resto de la navegación. */
export function GroupIconRail() {
  const { groups, invites } = useGroups();
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [respondingInvite, setRespondingInvite] = useState<GroupInvitePreview | null>(null);

  return (
    <aside className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-surface-border/60 bg-navbar py-3">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all duration-150 hover:rounded-xl ${
            isActive ? 'rounded-xl bg-primary' : 'bg-card hover:bg-primary'
          }`
        }
        aria-label="Mensajes directos"
        title="Mensajes directos"
      >
        <SyncCallMark size={28} />
      </NavLink>

      {(invites.length > 0 || groups.length > 0) && <div className="h-0.5 w-8 shrink-0 rounded-full bg-surface-border/60" />}

      {invites.map((invite) => (
        <button
          key={invite.id}
          type="button"
          onClick={() => setRespondingInvite(invite)}
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-primary/70 transition-all duration-150 hover:rounded-xl hover:border-primary"
          aria-label={`Invitación pendiente a ${invite.groupName}`}
          title={`Invitación de ${invite.invitedBy.displayName} a "${invite.groupName}"`}
        >
          <Avatar src={invite.groupPhotoUrl ?? ''} alt={invite.groupName} size={40} />
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-status-dnd text-[10px] font-bold text-white">
            !
          </span>
        </button>
      ))}

      {groups.map((group) => (
        <NavLink
          key={group.id}
          to={`/groups/${group.id}/channels/${group.defaultChannelId}`}
          className={({ isActive }) =>
            `flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl transition-all duration-150 hover:rounded-xl ${
              isActive ? 'rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-navbar' : ''
            }`
          }
          aria-label={group.name}
          title={group.name}
        >
          <Avatar src={group.photoUrl ?? ''} alt={group.name} size={48} />
        </NavLink>
      ))}

      <button
        type="button"
        onClick={() => setCreatingGroup(true)}
        aria-label="Crear grupo"
        title="Crear grupo"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card text-primary transition-all duration-150 hover:rounded-xl hover:bg-primary hover:text-white"
      >
        <PlusIcon />
      </button>

      {creatingGroup && <CreateGroupDialog onClose={() => setCreatingGroup(false)} />}
      {respondingInvite && <GroupInviteDialog invite={respondingInvite} onClose={() => setRespondingInvite(null)} />}
    </aside>
  );
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
