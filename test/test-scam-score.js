// Test logika scoring scam detector untuk skenario Freelancer & Upwork
// Memakai modul scam-engine.js — satu sumber kebenaran dengan content script.

const path = require('path');
const Engine = require(path.join(__dirname, '..', 'scam-engine.js'));

const { scoreCard, parseHireRate, parseRelativeTime } = Engine;

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log('  ✅ ' + name + ' → ' + actual); }
  else { fail++; console.log('  ❌ ' + name + ' → dapat: ' + actual + ', harap: ' + expected); }
}

function show(title, result) {
  console.log('\n=== ' + title + ' ===');
  console.log('Skor:', result.score, '| Level:', result.level, '| allSafe:', result.allSafe);
  console.log('OKs:', result.oks);
  console.log('Risks:', result.risks);
  if (result.safeCriteria && result.safeCriteria.length) {
    console.log('Kriteria aman:');
    result.safeCriteria.forEach(c => {
      console.log('  ' + (c.pass ? '✓' : (c.known ? '✗' : '–')) + ' ' + c.label);
    });
  }
}

// ========= TEST CASES =========
console.log('\n########## FREELANCER.COM ##########');

show('TEST 1: Skenario user (Deposit hijau, akun baru Mar 2026, rating 0, identity belum verified)',
  scoreCard({
    platform: 'freelancer',
    paymentVerified: true,
    depositMade: true,
    emailVerified: true,
    identityVerified: false,
    rating: 0,
    reviewCount: 0,
    budget: 500,
    description: 'Build a data center comparison report with PDF deliverables and comparison matrix. Detailed requirements provided.',
    memberSince: new Date('2026-03-20'),
  }, 'freelancer'));

show('TEST 2: Klien Freelancer aman (payment+email+deposit verified, akun lama, rating bagus)',
  scoreCard({
    paymentVerified: true,
    depositMade: true,
    emailVerified: true,
    identityVerified: true,
    rating: 4.9,
    reviewCount: 127,
    budget: 1500,
    description: 'Develop a React dashboard with authentication, charts, and admin panel. 3 milestones with clear deliverables.',
    memberSince: new Date('2020-05-10'),
  }, 'freelancer'));

show('TEST 3: Klien berisiko (deposit belum, minta Telegram, akun baru)',
  scoreCard({
    paymentVerified: false,
    depositMade: false,
    emailVerified: false,
    identityVerified: false,
    rating: 0,
    reviewCount: 0,
    budget: 3000,
    description: 'Easy money! Contact me on telegram @user for details. No experience needed, make $3000 per day.',
    memberSince: new Date('2026-09-01'),
  }, 'freelancer'));

show('TEST 4: Deposit belum made saja (faktor paling penting)',
  scoreCard({
    paymentVerified: true,
    depositMade: false,
    emailVerified: true,
    identityVerified: true,
    rating: 4.5,
    reviewCount: 50,
    budget: 800,
    description: 'Build a WordPress website with contact form and blog. Clear requirements.',
    memberSince: new Date('2022-01-01'),
  }, 'freelancer'));

console.log('\n########## UPWORK.COM ##########');

show('TEST 5: Klien Upwork aman (payment verified, hire rate 95%, last view 3 jam, phone verified)',
  scoreCard({
    paymentVerified: true,
    phoneVerified: true,
    hireRate: 95,
    lastViewDays: 0.125,
    totalSpent: 25000,
    rating: 4.8,
    reviewCount: 60,
    budget: 3000,
    description: 'Looking for a senior Laravel developer to rebuild our billing module. Full requirements in the attachment.',
  }, 'upwork'));

show('TEST 6: Klien Upwork TIDAK aman (payment unverified, hire rate 70%, last view 5 hari lalu, phone unverified)',
  scoreCard({
    paymentVerified: false,
    phoneVerified: false,
    hireRate: 70,
    lastViewDays: 5,
    totalSpent: 0,
    rating: 0,
    reviewCount: 0,
    budget: 3000,
    description: 'Build me a website. Contact me on telegram @fastdev for details. No experience needed, make $3000 per day.',
  }, 'upwork'));

// ========= ASSERTIONS =========
console.log('\n########## ASSERTIONS ##########');

