// ============================================================
// Test Integrasi Parser DOM (scam-parsers.js)
// Menguji parser terhadap fixture DOM Upwork & Freelancer,
// lalu memverifikasi output-nya bisa dipakai scam-engine.js.
//
// Jalankan: node test/test-scam-parsers-dom.js
// ============================================================

const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log('  ✅ ' + name + ' → ' + JSON.stringify(actual)); }
  else { fail++; console.log('  ❌ ' + name + ' → dapat: ' + JSON.stringify(actual) + ', harap: ' + JSON.stringify(expected)); }
}

function checkTrue(name, actual) {
  check(name, !!actual, true);
}

// Muat engine + parsers ke dalam window jsdom
function makeWindow(html) {
  const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>', {
    url: 'https://www.upwork.com/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const win = dom.window;
  win.eval(fs.readFileSync(path.join(ROOT, 'scam-engine.js'), 'utf8'));
  win.eval(fs.readFileSync(path.join(ROOT, 'scam-parsers.js'), 'utf8'));
  return win;
}


// ─── Fixture: kartu listing Upwork ──────────────────────────────────────────
const UPWORK_CARD = `
<article data-test="JobTile" class="job-tile">
  <h2 data-test="job-title">Senior React Developer for Fintech Dashboard</h2>
  <p data-test="job-tile-description">
    We need a senior React developer to rebuild our customer portal with a REST API
    backend, Stripe integration, and unit tests. Detailed milestones are attached.
  </p>
  <ul class="air3-token-container">
    <li data-test="budget"><strong>Est. Budget: $3,500</strong></li>
    <li data-test="proposals-count">Proposals: 12</li>
    <li data-test="payment-verified" title="Payment verified">Payment verified</li>
  </ul>
  <div class="client-info">
    <span>Payment verified</span>
    <span>Phone number verified</span>
    <span>Hire rate: 95%</span>
    <span>Viewed 4 hours ago</span>
    <span>$12,000 spent</span>
    <span>4.7 out of 5</span>
  </div>
</article>`;


// ─── Fixture: kartu Upwork dengan tier proposal (50+ / Under / range) ───────
function upworkCardTier(proposalText) {
  return `
<article data-test="JobTile" class="job-tile">
  <h2 data-test="job-title">Senior React Developer for Fintech Dashboard</h2>
  <p data-test="job-tile-description">
    We need a senior React developer to rebuild our customer portal with a REST API
    backend, Stripe integration, and unit tests. Detailed milestones are attached.
  </p>
  <ul class="air3-token-container">
    <li data-test="budget"><strong>Est. Budget: $3,500</strong></li>
    <li data-test="proposals-count">${proposalText}</li>
  </ul>
</article>`;
}

const UPWORK_CARD_TIER = upworkCardTier('50+ proposals');
const UPWORK_CARD_UNDER = upworkCardTier('Under 5 proposals');
const UPWORK_CARD_RANGE = upworkCardTier('10 to 20 proposals');


// ─── Fixture: halaman detail Upwork ─────────────────────────────────────────
const UPWORK_DETAIL = `
<div class="PageProjectView">
  <h1 data-test="job-title">Senior React Developer for Fintech Dashboard</h1>
  <div data-test="job-description">
    We need a senior React developer to rebuild our customer portal with a REST API
    backend, Stripe integration, and unit tests. Detailed milestones are attached.
  </div>
  <div data-test="client-container">
    <span title="Payment verified">Payment verified</span>
    <span title="Phone number verified">Phone number verified</span>
    <span>Hire rate: 95%</span>
    <span>Viewed 4 hours ago</span>
    <span>$12,000 spent</span>
    <span>4.7 out of 5</span>
  </div>
  <ul>
    <li data-test="budget"><strong>Est. Budget: $3,500</strong></li>
    <li data-test="proposals-count">Proposals: 12</li>
  </ul>
</div>`;


// ─── Fixture: kartu listing Freelancer ──────────────────────────────────────
const FREELANCER_CARD = `
<div class="JobSearchCard-item">
  <div class="JobSearchCard-primary">
    <div class="JobSearchCard-primary-heading">
      <a href="/projects/build-ecommerce-01">Build an E-Commerce Website with Payment Gateway</a>
    </div>
    <p class="JobSearchCard-primary-description">
      Need an experienced developer to create an online shop with checkout system,
      product catalog, and admin dashboard. Milestones available.
    </p>
  </div>
  <div class="right-col">
    <div class="JobSearchCard-primary-price">$500 - $1,500 USD</div>
    <div class="JobSearchCard-secondary-bids">Avg Bid $180</div>
  </div>
</div>`;

