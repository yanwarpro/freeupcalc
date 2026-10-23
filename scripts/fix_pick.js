const fs = require('fs');

const p = process.argv[2];
const start = parseInt(process.argv[3], 10);
const end = parseInt(process.argv[4], 10);
const replacement = process.argv[5];

if (!p || isNaN(start) || isNaN(end) || replacement === undefined) {
  console.error('Usage: node fix_pick.js <file> <start> <end> <replacement>');
  process.exit(1);
}

let s = fs.readFileSync(p, 'utf8');

s = s.slice(0, start) + replacement + s.slice(end);

fs.writeFileSync(p, s, 'utf8');
console.log('done');