// Prints what the filesystem says exists, one `key: value` line per fact, for content-sync to compare
// against CLAUDE.md and engineering/*.md. Node built-ins only (Hard rule 9). Run from the repo root:
//   node .claude/skills/content-sync/inventory.mjs
// It does not run tests: test counts come from real `npm test` runs (see SKILL.md §2).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
const dirs = (p) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const files = (p, re) => (existsSync(p) ? readdirSync(p).filter((f) => re.test(f)).sort() : []);
const out = (key, value) => console.log(`${key}: ${Array.isArray(value) ? value.join(', ') || '(none)' : value}`);
const byJurisdiction = (items) => {
  const counts = {};
  for (const item of items) counts[item.jurisdiction ?? '-'] = (counts[item.jurisdiction ?? '-'] ?? 0) + 1;
  return Object.entries(counts).sort().map(([j, n]) => `${j} ${n}`).join(', ');
};

// Curriculum (Hard rules 6, 8)
const sections = dirs('docs');
const docs = sections.flatMap((s) => files(join('docs', s), /\.md$/).map((f) => `${s}/${f.replace(/\.md$/, '')}`));
out('docs.total', docs.length);
for (const s of sections) out(`docs.${s}`, docs.filter((d) => d.startsWith(`${s}/`)).length);
out('docs.withoutSourcesSection', docs.filter((d) => !/^## Sources/m.test(read(`docs/${d}.md`))));

// Facts (Hard rules 1, 2)
const facts = json('shared/seed/facts.json');
const keys = Object.keys(facts);
const unverified = keys.filter((k) => facts[k].verifiedOn == null);
out('facts.total', keys.length);
out('facts.verified', keys.length - unverified.length);
out('facts.unverifiedKeys', unverified);
out('facts.latestVerifiedOn', keys.map((k) => facts[k].verifiedOn).filter(Boolean).sort().at(-1) ?? '(none)');
out('taxCodes.verifiedOn', json('client/src/data/tax-codes.json').verifiedOn ?? 'null');

// Practice (Hard rule 8: 5+ quiz questions and 5+ flashcards per doc)
const quizzes = json('client/src/data/quizzes.json');
const flashcards = json('client/src/data/flashcards.json');
out('quizzes.total', `${quizzes.length} (${byJurisdiction(quizzes)})`);
out('flashcards.total', `${flashcards.length} (${byJurisdiction(flashcards)})`);
const perDoc = (items) => (d) => items.filter((i) => i.doc === d).length;
out('docs.under5Quiz', docs.filter((d) => perDoc(quizzes)(d) < 5));
out('docs.under5Flashcards', docs.filter((d) => perDoc(flashcards)(d) < 5));
const journals = json('client/src/data/journal-scenarios.json');
const coding = json('client/src/data/coding-scenarios.json');
out('journalScenarios.total', `${journals.length} (${byJurisdiction(journals)})`);
out('codingScenarios.total', `${coding.length} (${byJurisdiction(coding)})`);
out('standardsMapping.topics', json('client/src/data/standards-mapping.json').topics.length);
out('checklists.total', json('client/src/data/checklists.json').length);
const dataFiles = files('client/src/data', /\.json$/);
const index = read('client/src/data/index.ts');
out('data.files', dataFiles);
out('data.notImportedInIndex', dataFiles.filter((f) => !index.includes(f)));

// Routes (client/src/App.tsx is the authority)
const app = read('client/src/App.tsx');
const routes = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
out('routes', routes);
const nestedPages = dirs('client/src/pages').flatMap((d) => files(`client/src/pages/${d}`, /\.tsx$/).map((f) => `${d}/${f}`));
const allPages = [...files('client/src/pages', /\.tsx$/), ...nestedPages].map((f) => f.replace(/\.tsx$/, ''));
out('pages', allPages);
out('pages.notReferencedInApp', allPages.filter((p) => !app.includes(`./pages/${p}'`) && !app.includes(`./pages/${p}"`)));
const tools = read('client/src/content/tools.ts');
const toolTargets = [...tools.matchAll(/to: '([^'#]+)/g)].map((m) => m[1].replace(/^\//, ''));
const routePatterns = routes.filter((r) => r !== '*').map((r) => new RegExp(`^${r.replace(/:[^/]+/g, '[^/]+')}$`));
out('toolsRegistry.targetsWithoutRoute', toolTargets.filter((t) => !routePatterns.some((re) => re.test(t))));

// Server
const sql = files('server/drizzle', /\.sql$/).map((f) => f.replace(/\.sql$/, ''));
const journalTags = json('server/drizzle/meta/_journal.json').entries.map((e) => e.tag);
out('migrations.files', sql);
out('migrations.notInJournal', sql.filter((m) => !journalTags.includes(m)));
out('migrations.journalWithoutFile', journalTags.filter((t) => !sql.includes(t)));
out('server.routes', files('server/src/routes', /\.ts$/));
out('server.services', files('server/src/services', /\.ts$/));
out('server.tenantTables', [...read('server/src/db/schema.ts').matchAll(/pgTable\(\s*'([^']+)'/g)].map((m) => m[1]));

// Tests (files only; counts need a real run)
out('tests.web.files', files('client/src/__tests__', /\.test\.tsx?$/));
out('tests.server.files', files('server/src/__tests__', /\.test\.ts$/));

// Dependencies (Hard rule 9: each needs a reason in architecture.md)
const pkg = json('package.json');
const serverPkg = json('server/package.json');
out('deps.root', Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort());
out('deps.server', Object.keys({ ...serverPkg.dependencies, ...serverPkg.devDependencies }).sort());

// Env (Hard rule 10)
const envNames = [...read('.env.example').matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]);
out('env.exampleNames', envNames);
out('env.secretNamesWithValue', read('.env.example').split('\n').filter((l) => /^[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*=.+/.test(l)).map((l) => l.split('=')[0]));
out('env.vitePrefixed', envNames.filter((n) => n.startsWith('VITE_')));

// Claude Code tooling
out('skills', dirs('.claude/skills'));
out('agents', files('.claude/agents', /\.md$/).map((f) => f.replace(/\.md$/, '')));
for (const plan of files('plans', /\.md$/)) {
  const text = read(`plans/${plan}`);
  const rows = text.split('\n').filter((l) => /^\| [A-Z] \| \d+ \|/.test(l));
  const todo = rows.filter((l) => /\| todo \|\s*$/.test(l)).length;
  out(`plans.${plan}`, `${rows.length} steps, ${todo} todo`);
}
