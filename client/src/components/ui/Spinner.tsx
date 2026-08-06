interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 24 }: SpinnerProps) {
  return (
    <div
      className="animate-spin rounded-full border-2 border-surface-border border-t-primary"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Cargando"
    />
  );
}
