// node test/core.test.mjs —— 不开浏览器，直接跑 20 条断言
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/core.js', import.meta.url), 'utf8');
const CHEM = new Function(src + '\n;return globalThis.CHEM;')();

const r = CHEM.runAssertions();
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
console.log('核心断言 ' + r.pass + '/' + r.total + ' PASS' + (r.fail ? ' · ' + r.fail + ' FAIL' : ''));
console.log('─'.repeat(72));
for (const row of r.rows) {
  console.log(
    ('#' + row.id).padEnd(4) +
    (row.pass ? 'PASS' : 'FAIL') + '  ' +
    pad(row.name, 30) + '  ' + row.detail
  );
}
console.log('─'.repeat(72));
process.exit(r.fail ? 1 : 0);
