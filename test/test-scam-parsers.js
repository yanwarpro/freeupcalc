// Test parsing badge dari teks DOM (simulasi sederhana parser Upwork/Freelancer).
// Menguji helper parsing yang dipakai content script.

const path = require('path');
const Engine = require(path.join(__dirname, '..', 'scam-engine.js'));

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log('  ✅ ' + name + ' → ' + actual); }
  else { fail++; console.log('  ❌ ' + name + ' → dapat: ' + actual + ', harap: ' + expected); }
}

// Replika regex dari scam-detector.js (parseUpworkCard) untuk validasi parsir.
const LAST_VIEW_RE = /(?:last\s*viewed|viewed|seen)\s*:?\s*([\w\s]+?\s+ago)/i;
const JUST_NOW_RE = /(?:last\s*viewed|viewed|seen)\s*:?\s*just\s*now/i;
const PHONE_VERIFIED_RE = /phone\s+(?:number\s+)?verified/i;
const PHONE_UNVERIFIED_RE = /phone\s+(?:number\s+)?unverified/i;

function parseUpworkLike(text) {
  let lastViewDays = null;
  const m = text.match(LAST_VIEW_RE);
  if (m) lastViewDays = Engine.parseRelativeTime(m[1]);
  if (lastViewDays === null) {
    if (text.match(JUST_NOW_RE)) lastViewDays = 0;
  }
  let phoneVerified = null;
  if (PHONE_VERIFIED_RE.test(text)) phoneVerified = true;
  else if (PHONE_UNVERIFIED_RE.test(text)) phoneVerified = false;
  return {
    hireRate: Engine.parseHireRate(text),
    lastViewDays,
    phoneVerified,
  };
}

console.log('=== Parser Upwork: hire rate ===');
check('P1 "Hire rate: 95%"', parseUpworkLike('Hire rate: 95%').hireRate, 95);
check('P2 "Hire Rate 88%"', parseUpworkLike('Hire Rate 88%').hireRate, 88);
check('P3 tanpa hire rate', parseUpworkLike('Posted 2 days ago').hireRate, null);

console.log('\n=== Parser Upwork: last view ===');
check('P4 "Viewed 3 hours ago" → 0.125', Math.round(parseUpworkLike('Viewed 3 hours ago').lastViewDays * 1000) / 1000, 0.125);
check('P5 "Last viewed 2 days ago" → 2', parseUpworkLike('Last viewed 2 days ago').lastViewDays, 2);
check('P6 "Viewed just now" → 0', parseUpworkLike('Viewed just now').lastViewDays, 0);
check('P7 "Posted 5 days ago" → null', parseUpworkLike('Posted 5 days ago').lastViewDays, null);
check('P8 "Viewed 1 week ago" → 7', parseUpworkLike('Viewed 1 week ago').lastViewDays, 7);

console.log('\n=== Parser Upwork: phone verified ===');
check('P9 "Phone number verified" → true', parseUpworkLike('Phone number verified').phoneVerified, true);
check('P10 "Phone unverified" → false', parseUpworkLike('Phone unverified').phoneVerified, false);
check('P11 tanpa info phone → null', parseUpworkLike('Some project').phoneVerified, null);

console.log('\n=== Skenario nyata: kartu Upwork ===');
const card = 'Fixed-price - $1,500 - 30% - Payment verified - Hire rate: 95% - Phone number verified - Viewed 4 hours ago - 12 proposals';
const parsed = parseUpworkLike(card);
console.log('  Teks:', card);
console.log('  hireRate:', parsed.hireRate, '| lastViewDays:', parsed.lastViewDays, '| phoneVerified:', parsed.phoneVerified);
check('P12 hire rate 95', parsed.hireRate, 95);
check('P13 last view < 2 hari', parsed.lastViewDays < 2, true);
check('P14 phone verified', parsed.phoneVerified, true);

const result = Engine.scoreCard({
  paymentVerified: true,
  phoneVerified: parsed.phoneVerified,
  hireRate: parsed.hireRate,
  lastViewDays: parsed.lastViewDays,
  totalSpent: 12000,
  rating: 4.7,
  reviewCount: 33,
  budget: 1500,
  description: 'We need a senior React developer to rebuild our customer portal with Stripe integration. Detailed milestones attached.',
}, 'upwork');
check('P15 level akhir', result.level, 'safe');
check('P16 allSafe', result.allSafe, true);

console.log('\n================================');
console.log('HASIL: ' + pass + ' lulus, ' + fail + ' gagal');
console.log('================================');
if (fail > 0) process.exitCode = 1;
