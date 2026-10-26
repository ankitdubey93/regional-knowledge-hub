import type { Checklist as ChecklistData } from '../data/schemas';
import { useProgress } from '../progress/ProgressContext';
import { Button, Card } from './ui';

export function Checklist({ list }: { list: ChecklistData }) {
  const { progress, update } = useProgress();
  const key = (itemId: string) => `${list.id}:${itemId}`;
  const all = list.groups.flatMap((g) => g.items);
  const done = all.filter((i) => progress.checklist[key(i.id)]).length;

  const toggle = (itemId: string) =>
    update((p) => ({ ...p, checklist: { ...p.checklist, [key(itemId)]: !p.checklist[key(itemId)] } }));
  const clear = () =>
    update((p) => ({ ...p, checklist: Object.fromEntries(Object.entries(p.checklist).filter(([k]) => !k.startsWith(`${list.id}:`))) }));

  return (
    <Card>
      <div id="checklist" className="flex scroll-mt-20 flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{list.title} checklist</h2>
        <div className="flex items-center gap-3">
          <span className="num text-sm text-muted" aria-live="polite">
            {done}/{all.length} done
          </span>
          <Button variant="secondary" onClick={clear} disabled={done === 0}>
            Start a new month
          </Button>
        </div>
      </div>
      <div className="mt-4 space-y-6">
        {list.groups.map((g) => (
          <fieldset key={g.title}>
            <legend className="mb-2 font-medium">{g.title}</legend>
            <ul className="space-y-2">
              {g.items.map((i) => (
                <li key={i.id}>
                  <label className="flex cursor-pointer gap-3 rounded-lg p-2 hover:bg-panel-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                      checked={Boolean(progress.checklist[key(i.id)])}
                      onChange={() => toggle(i.id)}
                    />
                    <span>
                      <span className={progress.checklist[key(i.id)] ? 'text-muted line-through' : ''}>{i.text}</span>
                      <span className="block text-sm text-muted">{i.why}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>
    </Card>
  );
}
