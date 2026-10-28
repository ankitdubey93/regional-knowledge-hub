// Fails the build if dist/ still bundles docs/ or facts.json (P2b: the web reads them from /api/kb/site).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = ['{{fact:', 'GST registration turnover threshold (non-profit)'];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const hits = walk('dist').filter((file) => {
  const text = readFileSync(file, 'utf8');
  return PATTERNS.some((pattern) => text.includes(pattern));
});
if (hits.length > 0) {
  console.error(`check-bundle-content: curriculum or facts found in ${hits.join(', ')}`);
  process.exit(1);
}
console.log('check-bundle-content: no bundled curriculum or facts');
