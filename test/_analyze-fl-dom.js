// Analisis fixture Freelancer: listing vs detail, SPA, dan struktur DOM.
// Jalankan: node test/_analyze-fl-dom.js [file.html ...]
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const TEMP = process.env.TEMP;
const files = process.argv.slice(2).length ? process.argv.slice(2) : [
  'fl_cat.html', 'fl_live.html', 'fl_search.html', 'fl_detail.html',
];

const FREELANCER_CARD_SELECTOR = [
  '.JobSearchCard-item', '.JobSearchCard-item-inner', '[data-project-card]',
  '.job-search-card', '[class*="JobSearchCard"]', '[class*="project-card"]',
  '[class*="ProjectCard"]', '.search-result-item', '.project-list-item',
  '[class*="JobCard"]', '[class*="SearchCard"]', '[class*="job-card"]',
  '[class*="search-card"]', 'fl-search-result-item', 'fl-project-card',
  'fl-job-card', '[data-test*="project-card"]', '[data-test*="job-card"]',
  '[data-test*="search-result"]', 'article[class*="job"]',
  'article[class*="project"]', 'li[class*="job"]', 'li[class*="project"]',
].join(', ');

function loadFile(f) {
  const p = path.isAbsolute(f) ? f : path.join(TEMP, f);
  if (!fs.existsSync(p)) { console.log(f, 'MISSING'); return null; }
  return fs.readFileSync(p, 'utf8');
}

for (const f of files) {
  const html = loadFile(f);
  if (!html) continue;
  const doc = new JSDOM(html).window.document;
  console.log('\n===== ' + f + ' (' + html.length + ' bytes) =====');
  console.log('title        :', doc.title);
  console.log('.JobSearchCard-item    :', doc.querySelectorAll('.JobSearchCard-item').length);
  console.log('selector kartu lengkap :', doc.querySelectorAll(FREELANCER_CARD_SELECTOR).length);
  console.log('a[href*="/projects/"]  :', doc.querySelectorAll('a[href*="/projects/"]').length);
  console.log('a[href*="/contest/"]   :', doc.querySelectorAll('a[href*="/contest/"]').length);
  console.log('form[action*="/bid"]   :', doc.querySelectorAll('form[action*="/bid"]').length);
  console.log('.PageProjectView       :', doc.querySelectorAll('.PageProjectView').length);
  console.log('[data-section="description"] :', doc.querySelectorAll('[data-section="description"]').length);
  console.log('.JobSearchCard-item-inner :', doc.querySelectorAll('.JobSearchCard-item-inner').length);

  const card = doc.querySelector('.JobSearchCard-item');
  if (card) {
    console.log('--- struktur kartu pertama ---');
    const walk = (el, d) => {
      if (d > 3) return;
      [...el.children].forEach(ch => {
        const cls = String(ch.className || '').split(' ').slice(0, 3).join('.');
        console.log('   ' + '  '.repeat(d) + ch.tagName + '.' + cls);
        walk(ch, d + 1);
      });
    };
    walk(card, 0);
    const links = [...card.querySelectorAll('a[href*="/projects/"], a[href*="/contest/"]')]
      .map(a => a.getAttribute('href'));
    console.log('   link proyek/kontest:', links.join('  '));
  } else {
    const big = [...doc.querySelectorAll('h1, h2, h3, [class*="title" i]')]
      .map(e => e.tagName + ':' + (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 45))
      .filter(s => s.length > 6).slice(0, 14);
    console.log('--- judul kandidat (detail) ---');
    big.forEach(s => console.log('   ', s));
  }
}

