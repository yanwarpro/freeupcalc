// ============================================================
// Test Penempatan Badge Scam Detector (Upwork vs Freelancer)
// Menguji dengan jsdom: apakah badge terpasang pada elemen judul
// yang tepat, TIDAK di dalam wrapper/list, dan TIDAK di kolom kiri.
//
// Jalankan: node test/test-scam-badge-placement.js
// ============================================================

const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + ' → dapat: ' + actual + ', harap: ' + expected); }
}

function checkTrue(name, actual) {
  check(name, !!actual, true);
}

// ─── Harness: jalankan scam-detector.js di jsdom dengan host terpusat ───────
async function runDetector(html, hostname, pathname) {
  const dom = new JSDOM(html, {
    url: 'https://' + hostname + pathname,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const win = dom.window;

  // Stub chrome API
  win.chrome = {
    storage: { sync: { get: (keys, cb) => cb({ freeupGlobalConfig: {} }) } },
    runtime: { onMessage: { addListener: () => {} }, lastError: null },
  };

  // Muat scam-engine.js ke dalam window (menggunakan self sebagai root)
  const engineSrc = fs.readFileSync(path.join(ROOT, 'scam-engine.js'), 'utf8');
  win.eval(engineSrc);

  // Muat scam-parsers.js (urutan sama dengan manifest: engine → parsers → detector)
  const parsersSrc = fs.readFileSync(path.join(ROOT, 'scam-parsers.js'), 'utf8');
  win.eval(parsersSrc);

  const detectorSrc = fs.readFileSync(path.join(ROOT, 'scam-detector.js'), 'utf8');
  win.eval(detectorSrc);

  // Tunggu async IIFE selesai (await chrome.storage.sync.get) + observer tick
  await new Promise((r) => setTimeout(r, 50));

  return win;
}

// ─── Fixture DOM ────────────────────────────────────────────────────────────

// Wrapper list Freelancer: memuat banyak kartu sekaligus (harus DIABUAI)
const FREELANCER_LIST = `
<div class="ProjectSearchResults">
  <div class="JobSearchCard-item">
    <div class="JobSearchCard-primary">
      <div class="JobSearchCard-primary-heading">
        <a href="/projects/build-ecommerce-01">Build an E-Commerce Website with Payment Gateway</a>
      </div>
      <p class="JobSearchCard-primary-description">Need an experienced developer to create an online shop with checkout system.</p>
    </div>
    <div class="right-col">
      <div class="JobSearchCard-primary-price">$250 - $750 USD</div>
    </div>
  </div>
  <div class="JobSearchCard-item">
    <div class="JobSearchCard-primary">
      <div class="JobSearchCard-primary-heading">
        <a href="/projects/mobile-app-02">Mobile App Development for European Logistics</a>
      </div>
      <p class="JobSearchCard-primary-description">Flutter or React Native developer needed for a tracking application.</p>
    </div>
    <div class="right-col">
      <div class="JobSearchCard-primary-price">€250 - €750 EUR</div>
    </div>
  </div>
</div>`;

// Freelancer: kartu dengan heading-level link (h2 > a) — badge harus di bawah heading
const FREELANCER_HEADING_LINK = `
<div class="JobSearchCard-item">
  <div class="JobSearchCard-primary">
    <h2 class="JobSearchCard-primary-heading">
      <a href="/projects/design-brand-kit-03">Design a Brand Kit for a Startup</a>
    </h2>
    <p class="JobSearchCard-primary-description">Need logo, business card and social media templates created.</p>
  </div>
</div>`;

// Upwork: judul resmi di data-test="job-title"
const UPWORK_JOB_TITLE = `
<article data-test="JobTile" class="job-tile">
  <h2 data-test="job-title">Senior Full-Stack Developer (React + Node.js)</h2>
  <ul class="air3-token-container">
    <li data-test="job-type-label">Hourly: $25.00 - $50.00</li>
  </ul>
</article>`;

// Upwork: judul di h3 > a[data-test="job-tile-title-link"]
const UPWORK_TITLE_LINK = `
<section class="job-tile air3-card-section" data-ev-job-uid="~01abc999888">
  <h3 class="job-tile-title">
    <a data-test="job-tile-title-link" href="/jobs/~01abc999888">AI Agent &amp; Machine Learning Pipeline</a>
  </h3>
  <ul class="air3-token-container">
    <li data-test="is-fixed-price"><strong data-test="budget">Est. Budget: $3,500</strong></li>
  </ul>
</section>`;

// Freelancer: wrapper list yang memuat banyak kartu + elemen dalam yang
// juga cocok selector. Badge HARUS satu per kartu, tidak di wrapper.
const FREELANCER_WRAPPER = `
<div class="ProjectSearchResults">
  <div class="JobSearchCard-item">
    <div class="JobSearchCard-primary">
      <div class="JobSearchCard-primary-heading">
        <a href="/projects/wrapper-project-a">Project Alpha with Long Description</a>
      </div>
      <p class="JobSearchCard-primary-description">Detailed description of alpha project for testing purposes.</p>
    </div>
    <div class="right-col">
      <div class="JobSearchCard-primary-price">$100 - $500 USD</div>
      <div class="JobSearchCard-secondary-bids">12 bids</div>
    </div>
  </div>
  <div class="JobSearchCard-item">
    <div class="JobSearchCard-primary">
      <div class="JobSearchCard-primary-heading">
        <a href="/projects/wrapper-project-b">Project Beta with Long Description</a>
      </div>
      <p class="JobSearchCard-primary-description">Detailed description of beta project for testing purposes.</p>
    </div>
    <div class="right-col">
      <div class="JobSearchCard-primary-price">$200 - $900 USD</div>
      <div class="JobSearchCard-secondary-bids">30 bids</div>
    </div>
  </div>
</div>`;

// Freelancer: halaman detail proyek (punya marker DOM + form bid)
const FREELANCER_DETAIL = `
<div class="PageProjectView">
  <h1 class="PageProjectView-title">Build an E-Commerce Website</h1>
  <div data-section="description">Need a full stack developer to build an online shop.</div>
  <form action="/projects/build-ecommerce-01/bid">
    <input name="amount" type="text">
  </form>
</div>`;

// Freelancer: halaman kategori skill — URL punya "/projects/<slug>" TETAPI
// isinya listing kartu, jadi TIDAK boleh dianggap halaman detail.
const FREELANCER_CATEGORY = `
<div class="ProjectSearchResults">
  <div class="JobSearchCard-item">
    <div class="JobSearchCard-primary">
      <div class="JobSearchCard-primary-heading">
        <a href="/projects/category-project-x">Category Listing Project Example</a>
      </div>
      <p class="JobSearchCard-primary-description">Description text for a project inside a category listing page.</p>
    </div>
    <div class="right-col">
      <div class="JobSearchCard-primary-price">$300 - $1,200 USD</div>
    </div>
  </div>
</div>`;

// Upwork: halaman detail proyek (punya client-container + job-description)
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

async function main() {
console.log('=== Freelancer: badge harus di dalam kartu, bukan di wrapper list ===');
{
  const win = await runDetector(FREELANCER_LIST, 'www.freelancer.com', '/projects/');
  const doc = win.document;
  const badges = doc.querySelectorAll('.freeup-badge-wrap');
  check('Jumlah badge = 2 (satu per kartu)', badges.length, 2);

  const listWrapper = doc.querySelector('.ProjectSearchResults');
  check('Badge TIDAK menjadi anak langsung wrapper list', listWrapper.querySelector(':scope > .freeup-badge-wrap') === null, true);

  badges.forEach((b, i) => {
    const card = b.closest('.JobSearchCard-item');
    checkTrue('Badge #' + (i + 1) + ' berada di dalam kartu', card);
    const heading = card.querySelector('.JobSearchCard-primary-heading');
    checkTrue('Badge #' + (i + 1) + ' berada setelah heading judul', heading.compareDocumentPosition(b) & win.Node.DOCUMENT_POSITION_FOLLOWING);
    check('Badge #' + (i + 1) + ' punya data-freeup-platform=freelancer', b.getAttribute('data-freeup-platform'), 'freelancer');
  });

  // Badge harus berada di sibling yang sama dengan heading (bukan di dalam <a>)
  checkTrue('Badge tidak ada di dalam elemen <a>', badges[0].closest('a') === null);

  // Kartu yang diproses harus KARTU UTUH (memuat harga), bukan hanya heading.
  // Kalau yang diproses heading/primary, data harga & bid hilang → skor risk salah.
  const scanned = doc.querySelectorAll('[data-freeup-scanned]');
  check('Jumlah elemen dipindai = 2 (kartu utuh)', scanned.length, 2);
  scanned.forEach((el, i) => {
    checkTrue('Elemen dipindai #' + (i + 1) + ' memuat harga', el.querySelector('.JobSearchCard-primary-price'));
  });
}

console.log('\n=== Freelancer: judul berupa h2 > a ===');
{
  const win = await runDetector(FREELANCER_HEADING_LINK, 'www.freelancer.com', '/projects/');
  const doc = win.document;
  const badges = doc.querySelectorAll('.freeup-badge-wrap');
  check('Jumlah badge = 1', badges.length, 1);
  const h2 = doc.querySelector('h2.JobSearchCard-primary-heading');
  checkTrue('Badge berada setelah h2', h2.compareDocumentPosition(badges[0]) & win.Node.DOCUMENT_POSITION_FOLLOWING);
  checkTrue('Badge tidak di dalam <a>', badges[0].closest('a') === null);
}

console.log('\n=== Upwork: badge tetap di baris judul (tidak berubah) ===');
{
  const win = await runDetector(UPWORK_JOB_TITLE, 'www.upwork.com', '/ab/jobs/search/');
  const doc = win.document;
  const badges = doc.querySelectorAll('.freeup-badge-wrap');
  check('Jumlah badge = 1', badges.length, 1);
  const h2 = doc.querySelector('[data-test="job-title"]');
  checkTrue('Badge berada setelah judul', h2.compareDocumentPosition(badges[0]) & win.Node.DOCUMENT_POSITION_FOLLOWING);
  check('Badge punya data-freeup-platform=upwork', badges[0].getAttribute('data-freeup-platform'), 'upwork');
}

console.log('\n=== Upwork: judul di h3 > a[data-test=job-tile-title-link] ===');
{
  const win = await runDetector(UPWORK_TITLE_LINK, 'www.upwork.com', '/ab/jobs/search/');
  const doc = win.document;
  const badges = doc.querySelectorAll('.freeup-badge-wrap');
  check('Jumlah badge = 1', badges.length, 1);
  const h3 = doc.querySelector('h3.job-tile-title');
  checkTrue('Badge berada setelah h3', h3.compareDocumentPosition(badges[0]) & win.Node.DOCUMENT_POSITION_FOLLOWING);
  checkTrue('Badge tidak di dalam <a>', badges[0].closest('a') === null);
}

console.log('\n=== Freelancer: wrapper list multi-proyek tidak boleh diproses ===');
{
  const win = await runDetector(FREELANCER_WRAPPER, 'www.freelancer.com', '/projects/');
  const doc = win.document;
  const badges = doc.querySelectorAll('.freeup-badge-wrap');
  check('Jumlah badge = 2 (satu per kartu)', badges.length, 2);

  const wrapper = doc.querySelector('.ProjectSearchResults');
  check('Badge TIDAK menjadi anak langsung wrapper list', wrapper.querySelector(':scope > .freeup-badge-wrap') === null, true);

  const scanned = doc.querySelectorAll('[data-freeup-scanned]');
  check('Jumlah elemen dipindai = 2', scanned.length, 2);
  scanned.forEach((el, i) => {
    checkTrue('Elemen dipindai #' + (i + 1) + ' adalah kartu utuh (memuat harga)', el.querySelector('.JobSearchCard-primary-price'));
  });

  // Badge harus di dalam kartu, tepat setelah heading judul
  badges.forEach((b, i) => {
    const card = b.closest('.JobSearchCard-item');
    checkTrue('Badge #' + (i + 1) + ' berada di dalam kartu', card);
    const heading = card.querySelector('.JobSearchCard-primary-heading');
    checkTrue('Badge #' + (i + 1) + ' berada setelah heading judul', heading.compareDocumentPosition(b) & win.Node.DOCUMENT_POSITION_FOLLOWING);
    checkTrue('Badge #' + (i + 1) + ' bukan anak langsung heading', heading.querySelector(':scope > .freeup-badge-wrap') === null);
  });
}

console.log('\n=== Freelancer: halaman kategori (/projects/<slug>) tetap diperlakukan sebagai listing ===');
{
  const win = await runDetector(FREELANCER_CATEGORY, 'www.freelancer.com', '/projects/web-developer/');
  const doc = win.document;
  const badges = doc.querySelectorAll('.freeup-badge-wrap');
  check('Jumlah badge = 1 (bukan badge detail di body)', badges.length, 1);

  const card = doc.querySelector('.JobSearchCard-item');
  checkTrue('Badge berada di dalam kartu', badges[0].closest('.JobSearchCard-item') === card);
  const heading = card.querySelector('.JobSearchCard-primary-heading');
  checkTrue('Badge berada setelah heading judul', heading.compareDocumentPosition(badges[0]) & win.Node.DOCUMENT_POSITION_FOLLOWING);
  check('Badge bukan anak langsung <body>', doc.body.querySelector(':scope > .freeup-badge-wrap') === null, true);
}

console.log('\n=== Freelancer: halaman detail proyek tetap dapat 1 badge besar ===');
{
  const win = await runDetector(FREELANCER_DETAIL, 'www.freelancer.com', '/projects/build-ecommerce-01/');
  const doc = win.document;
  const badges = doc.querySelectorAll('.freeup-badge-wrap');
  check('Jumlah badge = 1', badges.length, 1);
  const h1 = doc.querySelector('h1');
  checkTrue('Badge berada setelah judul h1', h1.compareDocumentPosition(badges[0]) & win.Node.DOCUMENT_POSITION_FOLLOWING);
  check('Badge punya data-freeup-platform=freelancer', badges[0].getAttribute('data-freeup-platform'), 'freelancer');
}

console.log('\n=== Upwork: halaman detail proyek dapat 1 badge besar ===');
{
  const win = await runDetector(UPWORK_DETAIL, 'www.upwork.com', '/jobs/apply/~01abc999888/');
  const doc = win.document;
  const badges = doc.querySelectorAll('.freeup-badge-wrap');
  check('Jumlah badge = 1', badges.length, 1);
  const h1 = doc.querySelector('h1[data-test="job-title"]');
  checkTrue('Badge berada setelah judul h1', h1.compareDocumentPosition(badges[0]) & win.Node.DOCUMENT_POSITION_FOLLOWING);
  check('Badge punya data-freeup-platform=upwork', badges[0].getAttribute('data-freeup-platform'), 'upwork');
  checkTrue('Badge memakai kelas badge besar', badges[0].querySelector('.freeup-badge-lg') !== null);
  check('Badge TIDAK menjadi anak langsung <body>', doc.body.querySelector(':scope > .freeup-badge-wrap') === null, true);
}

console.log('\n=== Freelancer: halaman detail tetap dipindai walau `innerText` tidak ada (jsdom) ===');
{
  // Regresi: `h.innerText.trim()` melempar TypeError di jsdom (innerText
  // tidak diimplementasikan). Exception itu tertangkap `catch` dan membuat
  // SELURUH pemindaian detail gagal -> badge tidak pernah terpasang.
  // Fixture ini sengaja tidak punya elemen ber-teks "Open" supaya path
  // yang crash (heading scan + open-button scan) tetap tersentuh.
  const DETAIL_NO_INNER_TEXT = `
<div class="PageProjectView">
  <div class="Project-heading">
    <div class="Project-heading-title">
      <h1 class="text-body-24">Jasa Pembuatan Website Toko Online</h1>
      <h2>$500 - $1,500 USD</h2>
    </div>
  </div>
  <div data-section="description">Butuh developer untuk membangun toko online lengkap.</div>
  <div class="BidCta">Bid on the project</div>
</div>`;

  const win = await runDetector(DETAIL_NO_INNER_TEXT, 'www.freelancer.com', '/projects/toko-online-01/');
  const doc = win.document;

  // Sanity check: jsdom memang tidak menyediakan innerText.
  check('jsdom tidak menyediakan innerText (seperti browser test lama)', win.document.createElement('div').innerText, undefined);

  const badges = doc.querySelectorAll('.freeup-badge-wrap');
  check('Jumlah badge = 1 (pemindaian detail tidak abort)', badges.length, 1);
  check('Badge punya data-freeup-platform=freelancer', badges[0].getAttribute('data-freeup-platform'), 'freelancer');
  checkTrue('Badge memakai kelas badge besar', badges[0].querySelector('.freeup-badge-lg') !== null);

  const h1 = doc.querySelector('h1');
  checkTrue('Badge berada setelah judul h1', h1.compareDocumentPosition(badges[0]) & win.Node.DOCUMENT_POSITION_FOLLOWING);
  check('Badge TIDAK menjadi anak langsung <body>', doc.body.querySelector(':scope > .freeup-badge-wrap') === null, true);
}

console.log('\n================================');
console.log('HASIL: ' + pass + ' lulus, ' + fail + ' gagal');
if (fail > 0) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
