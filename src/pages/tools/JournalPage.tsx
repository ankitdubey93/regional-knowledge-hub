import { JournalSimulator } from '../../components/JournalSimulator';
import { PageHeader, TextLink } from '../../components/ui';
import { journalScenarios } from '../../data';
import { useHubScope } from '../../lib/hubScope';
import { inScope } from '../../lib/scope';

export function JournalPage() {
  const { scope } = useHubScope();
  return (
    <div>
      <PageHeader
        title="Journal simulator"
        lead={
          <>
            Read the scenario, choose the accounts and put each amount on the debit or credit side. The checker nets lines by account, so splitting a line is fine.
            New to this? Read <TextLink to="/knowledge/learn/core-accounting/double-entry-rules">Double entry</TextLink> first.
          </>
        }
      />
      <JournalSimulator scenarios={journalScenarios.filter((s) => inScope(s.jurisdiction, scope))} />
    </div>
  );
}
