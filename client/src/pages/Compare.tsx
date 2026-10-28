import { ComparisonMatrix } from '../components/ComparisonMatrix';
import { PageHeader, TextLink } from '../components/ui';
import { standards } from '../data';
import { useHubScope } from '../lib/hubScope';
import { frameworksFor } from '../lib/scope';

export function Compare() {
  const { scope } = useHubScope();
  return (
    <div>
      <PageHeader
        title="Compare frameworks"
        lead={
          <>
            How IFRS, UK GAAP (FRS 102 and FRS 105) and the Australian standards treat the same transaction. Background in the{' '}
            <TextLink to="/knowledge/learn/standards/uk-gaap-frs102-vs-ifrs">FRS 102 vs IFRS</TextLink> and{' '}
            <TextLink to="/knowledge/learn/standards/aasb-standards-overview">AASB</TextLink> topics.
          </>
        }
      />
      <ComparisonMatrix key={scope} data={standards} frameworks={frameworksFor(scope)} />
      <p className="mt-6 text-sm text-muted">
        Summaries for teaching, not the text of the standards. Where a cell says to check the current text, that point was not confirmed against the standard.
      </p>
    </div>
  );
}
