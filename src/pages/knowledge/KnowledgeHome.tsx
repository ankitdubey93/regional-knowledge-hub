import { Link } from 'react-router-dom';
import { docsIn, SECTIONS } from '../../content/docs';
import { TOOLS, type ToolId } from '../../content/tools';
import { ChatPanel } from '../../components/ChatPanel';
import { Card, PageHeader } from '../../components/ui';
import { hubSuggestions } from '../../lib/chat';
import { useHubScope } from '../../lib/hubScope';
import { inScope } from '../../lib/scope';

const order: ToolId[] = ['journal', 'tax', 'depreciation', 'inventory', 'company-size', 'compare'];

export function KnowledgeHome() {
  const { scope } = useHubScope();
  const paths = SECTIONS.map((s) => ({ s, items: docsIn(s.id).filter((d) => inScope(d.jurisdiction, scope)) })).filter((p) => p.items.length > 0);

  return (
    <div className="space-y-10">
      <PageHeader title="Knowledge Hub" lead="Guides, framework comparisons, calculators and practice for bookkeeping in Australia and the UK." />

      <ChatPanel title="Ask the Knowledge Hub" placeholder="Ask a bookkeeping or tax question" suggestions={hubSuggestions(scope)} />

      <section aria-labelledby="paths">
        <h2 id="paths" className="mb-4 text-xl font-semibold">
          Learning paths
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {paths.map(({ s, items }) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold">
                  <Link to={`/knowledge/learn#${s.id}`} className="hover:text-accent">
                    {s.title}
                  </Link>
                </h3>
              </div>
              <p className="mt-1 text-sm text-muted">{s.blurb}</p>
              <ol className="mt-4 space-y-1 text-sm">
                {items.map((d) => (
                  <li key={d.id}>
                    <Link to={`/knowledge/learn/${d.id}`} className="hover:text-accent">
                      {d.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="hub-tools">
        <h2 id="hub-tools" className="mb-4 text-xl font-semibold">
          Tools
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {order.map((id) => (
            <li key={id}>
              <Link to={TOOLS[id].to} className="block h-full rounded-xl border border-line bg-panel p-5 hover:border-accent">
                <p className="font-semibold">{TOOLS[id].title}</p>
                <p className="mt-1 text-sm text-muted">{TOOLS[id].blurb}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
