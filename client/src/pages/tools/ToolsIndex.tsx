import { Link } from 'react-router-dom';
import { TOOLS, type ToolId } from '../../content/tools';
import { PageHeader } from '../../components/ui';

const order: ToolId[] = ['journal', 'tax', 'depreciation', 'inventory', 'company-size', 'compare'];

export function ToolsIndex() {
  return (
    <div>
      <PageHeader title="Tools" lead="Interactive calculators and simulators. They run in your browser; nothing you type leaves it." />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {order.map((id) => (
          <li key={id}>
            <Link to={TOOLS[id].to} className="block h-full rounded-3xl bg-panel shadow-soft transition-[transform,box-shadow] duration-150 ease-snappy hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0 motion-reduce:transform-none p-6">
              <p className="font-semibold">{TOOLS[id].title}</p>
              <p className="mt-1 text-sm text-muted">{TOOLS[id].blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
