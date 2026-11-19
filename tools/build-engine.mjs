// Mengubah fatigue.ts (sumber kebenaran) menjadi docs/fatigue.js untuk browser.
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync(new URL('../fatigue.ts', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(src, { mode: 'strip' });
writeFileSync(new URL('../docs/fatigue.js', import.meta.url), js);
console.log('docs/fatigue.js ditulis:', js.length, 'karakter');
