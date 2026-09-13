import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { Dialog } from './Dialog';
import { FormAlert } from './FormAlert';
import { inputClasses } from './fieldStyles';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  /** When set, the person must type this exact text before the action enables. */
  typeToConfirm?: { text: string; label: string };
  onConfirm: () => Promise<void> | void;
}

/** Destructive confirmation. With typeToConfirm it guards tree and account deletion. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  pendingLabel,
  variant = 'danger',
  typeToConfirm,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMismatch, setShowMismatch] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setTyped('');
      setError(null);
      setShowMismatch(false);
    }
  }, [open]);

  const matches = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.text.trim().toLowerCase();

  const confirm = async () => {
    if (!matches) {
      setShowMismatch(true);
      inputRef.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That didn’t work. Please try again.');
      requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={variant} pending={pending} pendingLabel={pendingLabel} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-base">
        <FormAlert message={error} alertRef={alertRef} />
        {children}
        {typeToConfirm ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="font-semibold">
              {typeToConfirm.label}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setTyped(event.target.value);
                setShowMismatch(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void confirm();
                }
              }}
              aria-invalid={showMismatch || undefined}
              aria-describedby={showMismatch ? `${inputId}-error` : undefined}
              className={inputClasses(showMismatch)}
            />
            {showMismatch ? (
              <p id={`${inputId}-error`} role="alert" className="text-sm font-semibold text-danger">
                Type “{typeToConfirm.text}” exactly to confirm.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
