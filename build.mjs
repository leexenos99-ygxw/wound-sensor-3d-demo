#!/usr/bin/env node
/* build.mjs —— 零依赖构建：模板 + core + app + vendor → dist 两个版本
   用法：
     node build.mjs              # 生成 dist/ 两版
     node build.mjs --check      # 只校验 dist 是否与源码同步
   唯一可编辑对象是 src/ 下的文件，dist/ 一律由本脚本产出。 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const guard = (s) => s.replace(/<\/script/gi, '<\\/script');

const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.min.js';

const tpl = read('src/index.template.html');
const core = guard(read('src/core.js'));
const app = guard(read('src/app.js'));
// vendor：three 的 UMD 构建 + 两个已去模块化的 addon（经典脚本，file:// 直开也不踩 importmap）
const three = guard(read('vendor/three.umd.js'));
const addons = guard(read('vendor/addons.js'));

const stamp = `<!-- built by build.mjs · ${new Date().toISOString().slice(0, 10)} · core+app 同源 -->`;

// 必须用函数替换：JS 源码里含 $& $' 之类的序列，字符串替换会被 String.replace 当作特殊符号吃掉
function assemble(threeBlock) {
  return tpl
    .replace('{{THREE}}', () => threeBlock)
    .replace('{{ADDONS}}', () => addons)
    .replace('{{CORE}}', () => core)
    .replace('{{APP}}', () => app)
    .replace('<head>', () => `<head>\n${stamp}`);
}

const variants = {
  'molecule-lab.html': assemble(`<script src="${THREE_CDN}"></script>`),
  'molecule-lab-offline.html': assemble(`<script>\n${three}\n</script>`)
};

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });

let drift = 0;
for (const [name, html] of Object.entries(variants)) {
  const out = path.join(ROOT, 'dist', name);
  const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (prev === html) {
    console.log(`ok    ${name}  ${(html.length / 1024).toFixed(0)} KB（无变化）`);
    continue;
  }
  if (process.argv.includes('--check')) {
    drift++;
    console.log(`DRIFT ${name}  与源码不一致，请运行 node build.mjs`);
    continue;
  }
  fs.writeFileSync(out, html);
  console.log(`build ${name}  ${(html.length / 1024).toFixed(0)} KB`);
}

// 两版除 three 来源外必须一致：把第一段 script（three）抠掉后逐字比较
const strip = (h) => h.replace(/<script(?:\s+src="[^"]*")?>[\s\S]*?<\/script>/, '');
const [cdnHtml, offlineHtml] = Object.values(variants);
const same = strip(cdnHtml) === strip(offlineHtml);
console.log(same ? 'ok    两版应用代码完全一致' : 'WARN  两版存在差异（请检查占位符替换）');

if (drift) process.exit(1);