// ─── Fixture: kartu Freelancer dengan jumlah bid eksplisit ───────────────────
const FREELANCER_CARD_WITH_BIDS = `
<div class="JobSearchCard-item">
  <div class="JobSearchCard-primary">
    <div class="JobSearchCard-primary-heading">
      <a href="/projects/mobile-app-02">Develop Cross Platform Mobile App</a>
    </div>
    <p class="JobSearchCard-primary-description">
      Build a React Native app with push notifications, offline sync, and a
      release pipeline. Weekly milestones and detailed specs are provided.
    </p>
  </div>
  <div class="right-col">
    <div class="JobSearchCard-primary-price">$2,000 - $4,000 USD</div>
    <div class="JobSearchCard-secondary-bids">7 bids - Avg Bid $220</div>
  </div>
</div>`;

// ─── Fixture: halaman detail Freelancer ─────────────────────────────────────
const FREELANCER_DETAIL = `
<div class="PageProjectView">
  <h1>Build an E-Commerce Website with Payment Gateway</h1>
  <div data-section="description">
    Need an experienced developer to create an online shop with checkout system,
    product catalog, and admin dashboard. Milestones available.
  </div>
  <div class="ProjectDetailSidebar">
    <span>Payment verified</span>
    <span>Email verified</span>
    <span>Deposit made</span>
    <span>Member since Jan 12, 2019</span>
    <span>4.9 out of 5</span>
    <span>23 reviews</span>
  </div>
  <div class="JobSearchCard-primary-price">$500 - $1,500 USD</div>

console.log('=== Parser Upwork: kartu listing ===');
{
  const win = makeWindow(UPWORK_CARD);
  const card = win.document.querySelector('[data-test="JobTile"]');
  const out = win.UpworkCalcScamParsers.parseUpworkCard(card, win);

  check('U1 platform', out.platform, 'upwork');
  check('U2 title', out.title, 'Senior React Developer for Fintech Dashboard');
  check('U3 budget', out.budget, 3500);
  check('U4 paymentVerified', out.paymentVerified, true);
  check('U5 phoneVerified', out.phoneVerified, true);
  check('U6 hireRate', out.hireRate, 95);
  check('U7 totalSpent', out.totalSpent, 12000);
  check('U8 rating', out.rating, 4.7);
  check('U9 proposalCount (angka, bukan objek)', out.proposalCount, 12);
  check('U10 proposalTier.exact', out.proposalTier.exact, true);
  check('U11 avgBid null di kartu', out.avgBid, null);
}

console.log('\n=== Parser Upwork: halaman detail ===');
{
  const win = makeWindow(UPWORK_DETAIL);
  const out = win.UpworkCalcScamParsers.parseUpworkDetail(win.document.body, win);

  check('U12 budget', out.budget, 3500);
  check('U13 proposalCount persis', out.proposalCount, 12);
  check('U14 paymentVerified', out.paymentVerified, true);
  check('U15 hireRate', out.hireRate, 95);
  check('U16 memberSince (tidak null)', out.memberSince !== null, true);
}

  <div class="JobSearchCard-secondary-bids">18 bids</div>
</div>`;


console.log('\n=== Parser Freelancer: kartu listing ===');
{
  const win = makeWindow(FREELANCER_CARD);
  const card = win.document.querySelector('.JobSearchCard-item');
  const out = win.UpworkCalcScamParsers.parseFreelancerCard(card, win);

  check('F1 platform', out.platform, 'freelancer');
  check('F2 title', out.title, 'Build an E-Commerce Website with Payment Gateway');
  check('F3 budget (tengah range 500-1500)', out.budget, 1000);
  check('F4 avgBid', out.avgBid, 180);
  check('F5 bidCount null saat tidak ada jumlah bid', out.bidCount, null);
}

console.log('\n=== Parser Freelancer: kartu dengan jumlah bid eksplisit ===');
{
  const win = makeWindow(FREELANCER_CARD_WITH_BIDS);
  const card = win.document.querySelector('.JobSearchCard-item');
  const out = win.UpworkCalcScamParsers.parseFreelancerCard(card, win);

  check('F5a bidCount angka (bukan objek)', out.bidCount, 7);
  check('F5b proposalCount = bidCount', out.proposalCount, 7);
  check('F5c avgBid angka (bukan objek)', typeof out.avgBid, 'number');
  check('F5d avgBid nilai', out.avgBid, 220);
}

