// Rebuild the standalone deliverable after changing either source module.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const output = path.join(__dirname, 'index.html');
let html = fs.readFileSync(output, 'utf8');
for (const name of ['engine', 'characters', 'ui']) {
  const file = `vesper-${name}.js`;
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  new vm.Script(source, { filename: file });
  if (/<\/script/i.test(source)) throw new Error(`${file} contains an unsafe script terminator`);
  const expression = new RegExp(`<script (?:src="vesper-${name}\\.js"|data-module="${name}")[^>]*>[\\s\\S]*?<\\/script>`);
  if (!expression.test(html)) throw new Error(`Missing ${name} module in index.html`);
  html = html.replace(expression, () => `<script data-module="${name}">\n${source}\n  </script>`);
}
const campaignCss = fs.readFileSync(path.join(__dirname, 'vesper-campaign.css'), 'utf8');
html = html.replace(/<style data-module="campaign">[\s\S]*?<\/style>/, () => `<style data-module="campaign">\n${campaignCss}\n</style>`);
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"|@import\s|fetch\(/i.test(html)) {
  throw new Error('The offline deliverable must have no external dependencies');
}
fs.writeFileSync(output, html, 'utf8');
if (fs.existsSync(path.join(__dirname, 'VESPER', 'index.html'))) fs.writeFileSync(path.join(__dirname, 'VESPER', 'index.html'), html, 'utf8');
console.log(`index.html ready: ${Buffer.byteLength(html)} bytes; HTML, CSS, SVG, JavaScript and audio synthesis embedded.`);
