import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, className = '', ...rest }: InputProps) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-text-description">{label}</span>}
      <input
        id={id}
        className={`rounded-lg border border-surface-border bg-card px-3 py-2 text-sm text-white outline-none placeholder:text-text-disabled focus:border-primary ${className}`}
        {...rest}
      />
      {error && <span className="text-xs text-status-dnd">{error}</span>}
    </label>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, id, className = '', ...rest }: TextareaProps) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-text-description">{label}</span>}
      <textarea
        id={id}
        className={`resize-none rounded-lg border border-surface-border bg-card px-3 py-2 text-sm text-white outline-none placeholder:text-text-disabled focus:border-primary ${className}`}
        {...rest}
      />
      {error && <span className="text-xs text-status-dnd">{error}</span>}
    </label>
  );
}