console.log('\n=== Parser Freelancer: halaman detail ===');
{
  const win = makeWindow(FREELANCER_DETAIL);
  const out = win.UpworkCalcScamParsers.parseFreelancerDetail(win.document.body, win);

  check('F6 paymentVerified', out.paymentVerified, true);
  check('F7 emailVerified', out.emailVerified, true);
  check('F8 depositMade', out.depositMade, true);
  check('F9 memberSince ada', out.memberSince !== null, true);
  check('F10 bidCount persis', out.bidCount, 18);
  check('F11 budget', out.budget, 1000);
}

console.log('\n=== Integrasi: output parser → scam-engine.js ===');
{
  const win = makeWindow(UPWORK_DETAIL);
  const Engine = win.FreeUpScamEngine;
  const data = win.UpworkCalcScamParsers.parseUpworkDetail(win.document.body, win);
  const result = Engine.scoreCard(data, 'upwork');

  check('I1 level', result.level, 'safe');
  check('I2 allSafe', result.allSafe, true);

console.log('\n=== Integrasi: aturan baru (NO_PROPOSALS / LOW_AVG_BID) ===');
{
  const win = makeWindow(UPWORK_DETAIL);
  const Engine = win.FreeUpScamEngine;

  // Proyek mahal tanpa satu pun proposal → risiko ringan
  const noProposals = Engine.scoreCard({
    budget: 3000, proposalCount: 0, avgBid: null,
    description: 'Build a full marketplace platform with payments and analytics.',
  }, 'upwork');
  check('I4 NO_PROPOSALS menambah 1 poin', noProposals.score, 1);
  checkTrue('I5 label NO_PROPOSALS muncul', noProposals.risks.some(r => r.indexOf('Belum ada proposal') === 0));

  // Proyek murah tanpa proposal → wajar, tidak menambah skor
  const cheap = Engine.scoreCard({
    budget: 50, proposalCount: 0, avgBid: null,
    description: 'Fix a small CSS bug on our landing page.',
  }, 'upwork');
  check('I6 proyek murah tanpa proposal → skor 0', cheap.score, 0);

  // Avg bid jauh di bawah budget
  const lowAvg = Engine.scoreCard({
    budget: 2000, proposalCount: 4, avgBid: 100,
    description: 'Build a full marketplace platform with payments and analytics.',
  }, 'upwork');
  check('I7 LOW_AVG_BID menambah 1 poin', lowAvg.score, 1);
  checkTrue('I8 label LOW_AVG_BID muncul', lowAvg.risks.some(r => r.indexOf('Rata-rata bid') === 0));

  // Avg bid wajar (50% dari budget) → tidak berisiko
  const normalAvg = Engine.scoreCard({
    budget: 2000, proposalCount: 4, avgBid: 1000,
    description: 'Build a full marketplace platform with payments and analytics.',
  }, 'upwork');
  check('I9 avg bid wajar → skor 0', normalAvg.score, 0);

  // proposalCount null (tidak diketahui) → tidak boleh dianggap 0
  const unknown = Engine.scoreCard({
    budget: 3000, proposalCount: null, avgBid: null,
    description: 'Build a full marketplace platform with payments and analytics.',
  }, 'upwork');
  check('I10 proposalCount null → skor 0', unknown.score, 0);
}

console.log('\n=== Integrasi: router parse() ===');
{
  const win = makeWindow(FREELANCER_CARD);
  const card = win.document.querySelector('.JobSearchCard-item');
  const out = win.UpworkCalcScamParsers.parse(card, { platform: 'freelancer', mode: 'card', window: win });
  check('R1 router platform freelancer', out.platform, 'freelancer');
  check('R2 router avgBid', out.avgBid, 180);
}

console.log('\n=== Tier proposal Upwork (kartu listing) ===');
{
  const win = makeWindow(UPWORK_CARD_TIER);
  const card = win.document.querySelector('[data-test="JobTile"]');
  const out = win.UpworkCalcScamParsers.parseUpworkCard(card, win);

  check('T1 proposalCount null (tier, bukan angka persis)', out.proposalCount, null);
  check('T2 proposalTier.exact false', out.proposalTier.exact, false);
  check('T3 proposalTier.min', out.proposalTier.min, 50);
  check('T4 proposalTier.max null ("50+")', out.proposalTier.max, null);
  check('T5 proposalTier.label', out.proposalTier.label, '50+ proposals');
}

console.log('\n=== Tier "Under X proposals" ===');
{
  const win = makeWindow(UPWORK_CARD_UNDER);
  const card = win.document.querySelector('[data-test="JobTile"]');
  const out = win.UpworkCalcScamParsers.parseUpworkCard(card, win);

  check('T6 proposalCount null (tier bawah)', out.proposalCount, null);
  check('T7 proposalTier.min 0', out.proposalTier.min, 0);
  check('T8 proposalTier.max', out.proposalTier.max, 5);
  check('T9 proposalTier.exact false', out.proposalTier.exact, false);
  check('T10 proposalTier.label', out.proposalTier.label, 'Under 5 proposals');
}

console.log('\n=== Tier "10 to 20 proposals" ===');
{
  const win = makeWindow(UPWORK_CARD_RANGE);
  const card = win.document.querySelector('[data-test="JobTile"]');
  const out = win.UpworkCalcScamParsers.parseUpworkCard(card, win);

  check('T11 proposalCount null (tier rentang)', out.proposalCount, null);
  check('T12 proposalTier.min', out.proposalTier.min, 10);
  check('T13 proposalTier.max', out.proposalTier.max, 20);
  check('T14 proposalTier.exact false', out.proposalTier.exact, false);
}

console.log('\n=== Engine: tier TIDAK boleh dianggap 0 proposal ===');
{
  const win = makeWindow(UPWORK_CARD_UNDER);
  const Engine = win.FreeUpScamEngine;
  const card = win.document.querySelector('[data-test="JobTile"]');
  const data = win.UpworkCalcScamParsers.parseUpworkCard(card, win);
  const result = Engine.scoreCard(data, 'upwork');

  checkTrue('T15 tier "Under 5" tidak memicu NO_PROPOSALS',
    !result.risks.some(r => r.indexOf('Belum ada proposal') === 0));
  check('T16 proposalCount null → engine aman dari aturan nol', data.proposalCount, null);
}

console.log('\n=== Engine: batas (threshold) aturan baru ===');
{
  const win = makeWindow(UPWORK_DETAIL);
  const Engine = win.FreeUpScamEngine;
  const base = {
    platform: 'upwork',
    title: 'Senior React Developer for Fintech Dashboard',
    description: 'We need a senior React developer to rebuild our customer portal with a REST API backend, Stripe integration, and unit tests.',
    paymentVerified: true,
    phoneVerified: true,
    hireRate: 95,
    lastViewDays: 0.2,
    totalSpent: 12000,
    rating: 4.7,
  };

  // Batas bawah budget: tepat $500 → TETAP berisiko (>= 500)
  const at500 = Engine.scoreCard({ ...base, budget: 500, proposalCount: 0, avgBid: null }, 'upwork');
  checkTrue('B1 budget tepat $500 + 0 proposal → NO_PROPOSALS',
    at500.risks.some(r => r.indexOf('Belum ada proposal') === 0));

  // Di bawah batas: $499 → tidak berisiko
  const at499 = Engine.scoreCard({ ...base, budget: 499, proposalCount: 0, avgBid: null }, 'upwork');
  checkTrue('B2 budget $499 + 0 proposal → tidak NO_PROPOSALS',
    !at499.risks.some(r => r.indexOf('Belum ada proposal') === 0));

  // Batas bawah avg-bid: budget tepat $100 → TETAP berisiko (>= 100)
  const at100 = Engine.scoreCard({ ...base, budget: 100, proposalCount: 5, avgBid: 19 }, 'upwork');
  checkTrue('B3 budget $100 + avgBid $19 → LOW_AVG_BID',
    at100.risks.some(r => r.indexOf('Rata-rata bid') === 0));

  // Tepat 20% → tidak berisiko (harus < 20%)
  const at20 = Engine.scoreCard({ ...base, budget: 1000, proposalCount: 5, avgBid: 200 }, 'upwork');
  checkTrue('B4 avgBid tepat 20% budget → tidak LOW_AVG_BID',
    !at20.risks.some(r => r.indexOf('Rata-rata bid') === 0));

  // avgBid unknown (null) → tidak boleh dianggap 0
  const unknownBid = Engine.scoreCard({ ...base, budget: 5000, proposalCount: 5, avgBid: null }, 'upwork');
  checkTrue('B5 avgBid null → tidak LOW_AVG_BID',
    !unknownBid.risks.some(r => r.indexOf('Rata-rata bid') === 0));

  // proposalCount unknown (null) → tidak boleh dianggap 0 proposal
  const unknownProp = Engine.scoreCard({ ...base, budget: 5000, proposalCount: null, avgBid: 1000 }, 'upwork');
  checkTrue('B6 proposalCount null → tidak NO_PROPOSALS',
    !unknownProp.risks.some(r => r.indexOf('Belum ada proposal') === 0));

  // proposalCount persis 0 dengan budget besar → tetap 1 poin
  const zero = Engine.scoreCard({ ...base, budget: 5000, proposalCount: 0, avgBid: 4000 }, 'upwork');
  check('B7 proposalCount 0 → tepat 1 risiko (bukan 2)', zero.risks.length, 1);
}

console.log('\n=== Export CommonJS: scam-parsers.js bisa di-require() ===');
{
  const P = require(path.join(ROOT, 'scam-parsers.js'));
  check('E1 module.exports bukan null', P !== null && P !== undefined, true);
  check('E2 typeof P = object', typeof P, 'object');
  check('E3 hasAnyVerification terdefinisi', typeof P.hasAnyVerification, 'function');
  check('E4 parseUpworkCard terdefinisi', typeof P.parseUpworkCard, 'function');
  check('E5 parseUpworkDetail terdefinisi', typeof P.parseUpworkDetail, 'function');
  check('E6 parseFreelancerCard terdefinisi', typeof P.parseFreelancerCard, 'function');
  check('E7 parseFreelancerDetail terdefinisi', typeof P.parseFreelancerDetail, 'function');
  check('E8 parse router terdefinisi', typeof P.parse, 'function');
  check('E9 hasAnyVerification({}) = false', P.hasAnyVerification({}), false);
  check('E10 hasAnyVerification(null) = false', P.hasAnyVerification(null), false);
  check('E11 hasAnyVerification({a:null}) = false', P.hasAnyVerification({ a: null }), false);
  check('E12 hasAnyVerification({a:true}) = true', P.hasAnyVerification({ a: true }), true);
  check('E13 hasAnyVerification({a:false}) = true', P.hasAnyVerification({ a: false }), true);
}

console.log('\n=== Deteksi verifikasi: warna default (hitam) bukan "unverified" ===');
{
  const win = makeWindow('<div id="d"><span title="Payment verified">Payment verified</span></div>');
  const P = win.UpworkCalcScamParsers;
  const el = win.document.querySelector('span');
  // jsdom memakai rgb(0,0,0) sebagai warna teks default → status harus
  // TIDAK boleh ditafsirkan sebagai "belum terverifikasi".
  const status = P.detectVerifiedStatus(el, win);
  check('V1 warna hitam tidak dianggap unverified', status, null);
  check('V2 elemen tanpa class/attribute → null (unknown)', status, null);

  // Abu-abu yang jelas → tetap "unverified"
  const gray = win.document.createElement('span');
  gray.setAttribute('style', 'color: rgb(120, 120, 120)');
  win.document.body.appendChild(gray);
  check('V3 abu-abu gelap → unverified (false)', P.detectVerifiedStatus(gray, win), false);

  // Hijau → verified
  const green = win.document.createElement('span');
  green.setAttribute('style', 'color: rgb(0, 128, 0)');
  win.document.body.appendChild(green);
  check('V4 hijau → verified (true)', P.detectVerifiedStatus(green, win), true);

  // Class "unverified" harus menang atas class "verified" (kalau keduanya ada)
  const both = win.document.createElement('span');
  both.setAttribute('class', 'icon verified unverified');
  win.document.body.appendChild(both);
  check('V5 class "unverified" menang atas "verified"', P.detectVerifiedStatus(both, win), false);

  // Class verified saja
  const ok = win.document.createElement('span');
  ok.setAttribute('class', 'icon-verified');
  win.document.body.appendChild(ok);
  check('V6 class verified → true', P.detectVerifiedStatus(ok, win), true);
}

console.log('\n================================');
console.log('HASIL: ' + pass + ' lulus, ' + fail + ' gagal');
console.log('================================');
if (fail > 0) process.exitCode = 1;

  check('I3 skor 0', result.score, 0);
}
