'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const output = path.join(__dirname, 'index.html');
let html = fs.readFileSync(output, 'utf8');
for (const name of ['engine', 'characters', 'enemies', 'arena', 'online', 'trades', 'admin', 'ui']) {
  const file = `vesper-${name}.js`;
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  new vm.Script(source, { filename: file });
  if (/<\/script/i.test(source)) throw new Error(`${file} contains an unsafe script terminator`);
  const expression = new RegExp(`<script (?:src="vesper-${name}\\.js"|data-module="${name}")[^>]*>[\\s\\S]*?<\\/script>`);
  if (!expression.test(html)) throw new Error(`Missing ${name} module in index.html`);
  html = html.replace(expression, () => `<script data-module="${name}">\n${source}\n  </script>`);
}
for (const name of ['online', 'admin', 'campaign']) {
  const css = fs.readFileSync(path.join(__dirname, `vesper-${name}.css`), 'utf8');
  const expression = new RegExp(`<style data-module="${name}">[\\s\\S]*?<\\/style>`);
  if (!expression.test(html)) throw new Error(`Missing ${name} stylesheet in index.html`);
  html = html.replace(expression, () => `<style data-module="${name}">\n${css}\n</style>`);
}
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"|@import\s|fetch\(/i.test(html)) {
  throw new Error('The offline deliverable must have no external dependencies');
}
fs.writeFileSync(output, html, 'utf8');
fs.mkdirSync(path.join(__dirname, 'VESPER'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'VESPER', 'index.html'), html, 'utf8');
console.log(`VESPER/index.html ready: ${Buffer.byteLength(html)} bytes; root index.html synchronized. No external dependencies.`);
