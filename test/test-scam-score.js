// Test logika scoring scam detector untuk skenario Freelancer
// Mensimulasikan fungsi scoreCard dari scam-detector.js

const RISK = {
  PAYMENT_UNVERIFIED: { points: 3, label: 'Payment belum diverifikasi' },
  ZERO_SPENT:         { points: 2, label: '$0 total spending (belum pernah bayar)' },
  LOW_SPENT:          { points: 1, label: 'Spending masih sangat kecil (<$100)' },
  NO_RATING:          { points: 1, label: 'Belum ada rating/ulasan klien' },
  EXTERNAL_CONTACT:   { points: 3, label: 'Minta kontak di luar platform (Telegram/WA/email)' },
  UNREALISTIC_BUDGET: { points: 2, label: 'Budget tidak realistis vs. kompleksitas pekerjaan' },
  SUSPICIOUS_PATTERN: { points: 1, label: 'Pola deskripsi mencurigakan' },
  DEPOSIT_NOT_MADE:   { points: 4, label: 'Deposit belum dibuat' },
  IDENTITY_UNVERIFIED:{ points: 1, label: 'Identity belum diverifikasi' },
  NEW_ACCOUNT:        { points: 2, label: 'Akun klien baru (< 6 bulan)' },
  VAGUE_DESCRIPTION:  { points: 1, label: 'Deskripsi proyek terlalu singkat/tidak jelas' },
  TOO_GOOD_TO_BE_TRUE:{ points: 2, label: 'Bayaran terlalu tinggi untuk pekerjaan terlalu mudah' },
};

const OFFPLATFORM_RE = /telegram|whatsapp|wa\.me|signal|line\.me|wechat|\bkik\b|discord\.gg|\bviber\b|gmail\.com|yahoo\.com|hotmail\.com|outlook\.com/i;
const SCAM_WORDS_RE  = /\bupfront\b|\badvance\s+payment\b|\bsend\s+money\b|\bcheck\s+scam\b|\btraining\s+fee\b|\bno\s+experience\s+needed\b.*\$[\d,]+|\beasy\s+money\b|\bwork\s+from\s+home\b.*\$[\d,]+\s*per\s+(day|hour|week)/i;
const TOO_GOOD_RE    = /\b(no\s+experience\s+needed|easy\s+(?:money|job|work|task)|quick\s+money|get\s+paid\s+(?:fast|quickly)|make\s+\$[\d,]+\s+(?:per|a|every)\s+(?:day|hour|week|month)|no\s+skills?\s+required|anyone\s+can\s+do)\b/i;

