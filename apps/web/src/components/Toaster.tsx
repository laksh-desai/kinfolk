import * as Toast from '@radix-ui/react-toast';
import { cx } from '../lib/cx';
import { useToasts } from '../lib/toast';
import { Icon } from './Icon';

const TONES = {
  neutral: 'border-line',
  success: 'border-success/50',
  error: 'border-danger/60',
};

export function Toaster() {
  const toasts = useToasts((state) => state.toasts);
  const dismiss = useToasts((state) => state.dismiss);

  return (
    <Toast.Provider swipeDirection="right" label="Notifications">
      {toasts.map((item) => (
        <Toast.Root
          key={item.id}
          duration={item.durationMs}
          type={item.tone === 'error' ? 'foreground' : 'background'}
          onOpenChange={(open) => {
            if (!open) dismiss(item.id);
          }}
          className={cx(
            'flex w-full items-start gap-3 rounded-card border-2 bg-surface p-4 text-ink shadow-card',
            TONES[item.tone],
          )}
        >
          <Icon
            name={item.tone === 'error' ? 'alert' : item.tone === 'success' ? 'check-circle' : 'info'}
            className={cx('mt-0.5 size-5', item.tone === 'error' ? 'text-danger' : item.tone === 'success' ? 'text-success' : 'text-info')}
          />
          <div className="min-w-0 flex-1">
            <Toast.Title className="text-base font-semibold">{item.title}</Toast.Title>
            {item.description ? <Toast.Description className="mt-0.5 text-base text-ink-muted">{item.description}</Toast.Description> : null}
          </div>
          {item.action ? (
            <Toast.Action
              altText={item.action.altText}
              onClick={item.action.onAction}
              className="min-h-11 shrink-0 rounded-control border border-line-strong px-3 font-semibold text-accent hover:bg-sunken"
            >
              {item.action.label}
            </Toast.Action>
          ) : null}
          <Toast.Close
            aria-label="Dismiss notification"
            className="-mr-1 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-sunken"
          >
            <Icon name="x" />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed bottom-0 right-0 z-[60] flex w-full max-w-md flex-col gap-2 p-4 outline-none" />
    </Toast.Provider>
  );
}
