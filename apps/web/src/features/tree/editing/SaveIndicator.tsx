import { useEffect, useState } from 'react';
import { Icon } from '../../../components/Icon';
import { cx } from '../../../lib/cx';
import { useTreeEditingState } from './editingStore';

function secondsAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

/** An honest save indicator (SPEC §5.3): what is happening to the user's last change, right now. */
export function SaveIndicator({ treeId }: { treeId: string }) {
  const state = useTreeEditingState(treeId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  let icon: 'cloud-check' | 'refresh' | 'wifi-off' | 'alert' | null = null;
  let text = '';
  let tone = 'text-ink-muted';
  switch (state.status) {
    case 'saving':
      icon = 'refresh';
      text = state.pending > 1 ? `Saving ${state.pending} changes…` : 'Saving…';
      break;
    case 'saved':
      icon = 'cloud-check';
      text = state.lastSavedAt ? `Saved ${secondsAgo(state.lastSavedAt, now)}` : 'All changes saved';
      tone = 'text-success';
      break;
    case 'retrying': {
      icon = 'refresh';
      const wait = state.retryAt ? Math.max(1, Math.ceil((state.retryAt - now) / 1000)) : null;
      text = wait ? `Couldn’t save — retrying in ${wait}s` : 'Couldn’t save — retrying';
      tone = 'text-warning';
      break;
    }
    case 'offline':
      icon = 'wifi-off';
      text = 'Offline — your changes will save when you reconnect';
      tone = 'text-warning';
      break;
    case 'error':
      icon = 'alert';
      text = 'Your last change wasn’t saved';
      tone = 'text-danger';
      break;
    default:
      return <span role="status" className="sr-only" />;
  }
  return (
    <span role="status" className={cx('inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold', tone)}>
      {icon ? <Icon name={icon} className={cx('size-4', state.status === 'saving' && 'motion-safe:animate-spin')} /> : null}
      {text}
    </span>
  );
}
