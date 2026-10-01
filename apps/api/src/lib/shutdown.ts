export interface ShutdownOptions {
  /** Stops accepting requests and waits for the ones in flight. */
  close: () => Promise<void>;
  /** Releases the database once the last request is done. */
  disconnect: () => Promise<void>;
  /** How long in-flight work may take before the process goes anyway. */
  timeoutMs?: number;
  exit: (code: number) => void;
  log?: (message: string) => void;
}

/**
 * One orderly stop for SIGINT and SIGTERM: close the server, let in-flight requests finish,
 * disconnect, exit 0. A deploy sends SIGTERM and then SIGKILL a little later, so a change set
 * still inside its transaction must not hold the process open past that: after `timeoutMs` the
 * process exits 1 and lets the database roll the transaction back. A second signal while the
 * first is being handled is ignored rather than starting the dance twice.
 */
export function createShutdown(options: ShutdownOptions): () => void {
  const { close, disconnect, exit, timeoutMs = 10_000, log = () => undefined } = options;
  let started = false;
  return () => {
    if (started) return;
    started = true;
    const timer = setTimeout(() => {
      log(`Still busy after ${timeoutMs} ms; exiting anyway.`);
      exit(1);
    }, timeoutMs);
    void close()
      .then(() => disconnect())
      .then(
        () => {
          clearTimeout(timer);
          exit(0);
        },
        (error: unknown) => {
          clearTimeout(timer);
          log(`Shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
          exit(1);
        },
      );
  };
}
