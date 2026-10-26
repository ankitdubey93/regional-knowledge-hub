import { JournalSimulator } from '../../components/JournalSimulator';
import { PageHeader, TextLink } from '../../components/ui';

export function JournalPage() {
  return (
    <div>
      <PageHeader
        title="Journal simulator"
        lead={
          <>
            Read the scenario, choose the accounts and put each amount on the debit or credit side. The checker nets lines by account, so splitting a line is fine.
            New to this? Read <TextLink to="/learn/core-accounting/double-entry-rules">Double entry</TextLink> first.
          </>
        }
      />
      <JournalSimulator />
    </div>
  );
}
