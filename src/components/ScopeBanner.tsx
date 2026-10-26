import type { ReactNode } from 'react';
import { useHubScope } from '../lib/hubScope';
import { scopeName } from '../lib/scope';
import { Button, Tabs } from './ui';

const frame = (children: ReactNode) => (
  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">{children}</div>
);

export function ScopeBanner() {
  const { scope, entity, entityScope, showingAll, setManual, showAll, resetToEntity } = useHubScope();

  if (entity !== null && entityScope !== null) {
    if (entityScope === 'all') {
      return frame(<p>Showing Australia and the UK for {entity.name}.</p>);
    }
    if (!showingAll) {
      return frame(
        <>
          <p>
            Showing {scopeName(entityScope)} for {entity.name}.
          </p>
          <Button variant="ghost" onClick={showAll}>
            Show all jurisdictions
          </Button>
        </>,
      );
    }
    return frame(
      <>
        <p>Showing every jurisdiction.</p>
        <Button variant="ghost" onClick={resetToEntity}>
          Show only {scopeName(entityScope)}
        </Button>
      </>,
    );
  }

  return frame(
    <>
      <span className="text-muted">Jurisdiction</span>
      <div className="-mb-4">
        <Tabs
          label="Jurisdiction"
          value={scope}
          onChange={setManual}
          tabs={[
            { id: 'all', label: 'All' },
            { id: 'AU', label: 'Australia' },
            { id: 'UK', label: 'UK' },
          ]}
        />
      </div>
    </>,
  );
}
