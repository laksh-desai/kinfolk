import type { Ref } from 'react';
import { Icon } from './Icon';

interface FormAlertProps {
  message: string | null;
  alertRef?: Ref<HTMLDivElement>;
}

/** A form-level failure (not tied to one field). Receives focus so it's never missed. */
export function FormAlert({ message, alertRef }: FormAlertProps) {
  if (!message) return null;
  return (
    <div
      ref={alertRef}
      tabIndex={-1}
      className="flex items-start gap-2 rounded-control border border-danger/40 bg-danger-soft px-4 py-3 text-base text-danger"
    >
      <Icon name="alert" className="mt-0.5 size-5" />
      <p className="font-semibold">{message}</p>
    </div>
  );
}
