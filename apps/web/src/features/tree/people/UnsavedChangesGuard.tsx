import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

interface UnsavedChangesGuardProps {
  when: boolean;
  /** Set true right before navigating away on purpose (after saving). */
  bypassRef?: { current: boolean };
}

/**
 * Asks before leaving a form with unsaved changes (SPEC §5.4): in-app navigation gets a dialog,
 * closing or reloading the tab gets the browser's own prompt.
 */
export function UnsavedChangesGuard({ when, bypassRef }: UnsavedChangesGuardProps) {
  const whenRef = useRef(when);
  whenRef.current = when;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => whenRef.current && !bypassRef?.current && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset();
      }}
      title="Leave without saving?"
      confirmLabel="Discard changes"
      onConfirm={() => {
        if (blocker.state === 'blocked') blocker.proceed();
      }}
    >
      <p>You have changes on this form that haven’t been saved. If you leave now, they’ll be lost.</p>
    </ConfirmDialog>
  );
}
