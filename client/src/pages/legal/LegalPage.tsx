import { useParams } from 'react-router-dom';
import { LEGAL_DOCS, type LegalDoc } from '@chub/shared/lib/legal';
import { Callout } from '../../components/ui';
import { Markdown } from '../../components/Markdown';
import { NotFound } from '../NotFound';
import { useDeployment } from '../../lib/deployment';
import auPrivacy from '../../content/legal/au/privacy.md?raw';
import auTerms from '../../content/legal/au/terms.md?raw';
import auProcessing from '../../content/legal/au/processing.md?raw';
import auSubprocessors from '../../content/legal/au/subprocessors.md?raw';
import ukPrivacy from '../../content/legal/uk/privacy.md?raw';
import ukTerms from '../../content/legal/uk/terms.md?raw';
import ukProcessing from '../../content/legal/uk/processing.md?raw';
import ukSubprocessors from '../../content/legal/uk/subprocessors.md?raw';

const BODIES: Record<'AU' | 'UK', Record<LegalDoc, string>> = {
  AU: { privacy: auPrivacy, terms: auTerms, processing: auProcessing, subprocessors: auSubprocessors },
  UK: { privacy: ukPrivacy, terms: ukTerms, processing: ukProcessing, subprocessors: ukSubprocessors },
};

/** A legal draft for the region this deployment serves. Every page carries the draft banner until a lawyer has reviewed it. */
export function LegalPage() {
  const { doc } = useParams();
  const deployment = useDeployment();
  if (!(LEGAL_DOCS as readonly string[]).includes(doc ?? '')) return <NotFound />;
  if (deployment === null) return <p role="status">Loading…</p>;
  return (
    <div>
      <Callout tone="warn">Draft: needs legal review. This document has not been reviewed by a lawyer and is not yet in force.</Callout>
      <div className="mt-6">
        <Markdown body={BODIES[deployment.region][doc as LegalDoc]} />
      </div>
    </div>
  );
}