function runDetector(sourceHtml, url) {
  const dom = new JSDOM(sourceHtml, {
    url,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const win = dom.window;
  win.chrome = {
    storage: { sync: { get: (k, cb) => cb({ freeupGlobalConfig: {} }) } },
    runtime: { onMessage: { addListener: () => {} }, lastError: null },
  };
  win.eval(fs.readFileSync(path.join(ROOT, 'scam-engine.js'), 'utf8'));
  win.eval(fs.readFileSync(path.join(ROOT, 'scam-parsers.js'), 'utf8'));
  win.eval(fs.readFileSync(path.join(ROOT, 'scam-detector.js'), 'utf8'));
  return win;
}

const RE_OLD = /\/projects?\/([^/?#]+)/i;                 // kategori (BUG LAMA)
const RE_NEW = /\/projects?\/(?:[^/]+\/)?([^/?#]+)/i;     // slug (PERBAIKAN)

function idSet(card, re) {
  const set = new Set();
  card.querySelectorAll('a[href*="/projects/"], a[href*="/project/"]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const m = href.match(re);
    set.add(m ? m[1].toLowerCase() : href.toLowerCase());
  });
  return set;
}

console.log('\n\n############ DETECTOR vs FIXTURE ############');

const TARGETS = [
  ['fl_cat.html', 'https://www.freelancer.com/projects/web-developer/'],
  ['fl_live.html', 'https://www.freelancer.com/jobs/'],
  ['fl_search.html', 'https://www.freelancer.com/jobs/'],
  ['fl_detail.html', 'https://www.freelancer.com/projects/build-ecommerce-01/'],
];

for (const [fname, url] of TARGETS) {
  const html = loadFile(fname);
  if (!html) continue;

  const d0 = new JSDOM(html).window.document;
  console.log('\n===== ' + fname + ' =====');
  console.log('title                 :', d0.title);
  console.log('.JobSearchCard-item   :', d0.querySelectorAll('.JobSearchCard-item').length);
  console.log('.JobSearchCard-list   :', d0.querySelectorAll('.JobSearchCard-list').length);
  console.log('a[href*="/projects/"] :', d0.querySelectorAll('a[href*="/projects/"]').length);
  console.log('a[href*="/contest/"]  :', d0.querySelectorAll('a[href*="/contest/"]').length);
  console.log('a[href*="/project/"]  :', d0.querySelectorAll('a[href*="/project/"]').length);
  const sampleHrefs = [...d0.querySelectorAll('a[href*="/projects/"]')].slice(0, 6).map((a) => a.getAttribute('href'));
  console.log('contoh href /projects/:', sampleHrefs.join('  '));

  const cards0 = [...d0.querySelectorAll('.JobSearchCard-item')];

  [['LAMA (kategori)', RE_OLD], ['BARU (slug)', RE_NEW]].forEach(([label, re]) => {
    const groups = new Map();
    cards0.forEach((c) => idSet(c, re).forEach((id) => {
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(c);
    }));
    const collided = [...groups.entries()].filter(([, v]) => v.length > 1);
    console.log(`  regex ${label}: id unik=${groups.size} bentrok=${collided.length}` +
      (collided.length ? ' -> ' + collided.map(([id, v]) => `${id}(${v.length})`).join(', ') : ''));
  });

  const win = runDetector(html, url);
  setTimeout(() => {
    const doc = win.document;
    const cards = [...doc.querySelectorAll('.JobSearchCard-item')];
    const badges = doc.querySelectorAll('.freeup-badge-wrap');

    console.log('\n=== HASIL DETECTOR (scam-detector.js asli) ===');
    console.log('kartu            :', cards.length);
    console.log('badge total      :', badges.length);
    console.log('elemen dipindai  :', doc.querySelectorAll('[data-freeup-scanned]').length);

    const noBadge = cards.filter((c) => !c.querySelector('.freeup-badge-wrap'));
    console.log('kartu tanpa badge:', noBadge.length);

    noBadge.slice(0, 4).forEach((c, i) => {
      console.log(`\n  [kartu tanpa badge #${i}]`);
      console.log('    class   :', c.className);
      console.log('    SEMUA <a> di kartu:');
      [...c.querySelectorAll('a')].forEach((a) => {
        console.log('       href=', a.getAttribute('href'), '| text=', (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60));
      });
      console.log('    id LAMA :', [...idSet(c, RE_OLD)].join(' | '));
      console.log('    id BARU :', [...idSet(c, RE_NEW)].join(' | '));
      console.log('    text    :', (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300));
      console.log('    parent  :', c.parentElement ? c.parentElement.tagName + '.' + c.parentElement.className : '-');
    });

    const orphan = [...badges].filter((b) => !b.closest('.JobSearchCard-item'));
    console.log('\nbadge di luar kartu:', orphan.length);

    const multi = cards.filter((c) => c.querySelectorAll('.freeup-badge-wrap').length > 1);
    console.log('kartu dengan >1 badge:', multi.length);
    multi.slice(0, 5).forEach((c) => console.log('   ->', c.querySelectorAll('.freeup-badge-wrap').length, 'badge'));
  }, 800);
}