function scoreCard(data) {
  const risks = [];
  const oks = [];
  let score = 0;

  if (data.paymentVerified === false) { score += RISK.PAYMENT_UNVERIFIED.points; risks.push(RISK.PAYMENT_UNVERIFIED.label); }
  else if (data.paymentVerified === true) oks.push('Payment verified ✓');

  if (data.depositMade === false) { score += RISK.DEPOSIT_NOT_MADE.points; risks.push(RISK.DEPOSIT_NOT_MADE.label); }
  else if (data.depositMade === true) oks.push('Deposit made ✓');

  if (data.identityVerified === false) { score += RISK.IDENTITY_UNVERIFIED.points; risks.push(RISK.IDENTITY_UNVERIFIED.label); }
  else if (data.identityVerified === true) oks.push('Identity verified ✓');

  if (data.totalSpent !== null && data.totalSpent !== undefined) {
    if (data.totalSpent === 0) { score += RISK.ZERO_SPENT.points; risks.push(RISK.ZERO_SPENT.label); }
    else if (data.totalSpent < 100) { score += RISK.LOW_SPENT.points; risks.push(RISK.LOW_SPENT.label); }
    else oks.push('Sudah spent $' + data.totalSpent.toLocaleString() + ' ✓');
  }

  if (data.rating !== null && data.rating !== undefined) {
    if (data.rating === 0 && (data.reviewCount === 0 || data.reviewCount === undefined)) { score += RISK.NO_RATING.points; risks.push(RISK.NO_RATING.label); }
    else if (data.rating > 0) { const revTxt = data.reviewCount ? ' (' + data.reviewCount + ' ulasan)' : ''; oks.push('Rating ' + data.rating.toFixed(1) + '/5.0' + revTxt + ' ✓'); }
  }

  if (data.memberSince instanceof Date && !isNaN(data.memberSince.getTime())) {
    const ageDays = (Date.now() - data.memberSince.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 180) { score += RISK.NEW_ACCOUNT.points; risks.push(RISK.NEW_ACCOUNT.label + ' (bergabung ' + data.memberSince.toLocaleDateString() + ')'); }
    else oks.push('Akun lama ✓');
  }

  if (data.description && OFFPLATFORM_RE.test(data.description)) { score += RISK.EXTERNAL_CONTACT.points; risks.push(RISK.EXTERNAL_CONTACT.label); }
  if (data.description && SCAM_WORDS_RE.test(data.description)) { score += RISK.SUSPICIOUS_PATTERN.points; risks.push(RISK.SUSPICIOUS_PATTERN.label); }
  if (data.description && TOO_GOOD_RE.test(data.description)) { score += RISK.TOO_GOOD_TO_BE_TRUE.points; risks.push(RISK.TOO_GOOD_TO_BE_TRUE.label); }

  if (data.description) {
    const descLen = data.description.trim().length;
    if (descLen > 0 && descLen < 60 && data.budget && data.budget > 100) { score += RISK.VAGUE_DESCRIPTION.points; risks.push(RISK.VAGUE_DESCRIPTION.label); }
  }

  if (data.budget !== null && data.budget !== undefined && data.budget > 0 && data.budget < 5 && !data.isMicrotask) { score += RISK.UNREALISTIC_BUDGET.points; risks.push(RISK.UNREALISTIC_BUDGET.label); }

  let level;
  if (score <= 1) level = 'safe';
  else if (score <= 3) level = 'neutral';
  else level = 'risky';

  return { score, level, risks, oks };
}

// ========= TEST CASES =========
console.log('=== TEST 1: Skenario user (Deposit hijau, akun baru Mar 2026, rating 0, identity belum verified) ===');
const t1 = scoreCard({
  paymentVerified: true,
  depositMade: true,
  identityVerified: false,
  rating: 0,
  reviewCount: 0,
  budget: 500,
  description: 'Build a data center comparison report with PDF deliverables and comparison matrix. Detailed requirements provided.',
  memberSince: new Date('2026-03-20'),
});
console.log('Skor:', t1.score, '| Level:', t1.level);
console.log('OKs:', t1.oks);
console.log('Risks:', t1.risks);

console.log('\n=== TEST 2: Klien aman (semua verified, akun lama, rating bagus) ===');
const t2 = scoreCard({
  paymentVerified: true,
  depositMade: true,
  identityVerified: true,
  rating: 4.9,
  reviewCount: 127,
  budget: 1500,
  description: 'Develop a React dashboard with authentication, charts, and admin panel. 3 milestones with clear deliverables.',
  memberSince: new Date('2020-05-10'),
});
console.log('Skor:', t2.score, '| Level:', t2.level);
console.log('OKs:', t2.oks);
console.log('Risks:', t2.risks);

console.log('\n=== TEST 3: Klien berisiko (deposit belum, minta Telegram, akun baru) ===');
const t3 = scoreCard({
  paymentVerified: false,
  depositMade: false,
  identityVerified: false,
  rating: 0,
  reviewCount: 0,
  budget: 3000,
  description: 'Easy money! Contact me on telegram @user for details. No experience needed, make $3000 per day.',
  memberSince: new Date('2026-09-01'),
});
console.log('Skor:', t3.score, '| Level:', t3.level);
console.log('OKs:', t3.oks);
console.log('Risks:', t3.risks);

console.log('\n=== TEST 4: Deposit belum made saja (faktor paling penting) ===');
const t4 = scoreCard({
  paymentVerified: true,
  depositMade: false,
  identityVerified: true,
  rating: 4.5,
  reviewCount: 50,
  budget: 800,
  description: 'Build a WordPress website with contact form and blog. Clear requirements.',
  memberSince: new Date('2022-01-01'),
});
console.log('Skor:', t4.score, '| Level:', t4.level);
console.log('OKs:', t4.oks);
console.log('Risks:', t4.risks);
