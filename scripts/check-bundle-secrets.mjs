// Fails the build if anything in dist/ looks like an API key (CLAUDE.md Hard rule 10).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [/sk-ant-[A-Za-z0-9_-]{10,}/, /AIza[0-9A-Za-z_-]{20,}/];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const hits = walk('dist').filter((file) => PATTERNS.some((re) => re.test(readFileSync(file, 'utf8'))));
if (hits.length > 0) {
  console.error(`check-bundle-secrets: key pattern found in ${hits.join(', ')}`);
  process.exit(1);
}
console.log('check-bundle-secrets: no key patterns in dist/');
