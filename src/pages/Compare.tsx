import { ComparisonMatrix } from '../components/ComparisonMatrix';
import { PageHeader, TextLink } from '../components/ui';
import { standards } from '../data';

export function Compare() {
  return (
    <div>
      <PageHeader
        title="Compare frameworks"
        lead={
          <>
            How IFRS, UK GAAP (FRS 102 and FRS 105) and the Australian standards treat the same transaction. Background in the{' '}
            <TextLink to="/learn/standards/uk-gaap-frs102-vs-ifrs">FRS 102 vs IFRS</TextLink> and{' '}
            <TextLink to="/learn/standards/aasb-standards-overview">AASB</TextLink> topics.
          </>
        }
      />
      <ComparisonMatrix data={standards} />
      <p className="mt-6 text-sm text-muted">
        Summaries for teaching, not the text of the standards. Where a cell says to check the current text, that point was not confirmed against the standard.
      </p>
    </div>
  );
}
