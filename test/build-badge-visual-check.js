// ============================================================
// Generator HTML verifikasi visual penempatan badge.
// Menghasilkan file HTML (dengan CSS asli) berisi mock DOM Upwork &
// Freelancer SETELAH scam-detector.js berjalan, supaya penempatan badge
// bisa diperiksa langsung di browser.
//
// Jalankan: node test/build-badge-visual-check.js
// Output  : test/badge-visual-check.html
// ============================================================

const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'badge-visual-check.html');

const FREELANCER_LIST = `
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
    <h2 class="JobSearchCard-primary-heading">
      <a href="/projects/mobile-app-02">Mobile App Development for European Logistics</a>
    </h2>
    <p class="JobSearchCard-primary-description">Flutter or React Native developer needed for a tracking application.</p>
  </div>
  <div class="right-col">
    <div class="JobSearchCard-primary-price">&euro;250 - &euro;750 EUR</div>
  </div>
</div>`;

const UPWORK_LIST = `
<article data-test="JobTile" class="job-tile">
  <h2 data-test="job-title">Senior Full-Stack Developer (React + Node.js)</h2>
  <ul class="air3-token-container">
    <li data-test="job-type-label">Hourly: $25.00 - $50.00</li>
  </ul>
</article>
<section class="job-tile air3-card-section" data-ev-job-uid="~01abc999888">
  <h3 class="job-tile-title">
    <a data-test="job-tile-title-link" href="/jobs/~01abc999888">AI Agent &amp; Machine Learning Pipeline</a>
  </h3>
  <ul class="air3-token-container">
    <li data-test="is-fixed-price"><strong data-test="budget">Est. Budget: $3,500</strong></li>
  </ul>
</section>`;

async function render(html, hostname, pathname) {
  const dom = new JSDOM(html, {
    url: 'https://' + hostname + pathname,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const win = dom.window;
  win.chrome = {
    storage: { sync: { get: (k, cb) => cb({ freeupGlobalConfig: {} }) } },
    runtime: { onMessage: { addListener: () => {} }, lastError: null },
  };
  win.eval(fs.readFileSync(path.join(ROOT, 'scam-engine.js'), 'utf8'));
  win.eval(fs.readFileSync(path.join(ROOT, 'scam-detector.js'), 'utf8'));
  await new Promise((r) => setTimeout(r, 80));
  return win.document.body.innerHTML;
}

(async () => {
  const css = fs.readFileSync(path.join(ROOT, 'content-scam.css'), 'utf8');
  const freelancerHtml = await render(FREELANCER_LIST, 'www.freelancer.com', '/projects/');
  const upworkHtml = await render(UPWORK_LIST, 'www.upwork.com', '/ab/jobs/search/');

  const page = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>FreeUp Calc — Verifikasi Visual Penempatan Badge Scam</title>
<style>
${css}
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 24px; }
h2.sec { font-size: 15px; color: #0f172a; margin: 0 0 12px; }
.col { max-width: 760px; }
.JobSearchCard-item { display: flex; justify-content: space-between; gap: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin-bottom: 14px; }
.JobSearchCard-primary { flex: 1; min-width: 0; }
.JobSearchCard-primary-heading a { color: #007fed; text-decoration: none; font-weight: 600; font-size: 16px; }
.JobSearchCard-primary-heading h2 { margin: 0; }
.JobSearchCard-primary-description { font-size: 13px; color: #475569; margin: 8px 0 0; }
.JobSearchCard-primary-price { font-size: 16px; font-weight: 700; color: #007fed; text-align: right; white-space: nowrap; }
.right-col { display: flex; flex-direction: column; align-items: flex-end; }
.job-tile { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin-bottom: 14px; }
.job-tile h2, .job-tile h3 { font-size: 16px; margin: 0; }
.air3-token-container { list-style: none; padding: 0; margin: 10px 0 0; display: flex; gap: 10px; flex-wrap: wrap; font-size: 13px; color: #334155; }
.note { font-size: 12px; color: #64748b; margin: 0 0 18px; }
</style>
</head>
<body>
  <h2 class="sec">BLUE FREELANCER.COM &mdash; badge harus tepat di bawah judul, rata kiri, satu per kartu</h2>
  <p class="note">Kartu pertama memakai div heading; kartu kedua memakai h2 &gt; a. Perhatikan badge tidak menempel di teks judul dan tidak berada di kolom harga.</p>
  <div class="col">${freelancerHtml}</div>

  <h2 class="sec" style="margin-top:28px">GREEN UPWORK.COM &mdash; badge tetap di baris judul (tidak berubah)</h2>
  <p class="note">Kartu pertama memakai h2[data-test=job-title]; kartu kedua memakai h3 &gt; a[data-test=job-tile-title-link].</p>
  <div class="col">${upworkHtml}</div>
</body>
</html>`;

  fs.writeFileSync(OUT, page, 'utf8');
  console.log('OK - file dibuat: ' + OUT);
})();
