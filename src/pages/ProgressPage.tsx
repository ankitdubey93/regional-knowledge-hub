import { useState } from 'react';
import { docs } from '../content/docs';
import { codingScenarios, flashcards, journalScenarios } from '../data';
import { useProgress } from '../progress/ProgressContext';
import { Button, Card, PageHeader, TableScroll, TextLink } from '../components/ui';
import { isDue, todayIso } from '../utils/srs';

export function ProgressPage() {
  const { progress, reset } = useProgress();
  const [confirming, setConfirming] = useState(false);
  const today = todayIso();
  const due = flashcards.filter((c) => isDue(progress.cards[c.id], today)).length;
  const mastered = flashcards.filter((c) => (progress.cards[c.id]?.box ?? 0) >= 4).length;
  const journalDone = journalScenarios.filter((s) => progress.journal[s.id]).length;
  const codingRight = codingScenarios.filter((s) => progress.coding[s.id]).length;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-hub-progress-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = [
    ['Topics read', `${Object.keys(progress.read).length} / ${docs.length}`],
    ['Flashcards due today', String(due)],
    ['Flashcards in box 4 or 5', `${mastered} / ${flashcards.length}`],
    ['Journal scenarios solved', `${journalDone} / ${journalScenarios.length}`],
    ['Coding scenarios right first time', `${codingRight} / ${codingScenarios.length}`],
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Your progress" lead="Kept in this browser only. Export it to keep a copy or move it to another device." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map(([label, value]) => (
          <Card key={label} className="p-4 sm:p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="num mt-1 text-2xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Topics</h2>
        <TableScroll>
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-3 font-medium">Topic</th>
                <th className="py-2 pr-3 font-medium">Read</th>
                <th className="py-2 font-medium">Best quiz score</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const q = progress.quiz[d.id];
                return (
                  <tr key={d.id} className="border-b border-line">
                    <td className="py-2 pr-3">
                      <TextLink to={`/learn/${d.id}`}>{d.title}</TextLink>
                    </td>
                    <td className="py-2 pr-3">{progress.read[d.id] ?? '—'}</td>
                    <td className="num py-2">{q ? `${q.best}/${q.total}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={exportJson}>
          Export progress
        </Button>
        {confirming ? (
          <>
            <Button
              className="bg-bad text-white hover:bg-bad"
              onClick={() => {
                reset();
                setConfirming(false);
              }}
            >
              Yes, erase everything
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Reset progress
          </Button>
        )}
      </div>
    </div>
  );
}
