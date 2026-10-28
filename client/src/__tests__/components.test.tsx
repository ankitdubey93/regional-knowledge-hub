import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { JournalSimulator } from '../components/JournalSimulator';
import { Quiz } from '../components/Quiz';
import { Topic } from '../pages/Topic';
import { TaxCalculator } from '../components/TaxCalculator';
import { CodingPage } from '../pages/practice/CodingPage';
import { PracticeIndex } from '../pages/practice/PracticeIndex';
import { CompanySizePage } from '../pages/tools/CompanySizePage';
import { journalScenarios, quizzes } from '../data';
import { STORAGE_KEY } from '../utils/progress';

describe('JournalSimulator', () => {
  it('flags an unbalanced entry, then accepts the right one and records it', async () => {
    const user = userEvent.setup();
    renderAt('/', '/', <JournalSimulator />);
    const first = journalScenarios[0]!; // laptop on credit: Dr 1500 2,000 / Cr 2000 2,000
    const selects = screen.getAllByRole('combobox', { name: /account/i });
    await user.selectOptions(selects[0]!, '1500');
    await user.selectOptions(selects[1]!, '2000');
    await user.type(screen.getByRole('textbox', { name: 'Line 1 debit' }), '2000');
    await user.type(screen.getByRole('textbox', { name: 'Line 2 credit' }), '1900');
    await user.click(screen.getByRole('button', { name: 'Check my entry' }));
    expect(await screen.findByText(/do not equal credits/)).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Line 2 credit' }));
    await user.type(screen.getByRole('textbox', { name: 'Line 2 credit' }), '2,000');
    await user.click(screen.getByRole('button', { name: 'Check my entry' }));
    expect(await screen.findByText('Correct.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).journal[first.id]).toBe(true);
  });

  it('explains a wrong side', async () => {
    const user = userEvent.setup();
    renderAt('/', '/', <JournalSimulator />);
    const selects = screen.getAllByRole('combobox', { name: /account/i });
    await user.selectOptions(selects[0]!, '2000');
    await user.selectOptions(selects[1]!, '1500');
    await user.type(screen.getByRole('textbox', { name: 'Line 1 debit' }), '2000');
    await user.type(screen.getByRole('textbox', { name: 'Line 2 credit' }), '2000');
    await user.click(screen.getByRole('button', { name: 'Check my entry' }));
    expect(await screen.findAllByText(/right amount, wrong side/)).toHaveLength(2);
  });
});

describe('Quiz', () => {
  it('scores answers and saves the best score', async () => {
    const user = userEvent.setup();
    const docId = 'core-accounting/double-entry-rules';
    const qs = quizzes.filter((q) => q.doc === docId).slice(0, 2);
    renderAt('/', '/', <Quiz docId={docId} questions={qs} attempt={0} />);
    // Answer the first correctly, the second wrongly.
    await user.click(screen.getByRole('button', { name: new RegExp(`^${qs[0]!.options[qs[0]!.answer]!.text}`) }));
    expect(screen.getByText(/^Correct\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    const wrong = qs[1]!.options.findIndex((_, i) => i !== qs[1]!.answer);
    await user.click(screen.getByRole('button', { name: new RegExp(`^${qs[1]!.options[wrong]!.text.replace(/[()]/g, '.')}`) }));
    await user.click(screen.getByRole('button', { name: 'See my score' }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).quiz[docId]).toMatchObject({ best: 1, total: 2 });
  });
});

describe('Topic page', () => {
  it('renders a doc with its facts linked to the source', async () => {
    renderAt('/knowledge/learn/australia/bas-gst-guide', '/knowledge/learn/:section/:slug', <Topic />);
    expect(screen.getByRole('heading', { level: 1, name: 'GST and the BAS' })).toBeInTheDocument();
    const rate = document.querySelectorAll('a[data-fact="au.gst.rate"]');
    expect(rate.length).toBeGreaterThan(0);
    expect(rate[0]!.textContent).toContain('10%');
    expect(rate[0]!.getAttribute('href')).toMatch(/^https:\/\/www\.ato\.gov\.au\//);
  });
  it('shows not found for an unknown doc', () => {
    renderAt('/knowledge/learn/uk/nope', '/knowledge/learn/:section/:slug', <Topic />);
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('TaxCalculator', () => {
  it('works out GST in an inclusive price', async () => {
    renderAt('/', '/', <TaxCalculator />);
    const results = screen.getByText('GST').closest('dl')!;
    expect(within(results).getByText('$100.00')).toBeInTheDocument();
  });
  it('fills the BAS from the sample period', async () => {
    const user = userEvent.setup();
    renderAt('/', '/', <TaxCalculator />);
    await user.click(screen.getByRole('tab', { name: 'AU BAS' }));
    // Sample: taxable sales 11,000 → 1A 1,000; taxable purchases 3,300 + 2,200 → 1B 500.
    expect(screen.getByText('1A GST on sales').nextSibling).toHaveTextContent('$1,000.00');
    expect(screen.getByText('1B GST on purchases').nextSibling).toHaveTextContent('$500.00');
    expect(screen.getByText('Net GST payable to the ATO').nextSibling).toHaveTextContent('$500.00');
  });
});

describe('Coding scenarios', () => {
  it('marks a right answer and records it as right first time', async () => {
    const user = userEvent.setup();
    renderAt('/', '/', <CodingPage />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Account' }), '461');
    await user.selectOptions(screen.getByRole('combobox', { name: 'GST rate' }), 'INPUT');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByText('Right.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).coding['c-au-stationery']).toBe(true);
  });
});

describe('Company size', () => {
  it('applies the UK two-year rule to the sample', () => {
    renderAt('/', '/', <CompanySizePage />);
    expect(screen.getAllByText(/two-year rule/)[0]).toBeInTheDocument();
  });
});

describe('PracticeIndex', () => {
  it('resets practice data from the Practice page', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, quiz: { 'uk/mtd-vat-guide': { best: 3, total: 5, last: '2026-10-26' } }, cards: {}, journal: {}, coding: {}, checklist: {} }),
    );
    renderAt('/knowledge/practice', '/knowledge/practice', <PracticeIndex />);
    await user.click(screen.getByRole('button', { name: 'Reset practice data' }));
    await user.click(screen.getByRole('button', { name: 'Yes, erase practice data' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).quiz).toEqual({});
  });
});
