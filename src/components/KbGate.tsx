import { useEffect, useState, type ReactNode } from 'react';
import { Button, Callout } from './ui';
import { isKbLoaded, loadKb } from '../lib/kbStore';

type Status = 'loading' | 'ready' | 'failed';

/** Renders the app only once the facts and guides have loaded from /api/kb/site. Nothing is shown from a fallback. */
export function KbGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Status>(isKbLoaded() ? 'ready' : 'loading');

  useEffect(() => {
    if (state !== 'loading') return;
    let active = true;
    loadKb().then(
      () => {
        if (active) setState('ready');
      },
      () => {
        if (active) setState('failed');
      },
    );
    return () => {
      active = false;
    };
  }, [state]);

  if (state === 'loading') return <p className="p-8 text-muted">Loading the knowledge base…</p>;

  if (state === 'failed') {
    return (
      <div className="mx-auto max-w-xl p-8">
        <Callout tone="bad">
          Couldn't load the knowledge base. Rates and guides come from it, so nothing is shown until it loads.
        </Callout>
        <Button className="mt-4" onClick={() => setState('loading')}>
          Try again
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
