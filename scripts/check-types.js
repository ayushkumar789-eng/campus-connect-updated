#!/usr/bin/env node
/**
 * Type check for a JavaScript codebase.
 *
 * The project is plain JSX/ESM with no TypeScript, no `tsconfig.json` and no
 * build-time type stripping — so "typecheck" here cannot mean `tsc`. Forcing
 * `checkJs` across the tree would either demand annotations nobody wrote or
 * report thousands of `any`s, and the instruction for this pass was explicitly
 * not to impose TypeScript on a JavaScript project.
 *
 * What is genuinely useful, and cheap, is the class of check that a type system
 * would have caught and that a linter cannot: every relative import actually
 * resolving to a file that exists. A bad path is silent until the affected
 * module is first imported — often in one branch of the UI that nobody visits —
 * and it fails as `ERR_MODULE_NOT_FOUND` in production rather than at build
 * time. That is exactly how `server/scripts/test-groups.js` sat in the tree
 * importing a pre-module layout that no longer existed.
 *
 * So this checks module resolution, and reports `tsconfig.json` / `tsc`
 * absence plainly rather than pretending to be a type checker.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE_DIRS = ['client/src', 'server/src'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'data', 'coverage', '.git']);

/** Recursively collect every .js/.jsx source file. */
function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (['.js', '.jsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

/** Extensions a relative specifier may resolve to, in Vite/Node order. */
const CANDIDATE_SUFFIXES = ['', '.js', '.jsx', '/index.js', '/index.jsx'];

function resolves(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  return CANDIDATE_SUFFIXES.some((s) => {
    const candidate = base + s;
    return existsSync(candidate) && statSync(candidate).isFile();
  });
}

// Matches `from '…'`, `import '…'` and `import('…')` — the three ways a
// relative specifier appears in this codebase.
const SPECIFIER_RE = /(?:\bfrom\s*|\bimport\s*|\bimport\()\s*['"](\.[^'"]+)['"]/g;

const files = SOURCE_DIRS.flatMap((d) => collect(join(root, d)));
const broken = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const match of src.matchAll(SPECIFIER_RE)) {
    const specifier = match[1];
    if (!resolves(file, specifier)) {
      const line = src.slice(0, match.index).split('\n').length;
      broken.push({ file: file.replace(root + '/', ''), line, specifier });
    }
  }
}

if (broken.length) {
  console.error(`Unresolvable relative imports: ${broken.length}\n`);
  for (const b of broken) {
    console.error(`  ${b.file}:${b.line}  ->  ${b.specifier}`);
  }
  process.exit(1);
}

console.log(`Module resolution OK — ${files.length} files, every relative import resolves.`);

// Report the absent type system explicitly so the script's scope is never
// mistaken for something it is not.
const tsconfig = existsSync(join(root, 'tsconfig.json'));
const tsc = existsSync(join(root, 'node_modules', '.bin', 'tsc'));
console.log(
  tsconfig || tsc
    ? 'TypeScript config detected.'
    : 'No tsconfig.json / tsc: project is plain JavaScript, so there are no type annotations to check.',
);