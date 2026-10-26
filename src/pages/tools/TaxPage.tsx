import { TaxCalculator } from '../../components/TaxCalculator';
import { Callout, PageHeader } from '../../components/ui';

export function TaxPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Tax calculator" lead="Every rate and threshold here comes from the facts registry and links to its official source. Hover a figure to see when it was checked." />
      <TaxCalculator />
      <Callout tone="warn">
        Not built: PAYG withholding (AU) and PAYE income tax (UK). They depend on full tax tables and tax codes, and a simplified version would teach wrong numbers.
        Use the ATO tax withheld calculator or HMRC's PAYE tools.
      </Callout>
    </div>
  );
}