// --- Freelancer ---
const fSafe = scoreCard({
  paymentVerified: true, depositMade: true, emailVerified: true,
  identityVerified: true, rating: 4.9, reviewCount: 127, budget: 1500,
  description: 'Develop a React dashboard with authentication, charts, and admin panel. 3 milestones with clear deliverables.',
  memberSince: new Date('2020-05-10'),
}, 'freelancer');
check('F1 level', fSafe.level, 'safe');
check('F1 allSafe', fSafe.allSafe, true);
check('F1 jumlah kriteria aman', fSafe.safeCriteria.length, 3);

const fNoEmail = scoreCard({
  paymentVerified: true, depositMade: true, emailVerified: false,
  identityVerified: true, rating: 4.9, reviewCount: 127, budget: 1500,
  description: 'Develop a React dashboard with authentication, charts, and admin panel. 3 milestones with clear deliverables.',
  memberSince: new Date('2020-05-10'),
}, 'freelancer');
check('F2 email belum verified → bukan safe', fNoEmail.level, 'neutral');
check('F2 allSafe', fNoEmail.allSafe, false);
check('F2 ada risiko email', fNoEmail.risks.some(r => r.indexOf('Email belum diverifikasi') === 0), true);

const fNoDeposit = scoreCard({
  paymentVerified: true, depositMade: false, emailVerified: true,
  identityVerified: true, rating: 4.5, reviewCount: 50, budget: 800,
  description: 'Build a WordPress website with contact form and blog. Clear requirements.',
  memberSince: new Date('2022-01-01'),
}, 'freelancer');
check('F3 deposit belum → risky', fNoDeposit.level, 'risky');
check('F3 allSafe', fNoDeposit.allSafe, false);

const fScam = scoreCard({
  paymentVerified: false, depositMade: false, emailVerified: false,
  identityVerified: false, rating: 0, reviewCount: 0, budget: 3000,
  description: 'Easy money! Contact me on telegram @user for details. No experience needed, make $3000 per day.',
  memberSince: new Date('2026-09-01'),
}, 'freelancer');
check('F4 scam → risky', fScam.level, 'risky');

// --- Upwork ---
const uSafe = scoreCard({
  paymentVerified: true, phoneVerified: true, hireRate: 95, lastViewDays: 0.125,
  totalSpent: 25000, rating: 4.8, reviewCount: 60, budget: 3000,
  description: 'Looking for a senior Laravel developer to rebuild our billing module. Full requirements in the attachment.',
}, 'upwork');
check('U1 level', uSafe.level, 'safe');
check('U1 allSafe', uSafe.allSafe, true);
check('U1 jumlah kriteria aman', uSafe.safeCriteria.length, 4);

const uHireLow = scoreCard({
  paymentVerified: true, phoneVerified: true, hireRate: 88, lastViewDays: 0.5,
  totalSpent: 25000, rating: 4.8, reviewCount: 60, budget: 3000,
  description: 'Looking for a senior Laravel developer to rebuild our billing module. Full requirements in the attachment.',
}, 'upwork');
check('U2 hire rate 88% → bukan safe', uHireLow.level, 'neutral');
check('U2 allSafe', uHireLow.allSafe, false);

const uStale = scoreCard({
  paymentVerified: true, phoneVerified: true, hireRate: 95, lastViewDays: 3,
  totalSpent: 25000, rating: 4.8, reviewCount: 60, budget: 3000,
  description: 'Looking for a senior Laravel developer to rebuild our billing module. Full requirements in the attachment.',
}, 'upwork');
check('U3 last view 3 hari → bukan safe', uStale.level, 'neutral');
check('U3 allSafe', uStale.allSafe, false);

const uNoPhone = scoreCard({
  paymentVerified: true, phoneVerified: false, hireRate: 95, lastViewDays: 0.25,
  totalSpent: 25000, rating: 4.8, reviewCount: 60, budget: 3000,
  description: 'Looking for a senior Laravel developer to rebuild our billing module. Full requirements in the attachment.',
}, 'upwork');
check('U4 phone unverified → bukan safe', uNoPhone.level, 'neutral');
check('U4 allSafe', uNoPhone.allSafe, false);

