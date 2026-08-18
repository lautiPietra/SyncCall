import { Navigate, useParams } from 'react-router-dom';
import { useGroups } from '../../../app/GroupsProvider';
import { Spinner } from '../../../components/ui/Spinner';

/** /groups/:groupId sin canal explícito -> redirige a su canal por defecto (#general). */
export function GroupRedirect() {
  const { groupId } = useParams<{ groupId: string }>();
  const { groups, loading } = useGroups();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const group = groups.find((g) => g.id === groupId);
  if (!group) {
    return <Navigate to="/" replace />;
  }

  return <Navigate to={`/groups/${group.id}/channels/${group.defaultChannelId}`} replace />;
}
