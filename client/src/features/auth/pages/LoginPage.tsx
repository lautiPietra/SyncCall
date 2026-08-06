import { Navigate } from 'react-router-dom';
import { useAuth } from '../../../app/AuthProvider';
import { SyncCallMark } from '../../../components/ui/SyncCallMark';
import { OAuthButtons } from '../components/OAuthButtons';

const FEATURES = [
  { icon: '⚡', label: 'Mensajería en tiempo real' },
  { icon: '🟢', label: 'Estados de presencia en vivo' },
  { icon: '🔒', label: 'Sesiones seguras con OAuth' },
];

export function LoginPage() {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#232C4D] via-bg-secondary to-bg px-4 py-10">
      <div className="relative flex w-full max-w-sm flex-col items-center gap-8 rounded-2xl border border-surface-border/60 bg-card/60 p-8 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-full bg-primary/25 blur-2xl" />
            <SyncCallMark size={90} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              Sync
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Call
              </span>
            </h1>
            <p className="mt-1 text-sm text-text-description">Conectá con tus amigos en tiempo real</p>
          </div>
        </div>

        <OAuthButtons />

        <div className="flex w-full flex-col gap-2 border-t border-surface-border/60 pt-5">
          {FEATURES.map((feature) => (
            <div key={feature.label} className="flex items-center gap-2.5 text-sm text-text-description">
              <span className="text-base leading-none">{feature.icon}</span>
              {feature.label}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