const uHireExact90 = scoreCard({
  paymentVerified: true, phoneVerified: true, hireRate: 90, lastViewDays: 0.25,
  totalSpent: 25000, rating: 4.8, reviewCount: 60, budget: 3000,
  description: 'Looking for a senior Laravel developer to rebuild our billing module. Full requirements in the attachment.',
}, 'upwork');
check('U5 hire rate tepat 90% → gagal (harus > 90%)', uHireExact90.allSafe, false);

const uLastViewExact2 = scoreCard({
  paymentVerified: true, phoneVerified: true, hireRate: 95, lastViewDays: 2,
  totalSpent: 25000, rating: 4.8, reviewCount: 60, budget: 3000,
  description: 'Looking for a senior Laravel developer to rebuild our billing module. Full requirements in the attachment.',
}, 'upwork');
check('U6 last view tepat 2 hari → gagal (harus < 2)', uLastViewExact2.allSafe, false);

// --- Helper parsing ---
check('H1 parseHireRate "Hire rate: 95%"', parseHireRate('Hire rate: 95%'), 95);
check('H2 parseHireRate "92% hire rate"', parseHireRate('92% hire rate'), 92);
check('H3 parseHireRate tanpa data', parseHireRate('no rate here'), null);
check('H4 parseRelativeTime "3 hours ago" ≈ 0.125', Math.round(parseRelativeTime('3 hours ago') * 1000) / 1000, 0.125);
check('H5 parseRelativeTime "2 days ago"', parseRelativeTime('2 days ago'), 2);
check('H6 parseRelativeTime "just now"', parseRelativeTime('just now'), 0);
check('H7 parseRelativeTime "yesterday"', parseRelativeTime('yesterday'), 1);
check('H8 parseRelativeTime tidak ada', parseRelativeTime('hello world'), null);

// --- Kriteria aman dengan data tidak diketahui (null) → bukan "aman" ---
const uUnknown = scoreCard({
  paymentVerified: true, phoneVerified: null, hireRate: null, lastViewDays: null,
  totalSpent: 1000, rating: 4.5, reviewCount: 10, budget: 500,
  description: 'Some project description that is long enough to not be flagged as vague at all.',
}, 'upwork');
check('U7 data tidak diketahui → bukan safe', uUnknown.allSafe, false);
check('U8 data tidak diketahui → level', uUnknown.level, 'neutral');

// --- Platform tidak dikenal → tidak ada kriteria aman, tidak boleh "safe" ---
const noPlatform = scoreCard({
  paymentVerified: true, rating: 5, reviewCount: 10, budget: 1000,
  description: 'A perfectly fine project description long enough for the vague check to pass.',
}, null);
check('X1 platform null → bukan safe', noPlatform.allSafe, false);
check('X2 platform null → jumlah kriteria 0', noPlatform.safeCriteria.length, 0);

// --- Kriteria aman terpenuhi meski ada risiko ringan (mis. rating 0) → tetap Aman ---
const safeWithMinor = scoreCard({
  paymentVerified: true, depositMade: true, emailVerified: true,
  identityVerified: null, rating: 0, reviewCount: 0, budget: 1500,
  description: 'Develop a React dashboard with authentication, charts, and admin panel. 3 milestones with clear deliverables.',
  memberSince: new Date('2020-05-10'),
}, 'freelancer');
check('X3 kriteria aman penuh + risiko ringan → safe', safeWithMinor.level, 'safe');

// --- Kriteria aman terpenuhi TAPI ada sinyal scam keras → harus Berisiko ---
const safeButScam = scoreCard({
  paymentVerified: true, depositMade: true, emailVerified: true,
  identityVerified: true, rating: 4.9, reviewCount: 127, budget: 1500,
  description: 'Develop a React dashboard. Contact me on telegram @fastdev to start immediately. No experience needed.',
  memberSince: new Date('2020-05-10'),
}, 'freelancer');
check('X4 kriteria aman + minta Telegram → risky', safeButScam.level, 'risky');
check('X5 allSafe tetap true', safeButScam.allSafe, true);

console.log('\n================================');
console.log('HASIL: ' + pass + ' lulus, ' + fail + ' gagal');
console.log('================================');
if (fail > 0) process.exitCode = 1;

