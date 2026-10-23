/*
 * FreeUp Calc — Scam Detector
 * Diinjeksikan ke halaman listing Upwork & Freelancer.com
 * Memindai setiap kartu proyek dan menambahkan badge risiko.
 *
 * Kriteria "AMAN" (kategori hijau) per platform:
 *  Freelancer.com : Payment verified + Email verified + Deposit made
 *  Upwork.com     : Payment verified + Hire rate > 90% + Last view < 2 hari
 *                   + Phone number verified
 *
 * Kriteria penilaian tambahan (menaikkan skor risiko):
 *  1. Status verifikasi klien (Payment verified, Deposit made, Identity verified, dll)
 *  2. Rating & jumlah ulasan klien
 *  3. Usia akun (Member since) — akun baru = waspada fake account
 *  4. Kejelasan ruang lingkup / deskripsi proyek
 *  5. Aturan komunikasi (minta kontak di luar platform = red flag)
 */
(async function () {
  'use strict';

  // ─── Cek apakah fitur aktif dari storage ─────────────────────────────────────
  function isEnabled() {
    return new Promise((resolve) => {
      const resolveFromStorage = (result) => {
        const cfg = result.freeupGlobalConfig || {};
        const enabled = cfg.scamDetector ? cfg.scamDetector.enabled !== false : true;
        resolve(enabled);
      };

      // Storage kadang belum tersedia pada execution context tertentu.
      // Tetap jalankan detector dengan default aktif dan hindari unhandled
      // rejection yang menghentikan inisialisasi content script.
      try {
        const pending = chrome.storage.sync.get('freeupGlobalConfig', (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(true);
            return;
          }
          resolveFromStorage(result || {});
        });
        if (pending && typeof pending.then === 'function') {
          pending.then((result) => resolveFromStorage(result || {}), () => resolve(true));
        }
      } catch (e) {
        resolve(true);
      }
    });
  }

  const enabled = await isEnabled();
  if (!enabled) return;

  const host = location.hostname;
  const getPath = () => location.pathname || '';
  const isUpwork = host.includes('upwork.com');
  const isFreelancer = host.includes('freelancer.com');
  if (!isUpwork && !isFreelancer) return;

  // Key platform untuk lookup kriteria "aman"
  const PLATFORM = isFreelancer ? 'freelancer' : 'upwork';
  let activeUpworkTooltip = null;

  // ─── Selector kartu proyek Freelancer ───────────────────────────────────────
  // Daftar luas untuk menangkap berbagai versi DOM Freelancer.
  // Dipakai bersama oleh deteksi jenis halaman dan pemindaian listing.
  const FREELANCER_CARD_SELECTOR = [
    '.JobSearchCard-item',
    '.JobSearchCard-item-inner',
    '[data-project-card]',
    '.project-contest-card',
    '[class*="project-contest-card" i]',
    '.job-search-card',
    '[class*="JobSearchCard"]',
    '[class*="project-card"]',
    '[class*="ProjectCard"]',
    '.search-result-item',
    '.project-list-item',
    '[class*="JobCard"]',
    '[class*="SearchCard"]',
    '[class*="job-card"]',
    '[class*="search-card"]',
    'fl-search-result-item',
    'fl-project-card',
    'fl-job-card',
    '[data-test*="project-card"]',
    '[data-test*="job-card"]',
    '[data-test*="search-result"]',
    'article[class*="job"]',
    'article[class*="project"]',
    'li[class*="job"]',
    'li[class*="project"]',
  ].join(', ');

  // ─── Deteksi jenis halaman Freelancer (detail vs listing) ──────────────────
  // URL SAJA tidak cukup untuk membedakan, karena semua bentuk URL ini
  // sama-sama punya segmen "/projects/<x>":
  //   /projects/                  → listing (browse)
  //   /projects/web-developer/    → listing (kategori skill)
  //   /projects/awesome-my-app/   → detail proyek
  // Karena itu jenis halaman ditentukan dari isi DOM; URL hanya petunjuk
  // terakhir. Ini penting: kalau listing salah dianggap detail, badge
  // disisipkan ke <body> (muncul di luar kartu, bukan per kartu).
  function isFreelancerDetailPage() {
    // Marker detail yang kuat bisa dirender di open Shadow DOM Freelancer.
    // Periksa sebelum selector kartu karena halaman detail juga dapat memuat
    // rekomendasi proyek berbentuk kartu.
    const strongMarkers = [
      'form[action*="/bid"]',
      '.PageProjectView',
      '[class*="PageProjectView" i]',
      '[class*="BiddingWidget" i]',
    ];
    for (const sel of strongMarkers) {
      if (querySelectorAllDeep(sel).length) return true;
    }

    // URL dua segmen adalah route detail yang tidak dipakai halaman kategori.
    // Cek sebelum kartu karena halaman detail dapat menampilkan rekomendasi
    // proyek yang juga cocok dengan selector kartu listing.
    if (/\/projects\/[^/]+\/[^/]+/i.test(getPath())) return true;

    // Listing DOM menang atas marker deskripsi lemah yang juga dapat muncul
    // pada preview proyek yang dibuka dari daftar.
    if (querySelectorAllDeep(FREELANCER_CARD_SELECTOR).length) return false;

    // URL daftar dan banyak tautan proyek menunjukkan listing meskipun
    // kelas kartu Freelancer berubah atau detail dibuka dalam preview.
    if (/\/(?:jobs|search)(?:\/|$)/i.test(getPath())) return false;
    const projectLinks = querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]');
    if (projectLinks.length >= 3) return false;

    // Beberapa halaman detail Freelancer memakai URL satu segmen. Jika tidak
    // ada kartu listing tetapi konten detail proyek sudah dirender, kenali
    // halaman dari marker judul/deskripsi.
    if (/\/projects\/[^/]+\/?$/i.test(getPath()) && querySelectorAllDeep(
      '[data-test="project-title"], [data-test="project-description"], [data-section="description"], [class*="project-title" i]'
    ).length) return true;

    // URL /projects/<slug> ambigu: Freelancer juga memakai bentuk ini untuk
    // listing kategori. Tanpa marker detail yang kuat, perlakukan sebagai listing.
    return false;

  }

  // ─── Scoring Engine ───────────────────────────────────────────────────────────
  // Logika murni (aturan skor + kriteria "aman") berada di scam-engine.js agar
  // bisa diuji otomatis lewat Node. Modul ini hanya mengonsumsinya.
  const Engine = self.FreeUpScamEngine;
  if (!Engine) {
    console.warn('[FreeUp Scam Detector] scam-engine.js belum termuat — scam detector dilewati.');
    return;
  }

  // ─── Parser DOM per platform (scam-parsers.js) ─────────────────────────────
  // Parser baru menggantikan parser bawaan di file ini. Bila modul belum
  // termuat (mis. content script lama), fallback ke parser bawaan di bawah.
  const Parsers = self.UpworkCalcScamParsers || null;
  const parseHireRate = Engine.parseHireRate;
  const parseRelativeTime = Engine.parseRelativeTime;
  const scoreCard = Engine.scoreCard;

  // ─── Badge HTML ────────────────────────────────────────────────────────────────
  function makeBadge(result, opts) {
    const LABELS = { safe: '🟢 Aman', neutral: '🟡 Perlu Cek', risky: '🔴 Berisiko' };
    const CLASSES = { safe: 'freeup-safe', neutral: 'freeup-neutral', risky: 'freeup-risky' };
    const riskLevel = result.riskLevel || Engine.getRiskLevel(result.score, Engine.hasCriticalRisk(result.risks));
    const riskLevelClass = riskLevel.code === 1 ? 'freeup-risk-level-low'
      : riskLevel.code === 2 ? 'freeup-risk-level-medium'
        : riskLevel.code === 3 ? 'freeup-risk-level-high'
          : 'freeup-risk-level-critical';

    const label = LABELS[result.level];
    const cls = CLASSES[result.level];
    const sizeCls = opts && opts.large ? 'freeup-badge-lg' : '';
    const requirement = opts && opts.requirement;

    const okItems = result.oks.map(o => `<li class="ok">${o}</li>`).join('');
    const riskItems = result.risks.map(r => `<li class="risk">⚠ ${r}</li>`).join('');

    // Blok "Kriteria aman" — menampilkan checklist syarat kategori 🟢
    let safeBlock = '';
    if (result.safeCriteria && result.safeCriteria.length) {
      const items = result.safeCriteria.map(c => {
        const mark = c.pass ? '✓' : (c.known ? '✗' : '-');
        const cls2 = c.pass ? 'ok' : (c.known ? 'risk' : 'unknown');
        const unknownNote = !c.known
          ? (isFreelancer && !isFreelancerDetailPage()
            ? ' (belum diketahui dari kartu; cek detail proyek)'
            : ' (informasi tidak terbaca)')
          : '';
        return `<li class="${cls2}">${mark} ${c.label}${unknownNote}</li>`;
      }).join('');
      const title = result.allSafe
        ? 'Semua kriteria aman terpenuhi'
        : 'Belum memenuhi semua kriteria aman';
      safeBlock = `
        <div style="margin-top:6px;font-weight:600;font-size:11px">Kriteria aman ${result.allSafe ? '✓' : '—'}</div>
        <ul style="margin:2px 0 0">${items}</ul>
        <div style="margin-top:2px;opacity:0.7;font-size:10px">${title}</div>`;
    }

    const requirementItems = requirement ? requirement.messages.map((message) => `<li class="requirement">ℹ ${message}</li>`).join('') : '';
    const tooltipContent = [
      okItems ? `<ul>${okItems}</ul>` : '',
      riskItems ? `<ul>${riskItems}</ul>` : '',
      requirementItems ? `<ul>${requirementItems}</ul>` : '',
      safeBlock,
      `<div style="margin-top:4px;font-weight:600">Level risiko ${riskLevel.code}: ${riskLevel.label}</div>`,
      `<div style="opacity:0.75;font-size:10px">0 rendah · 1–2 sedang · 3 tinggi · >3 sangat tinggi · sinyal kritis = kritis</div>`,
      `<div style="margin-top:4px;opacity:0.6;font-size:10px">Skor risiko: ${result.score} | FreeUp Calc</div>`
    ].join('');

    const wrap = document.createElement('span');
    wrap.className = 'freeup-badge-wrap';
    wrap.setAttribute('data-freeup-platform', PLATFORM);
    wrap.innerHTML = `
      <span class="freeup-badge ${cls} ${sizeCls}">
        ${label}
        <span class="freeup-risk-level ${riskLevelClass}">L${riskLevel.code} ${riskLevel.label}</span>
        ${requirement ? `<span class="freeup-restriction-warning ${requirement.blocked ? 'freeup-restriction-blocked' : ''}" role="img" aria-label="${requirement.blocked ? 'Penawaran dibatasi oleh persyaratan proyek' : 'Peringatan: persyaratan khusus proyek'}" title="${requirement.label}">${requirement.icon || '⚠'}</span>` : ''}
        <span class="freeup-badge-tooltip">${tooltipContent}</span>
      </span>`;

    // Upwork clips descendants of listing cards with overflow. Render its
    // tooltip in the document layer while hovered so it can extend beyond
    // the card boundaries, then return it to the badge on close.
    if (isUpwork) {
      const badge = wrap.querySelector('.freeup-badge');
      const tooltip = wrap.querySelector('.freeup-badge-tooltip');
      const isDetailBadge = () => !!badge.closest('.freeup-detail-badge');
      const closeTooltip = () => {
        if (tooltip.parentElement === document.body) badge.appendChild(tooltip);
        tooltip.style.cssText = 'display:none;';
        if (activeUpworkTooltip === tooltip) activeUpworkTooltip = null;
      };
      tooltip.__freeupCloseTooltip = closeTooltip;
      const hideTooltip = (event) => {
        const nextTarget = event && event.relatedTarget;
        // The tooltip is part of the hover area too, including when portaled
        // into body for listing cards. Close synchronously only after leaving
        // both the badge and tooltip.
        if (nextTarget && nextTarget.nodeType
          && (badge.contains(nextTarget) || tooltip.contains(nextTarget))) return;
        closeTooltip();
      };
      const showTooltip = () => {
        if (activeUpworkTooltip && activeUpworkTooltip !== tooltip
          && typeof activeUpworkTooltip.__freeupCloseTooltip === 'function') {
          activeUpworkTooltip.__freeupCloseTooltip();
        }
        activeUpworkTooltip = tooltip;
        const detailBadge = isDetailBadge();
        // Tooltip detail tetap menjadi anak badge fixed. Dengan begitu mouse
        // leave mengikuti hover CSS normal dan tooltip tidak tertinggal di body.
        if (!detailBadge && tooltip.parentElement !== document.body) document.body.appendChild(tooltip);
        if (detailBadge && tooltip.parentElement === document.body) badge.appendChild(tooltip);
        tooltip.style.cssText = 'display:block;position:fixed;left:0;top:0;bottom:auto;z-index:2147483647;min-width:220px;max-width:min(280px, calc(100vw - 16px));max-height:70vh;overflow:auto;pointer-events:auto;';
        if (detailBadge) {
          tooltip.style.cssText = 'display:block;position:absolute;top:100%;left:0;right:auto;bottom:auto;z-index:2147483647;min-width:220px;max-width:min(280px, calc(100vw - 24px));max-height:70vh;overflow:auto;pointer-events:auto;';
          return;
        }
        const badgeRect = badge.getBoundingClientRect();
        const tipRect = tooltip.getBoundingClientRect();
        const left = Math.max(8, Math.min(badgeRect.left, window.innerWidth - tipRect.width - 8));
        const top = badgeRect.top >= tipRect.height
          ? badgeRect.top - tipRect.height
          : Math.min(window.innerHeight - tipRect.height, badgeRect.bottom);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
      };
      badge.addEventListener('pointerenter', showTooltip);
      badge.addEventListener('pointerleave', hideTooltip);
      tooltip.addEventListener('pointerleave', hideTooltip);
    }
    return wrap;
  }

  // Tandai syarat kelayakan proyek (bukan tingkat risiko scam) dengan
  // indikator biru di dalam badge yang sama.
  function detectFreelancerRequirement(data, container) {
    if (!isFreelancer) return null;
    // Peringatan project dapat dirender di dalam open Shadow DOM Freelancer;
    // textContent pada document.body biasa tidak membaca teks tersebut.
    const rawText = `${data && data.description ? data.description : ''} ${container ? deepTextOf(container) : ''}`;
    const text = rawText
      .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\[nrt]/g, ' ')
      .replace(/\s+/g, ' ');
    const messages = [];
    let label = '';

    const selectedOnly = /(?:only\s+(?:open|available)\s+(?:to|for)\s+(?:select(?:ed)?|shortlisted)\s+freelancers?|(?:open|available)\s+(?:to|for)\s+(?:select(?:ed)?|shortlisted)\s+freelancers?\s+only|selected\s+freelancers?\s+only|only\s+selected\s+freelancers?\s+(?:can|may)\s+(?:apply|bid|submit\s+(?:a\s+)?proposal)|hanya\s+(?:terbuka\s+)?untuk\s+freelancer\s+terpilih|proyek\s+ini\s+hanya\s+terbuka\s+untuk\s+freelancer\s+terpilih)/i.test(text);
    const nearbyOnly = /(?:only\s+freelancers?\s+(?:(?:located|based)\s+)?(?:near|close\s+to|in\s+the\s+vicinity\s+of)\s+(?:the\s+)?(?:project\s+)?location(?:\s+(?:can|may)\s+(?:bid|place\s+bids?|submit\s+proposals?))?|only\s+freelancers?\s+(?:from|within)\s+the\s+project\s+location\s+(?:can|may)\s+bid|hanya\s+freelancers?\s+(?:(?:yang\s+berada\s+)?di\s+dekat|di\s+sekitar)\s+lokasi\s+proyek(?:\s+yang\s+bisa\s+menawar)?)/i.test(text);
    const biddingRestricted = /(?:bidding\s+(?:on|for)\s+this\s+project\s+is\s+restricted|bids?\s+(?:on|for)\s+this\s+project\s+are\s+restricted|penawaran\s+(?:di|untuk)\s+proyek\s+ini\s+(?:dibatasi|terbatas)|proyek\s+ini\s+membatasi\s+penawaran)/i.test(text);
    const minimumBalance = /(?:maintain\s+(?:a\s+)?minimum\s+balance\s+of\s*\$?\s*20(?:\s*USD)?|minimum\s+balance\s+(?:of\s*)?\$?\s*20(?:\s*USD)?|saldo\s+minimum\s+(?:sebesar\s*)?\$?\s*20(?:\s*USD)?)/i.test(text);

    if (selectedOnly) messages.push('Tidak bisa mengajukan penawaran: proyek ini hanya terbuka untuk freelancer terpilih.');
    if (nearbyOnly) messages.push('Penawaran dibatasi untuk freelancer yang berada di dekat lokasi proyek.');
    if (biddingRestricted) messages.push('Penawaran di proyek ini dibatasi; periksa persyaratan proyek sebelum mengajukan penawaran.');
    if (minimumBalance) messages.push('Freelancer.com mensyaratkan saldo minimum $20 USD atau setara untuk membuka penawaran.');
    if (!messages.length) return null;

    if ((selectedOnly || nearbyOnly || biddingRestricted) && minimumBalance) label = '⛔ Ada batasan · saldo $20';
    else if (selectedOnly && nearbyOnly) label = '⛔ Terpilih · lokasi';
    else if (selectedOnly) label = '⛔ Hanya freelancer terpilih';
    else if (nearbyOnly) label = '⛔ Khusus lokasi dekat';
    else if (biddingRestricted) label = '⛔ Penawaran dibatasi';
    else if (minimumBalance) label = '💰 Min. saldo $20';

    const blocked = selectedOnly || nearbyOnly || biddingRestricted;
    return { label, messages, selectedOnly, nearbyOnly, biddingRestricted, blocked, icon: blocked ? '⛔' : '⚠' };
  }

  // Pasang ikon yang sama pada badge yang sudah ada setelah syarat ditemukan
  // dari halaman detail proyek yang dimuat tanpa membuka tab atau mengkliknya.
  function applyRequirementToCard(card, requirement) {
    if (!card || !card.isConnected || !requirement) return;
    const wrap = querySelectorAllDeep('.freeup-badge-wrap', card)[0];
    const badge = wrap && wrap.querySelector('.freeup-badge');
    const tooltip = badge && badge.querySelector('.freeup-badge-tooltip');
    if (!badge || !tooltip) return;

    let icon = badge.querySelector('.freeup-restriction-warning');
    if (!icon) {
      icon = document.createElement('span');
      icon.className = 'freeup-restriction-warning';
      badge.insertBefore(icon, tooltip);
    }
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', requirement.blocked
      ? 'Penawaran dibatasi oleh persyaratan proyek'
      : 'Peringatan: persyaratan khusus proyek');
    icon.title = requirement.label;
    icon.textContent = requirement.icon || '⚠';
    icon.classList.toggle('freeup-restriction-blocked', !!requirement.blocked);

    let list = tooltip.querySelector('ul.freeup-requirement-details')
      || Array.from(tooltip.querySelectorAll('ul')).find((item) => item.querySelector('li.requirement'));
    if (!list) {
      list = document.createElement('ul');
      tooltip.insertBefore(list, tooltip.firstChild);
    }
    list.classList.add('freeup-requirement-details');
    list.replaceChildren(...requirement.messages.map((message) => {
      const item = document.createElement('li');
      item.className = 'requirement';
      item.textContent = `ℹ ${message}`;
      return item;
    }));
  }

  function applyRequirementToListingForCurrentProject(requirement) {
    if (!requirement || !isFreelancer) return;
    const projectUrl = new URL(location.href);
    projectUrl.pathname = projectUrl.pathname.replace(/\/details\/?$/i, '').replace(/\/$/, '');
    projectUrl.search = '';
    projectUrl.hash = '';
    const record = freelancerRequirementLookups.get(projectUrl.href);
    if (!record) return;
    record.requirement = requirement;
    record.cards.forEach((card) => applyRequirementToCard(card, requirement));
  }

  // Perbarui hasil listing dengan verifikasi eksplisit yang ditemukan pada
  // halaman detail. Nilai null di parser berarti tidak ada bukti, jadi jangan
  // mengubah status listing yang sudah diketahui.
  function applyFreelancerVerificationToCard(card, verification) {
    applyFreelancerDetailDataToCard(card, verification);
  }

  function applyFreelancerDetailDataToCard(card, detailData) {
    if (!card || !card.isConnected || !detailData) return;
    const data = card.__freeupScamData;
    if (!data) return;
    let changed = false;
    const keys = [
      'paymentVerified', 'emailVerified', 'depositMade', 'identityVerified',
      'rating', 'reviewCount', 'budget', 'totalSpent', 'memberSince',
      'description', 'isMicrotask',
    ];
    keys.forEach((key) => {
      const value = detailData[key];
      if (value === null || value === undefined || value === '') return;
      if (data[key] !== value) {
        data[key] = value;
        changed = true;
      }
    });
    if (!changed) return;
    const oldWrap = querySelectorAllDeep('.freeup-badge-wrap', card)[0];
    if (!oldWrap) return;
    let requirement = detectFreelancerRequirement(data, card);
    if (!requirement) {
      const projectLink = querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]', card)[0];
      try {
        const projectUrl = new URL(projectLink.getAttribute('href') || projectLink.href, location.href);
        const record = freelancerRequirementLookups.get(normalizeFreelancerProjectUrl(projectUrl.href));
        if (record) requirement = record.requirement;
      } catch (e) { /* proyek tidak memiliki URL yang dapat dibaca */ }
    }
    oldWrap.replaceWith(makeBadge(scoreCard(data, PLATFORM), { requirement }));
  }

  function applyFreelancerDetailDataToListingForCurrentProject(detailData) {
    if (!detailData || !isFreelancer) return;
    const projectUrl = normalizeFreelancerProjectUrl(location.href);
    const record = freelancerRequirementLookups.get(projectUrl);
    if (!record) return;
    record.verification = {
      paymentVerified: detailData.paymentVerified,
      emailVerified: detailData.emailVerified,
      depositMade: detailData.depositMade,
      identityVerified: detailData.identityVerified,
    };
    record.detailData = detailData;
    record.cards.forEach((card) => applyFreelancerDetailDataToCard(card, detailData));
  }

  // Teks pemberitahuan ini hanya tersedia di halaman detail, bukan di kartu
  // hasil pencarian. Ambil halaman detail secara terbatas di latar belakang
  // dan gunakan teks HTML-nya untuk memperkaya badge yang sudah dipasang.
  const freelancerRequirementLookups = new Map();
  const freelancerRequirementQueue = [];
  let activeFreelancerRequirementLookups = 0;
  const MAX_FREELANCER_REQUIREMENT_LOOKUPS = 30;
  const MAX_CONCURRENT_FREELANCER_REQUIREMENT_LOOKUPS = 3;

  function normalizeFreelancerProjectUrl(value) {
    try {
      const url = new URL(value, location.href);
      url.pathname = url.pathname.replace(/\/details\/?$/i, '').replace(/\/$/, '');
      url.search = '';
      url.hash = '';
      return url.href;
    } catch (e) { return ''; }
  }

  function readCachedFreelancerRequirement(projectUrl) {
    try {
      const raw = sessionStorage.getItem(`freeup-scam-requirement:${projectUrl}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function cacheFreelancerRequirement(projectUrl, requirement) {
    if (!projectUrl || !requirement) return;
    try { sessionStorage.setItem(`freeup-scam-requirement:${projectUrl}`, JSON.stringify(requirement)); }
    catch (e) { /* storage browser dapat dinonaktifkan */ }
  }

  function readCachedFreelancerDetailData(projectUrl) {
    try {
      const raw = sessionStorage.getItem(`freeup-scam-detail-data:${projectUrl}`);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.memberSince) data.memberSince = new Date(data.memberSince);
      return data;
    } catch (e) { return null; }
  }

  function cacheFreelancerDetailData(projectUrl, data) {
    if (!projectUrl || !data) return;
    try { sessionStorage.setItem(`freeup-scam-detail-data:${projectUrl}`, JSON.stringify(data)); }
    catch (e) { /* storage browser dapat dinonaktifkan */ }
  }

  function fetchFreelancerProjectHtml(url) {
    return new Promise((resolve) => {
      try {
        const pending = chrome.runtime.sendMessage({ action: 'fetchFreelancerProjectHtml', url }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response && response.ok ? response.html : null);
        });
        if (pending && typeof pending.then === 'function') {
          pending.then((response) => resolve(response && response.ok ? response.html : null), () => resolve(null));
        }
      } catch (e) {
        resolve(null);
      }
    });
  }

  function lookupFreelancerRequirement(card, projectHref) {
    if (!card || !card.isConnected) return;
    const link = projectHref || (querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]', card)[0] || {}).href;
    if (!link) return;

    let url;
    try {
      url = new URL(typeof link === 'string' ? link : (link.getAttribute('href') || link.href), location.href);
    } catch (e) { return; }
    if (!/(^|\.)freelancer\.com$/i.test(url.hostname) || !/^\/projects?\//i.test(url.pathname)) return;
    const key = normalizeFreelancerProjectUrl(url.href);
    if (!key) return;
    const cachedRequirement = readCachedFreelancerRequirement(key);
    const cachedDetailData = readCachedFreelancerDetailData(key);
    if (cachedRequirement) applyRequirementToCard(card, cachedRequirement);
    if (cachedDetailData) applyFreelancerDetailDataToCard(card, cachedDetailData);

    let record = freelancerRequirementLookups.get(key);
    if (record) {
      record.cards.add(card);
      if (cachedRequirement) record.requirement = cachedRequirement;
      if (cachedDetailData) record.detailData = cachedDetailData;
      if (record.done && record.requirement) applyRequirementToCard(card, record.requirement);
      if (record.detailData) applyFreelancerDetailDataToCard(card, record.detailData);
      else if (record.done && record.verification) applyFreelancerVerificationToCard(card, record.verification);
      return;
    }
    if (freelancerRequirementLookups.size >= MAX_FREELANCER_REQUIREMENT_LOOKUPS) return;

    record = { url: key, cards: new Set([card]), done: false, fetched: false, requirement: cachedRequirement, verification: null, detailData: cachedDetailData };
    freelancerRequirementLookups.set(key, record);
    freelancerRequirementQueue.push(record);
    drainFreelancerRequirementQueue();
  }

  function lookupFreelancerRequirementsForListing(cards) {
    const anchors = querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]');
    const assignments = new Map();
    const composedParent = (el) => el.parentElement || (el.getRootNode && el.getRootNode().host) || null;

    for (const anchor of anchors) {
      let urlKey = '';
      try {
        const url = new URL(anchor.getAttribute('href') || anchor.href, location.href);
        url.search = '';
        url.hash = '';
        if (!/(^|\.)freelancer\.com$/i.test(url.hostname) || !/^\/projects?\//i.test(url.pathname)) continue;
        urlKey = url.href;
      } catch (e) { continue; }

      // Pilih kandidat kartu terkecil yang memuat tautan ini, bukan selalu
      // memakai tautan pertama dari container yang mungkin membungkus list.
      const matchingCards = cards.filter((candidate) =>
        querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]', candidate).includes(anchor)
      );
      matchingCards.sort((a, b) => deepTextOf(a).length - deepTextOf(b).length);
      let card = matchingCards[0] || null;

      if (!card) {
        let node = composedParent(anchor);
        for (let depth = 1; node && depth <= 18; depth++, node = composedParent(node)) {
          const links = querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]', node);
          const sameProject = links.some((link) => {
            try {
              const candidateUrl = new URL(link.getAttribute('href') || link.href, location.href);
              candidateUrl.search = '';
              candidateUrl.hash = '';
              return candidateUrl.href === urlKey;
            } catch (e) { return false; }
          });
          if (!sameProject) continue;
          card = node;
          const cls = typeof node.className === 'string' ? node.className : '';
          if (/project-contest-card|project-card|job-card/i.test(cls) || deepTextOf(node).length >= 45) break;
        }
      }

      if (!card) continue;
      if (!assignments.has(urlKey)) assignments.set(urlKey, new Set());
      assignments.get(urlKey).add(card);
    }

    assignments.forEach((projectCards, url) => {
      projectCards.forEach((card) => lookupFreelancerRequirement(card, url));
    });
  }

  function drainFreelancerRequirementQueue() {
    while (activeFreelancerRequirementLookups < MAX_CONCURRENT_FREELANCER_REQUIREMENT_LOOKUPS && freelancerRequirementQueue.length) {
      const record = freelancerRequirementQueue.shift();
      activeFreelancerRequirementLookups++;
      const fetchHtml = (url) => fetchFreelancerProjectHtml(url)
        .then((html) => html || fetch(url, { credentials: 'include', redirect: 'follow' })
          .then((response) => response.ok ? response.text() : ''));
      const parseDetailHtml = (html) => {
        if (!html) return { requirement: null, verification: null };
        const detailDoc = new DOMParser().parseFromString(html, 'text/html');
        const markupText = html.replace(/<[^>]*>/g, ' ');
        let detailData = null;
        try {
          if (Parsers && typeof Parsers.parseFreelancerDetail === 'function') {
            detailData = Parsers.parseFreelancerDetail(detailDoc.body || detailDoc.documentElement, window);
          }
        } catch (e) { /* gunakan teks HTML untuk persyaratan proyek */ }
        return {
          requirement: detectFreelancerRequirement({ description: `${textOf(detailDoc.documentElement)} ${markupText}` }, null),
          verification: detailData ? {
            paymentVerified: detailData.paymentVerified,
            emailVerified: detailData.emailVerified,
            depositMade: detailData.depositMade,
            identityVerified: detailData.identityVerified,
          } : null,
        };
      };
      const detailsUrl = `${record.url.replace(/\/$/, '')}/details`;
      fetchHtml(record.url)
        .then((html) => {
          record.fetched = !!html;
          const result = parseDetailHtml(html);
          const hasVerification = result.verification && Object.values(result.verification).some((value) => value === true || value === false);
          if ((hasVerification && result.requirement) || /\/details$/i.test(new URL(record.url).pathname)) return result;

          // Persyaratan selected-only dan saldo minimum kadang hanya muncul
          // di route /details. Periksa route tersebut meskipun verifikasi
          // sudah berhasil dibaca dari halaman proyek utama.
          return fetchHtml(detailsUrl).then((detailsHtml) => {
            record.fetched = record.fetched || !!detailsHtml;
            if (!detailsHtml) return result;
            const detailsResult = parseDetailHtml(detailsHtml);
            return {
              requirement: detailsResult.requirement || result.requirement,
              verification: Object.fromEntries(Object.keys(result.verification || {}).map((key) => [
                key,
                detailsResult.verification && detailsResult.verification[key] !== null
                  ? detailsResult.verification[key]
                  : result.verification && result.verification[key],
              ])),
            };
          });
        })
        .then((result) => {
          const requirement = result && result.requirement || record.requirement;
          record.requirement = requirement;
          if (requirement) cacheFreelancerRequirement(record.url, requirement);
          record.verification = result && result.verification;
          record.done = true;
          if (result && result.verification) {
            record.cards.forEach((card) => applyFreelancerVerificationToCard(card, result.verification));
          }
          if (requirement) {
            record.cards.forEach((card) => applyRequirementToCard(card, requirement));
            console.info('[FreeUp Scam Detector] Project requirement detected on listing.');
          }
        })
        .catch(() => { record.done = true; })
        .finally(() => {
          activeFreelancerRequirementLookups--;
          if (activeFreelancerRequirementLookups === 0 && freelancerRequirementQueue.length === 0) {
            const records = Array.from(freelancerRequirementLookups.values());
            const fetched = records.filter((item) => item.fetched).length;
            const flagged = records.filter((item) => item.requirement).length;
            console.info(`[FreeUp Scam Detector] Project requirement checks: ${fetched}/${records.length} detail pages loaded; ${flagged} with requirements.`);
          }
          drainFreelancerRequirementQueue();
        });
    }
  }

  // ─── Helper: cek apakah warna elemen hijau (verified) ────────────────────────
  /**
   * Helper: baca teks elemen dengan aman.
   *
   * `innerText` TIDAK diimplementasikan oleh jsdom, sehingga
   * `el.innerText.trim()` melempar TypeError ("Cannot read properties of
   * undefined"). Karena itu setiap pembacaan teks WAJIB memakai accessor
   * ini: pakai `innerText` bila tersedia, jika tidak `textContent`.
   */
  function textOf(el) {
    if (!el) return '';
    const t = (el.innerText != null) ? el.innerText : (el.textContent != null ? el.textContent : '');
    return String(t);
  }

  function isGreenColor(cssColor) {
    if (!cssColor) return false;
    const m = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return false;
    const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
    return g > r && g > b && g >= 100;
  }

  function isGrayColor(cssColor) {
    if (!cssColor) return false;
    const m = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return false;
    const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
    if (Math.abs(r - g) >= 25 || Math.abs(g - b) >= 25) return false;
    // Hitam/nyaris hitam itu warna TEKS DEFAULT (browser & jsdom memakai
    // rgb(0,0,0)), BUKAN penanda "unverified". Hanya abu-abu yang terlihat
    // (>= 60) yang diperlakukan sebagai status unverified.
    return r >= 60 && r < 170;
  }

  // ─── Helper: ekstrak status verifikasi dari kontainer ────────────────────────
  function extractVerifications(container) {
    const result = {
      paymentVerified: null,
      depositMade: null,
      identityVerified: null,
      emailVerified: null,
      phoneVerified: null,
      profileCompleted: null,
    };

    const keywordMap = [
      { key: 'paymentVerified', re: /payment\s+verified/i },
      { key: 'depositMade',     re: /deposit\s+made/i },
      { key: 'identityVerified',re: /identity\s+verified/i },
      { key: 'emailVerified',   re: /email\s+verified/i },
      { key: 'phoneVerified',   re: /phone\s+verified/i },
      { key: 'profileCompleted',re: /profile\s+completed/i },
    ];

    // Strategy 1: elemen dengan title/aria-label (icon badge dengan tooltip)
    const labeledEls = container.querySelectorAll('[title], [aria-label]');
    labeledEls.forEach((el) => {
      const label = (el.getAttribute('title') || el.getAttribute('aria-label') || '');
      for (const { key, re } of keywordMap) {
        if (re.test(label)) {
          const status = detectVerifiedStatus(el);
          if (status !== null) result[key] = status;
        }
      }
    });

    // Strategy 2: innerText untuk pola "X verified" / "X made"
    const text = textOf(container);
    for (const { key, re } of keywordMap) {
      if (re.test(text)) {
        // Jika belum terdeteksi dari icon, cari elemen item untuk cek warna
        if (result[key] === null) {
          const itemEl = findVerificationItem(container, re);
          if (itemEl) {
            const status = detectVerifiedStatus(itemEl);
            result[key] = (status !== null) ? status : true;
          } else {
            result[key] = true; // default: jika tertulis "verified", asumsikan terverifikasi
          }
        }
      }
    }

    return result;
  }

  // Cari elemen item verifikasi yang mengandung teks cocok regex
  function findVerificationItem(container, re) {
    const candidates = container.querySelectorAll('li, div, span, fl-text, p');
    for (const el of candidates) {
      const t = textOf(el);
      if (re.test(t) && t.length < 60) {
        return el;
      }
    }
    return null;
  }

  // Deteksi apakah sebuah badge/verification item berstatus verified (hijau)
  function detectVerifiedStatus(el) {
    // Cek warna langsung dari elemen
    let probe = el;
    // Jika elemen adalah container, cari icon di dalamnya
    const icon = el.querySelector('fl-icon, svg, [class*="icon" i], [class*="Icon"], i, [class*="check" i]');
    if (icon) probe = icon;

    const style = window.getComputedStyle(probe);
    const color = style.color;
    const fill = style.fill;

    if (isGreenColor(color) || isGreenColor(fill)) return true;
    if (isGrayColor(color) || isGrayColor(fill)) return false;

    // Cek class name untuk indikator verified
    const cls = ((probe.className && probe.className.toString) ? probe.className.toString() : '').toLowerCase();
    if (/(verified|success|green|active|check|done|fill|positive)/.test(cls)) return true;
    if (/(unverified|muted|gray|grey|inactive|negative|pending)/.test(cls)) return false;

    // Cek attribute seperti data-state
    const state = probe.getAttribute && (probe.getAttribute('data-state') || probe.getAttribute('data-verified'));
    if (state) {
      if (/true|verified|success/.test(state)) return true;
      if (/false|unverified|pending/.test(state)) return false;
    }

    return null; // tidak bisa ditentukan
  }

  // ─── Helper: parse "Member since" date ───────────────────────────────────────
  function parseMemberSince(text) {
    if (!text) return null;
    const patterns = [
      /member\s+since\s+([a-z]{3,9}\.?\s+\d{1,2},?\s*\d{4})/i,
      /since\s+([a-z]{3,9}\.?\s+\d{1,2},?\s*\d{4})/i,
      /joined\s+(?:on\s+)?([a-z]{3,9}\.?\s+\d{1,2},?\s*\d{4})/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime())) return d;
      }
    }
    return null;
  }

  // ─── UPWORK Parser ─────────────────────────────────────────────────────────────
  function parseUpworkCard(card) {
    // Parser baru (scam-parsers.js) — sumber utama metadata.
    if (Parsers) {
      const parsed = Parsers.parseUpworkCard(card, window);
      if (parsed) return parsed;
    }
    return parseUpworkCardFallback(card);
  }

  /**
   * Parser cadangan Upwork (berbasis regex atas teks kartu).
   * Dipakai hanya bila scam-parsers.js gagal dimuat.
   */
  function parseUpworkCardFallback(card) {
    const text = textOf(card);

    let paymentVerified = null;
    if (/payment\s+verified/i.test(text)) paymentVerified = true;
    else if (/payment\s+unverified|unverified/i.test(text)) paymentVerified = false;
    if (card.querySelector('[data-test="payment-verified"]')) paymentVerified = true;
    if (card.querySelector('[data-test="payment-unverified"]')) paymentVerified = false;

    let totalSpent = null;
    const spentMatch = text.match(/\$([\d,.]+)\s*[kKmM]?\s*(?:total\s+)?spent/i)
      || text.match(/spent\s+\$([\d,.]+)\s*([kKmM]?)/i);
    if (spentMatch) {
      let val = parseFloat(spentMatch[1].replace(/,/g, ''));
      const suffix = (spentMatch[2] || '').toLowerCase();
      if (suffix === 'k') val *= 1000;
      if (suffix === 'm') val *= 1000000;
      totalSpent = val;
    } else if (/\$0\s*spent|\bno\s+payment/i.test(text)) {
      totalSpent = 0;
    }

    let rating = null, reviewCount = 0;
    const ratingMatch = text.match(/([\d.]+)\s*(?:out\s+of\s+5|\/\s*5)/i)
      || text.match(/(?:rating|score)[:\s]*([\d.]+)/i);
    if (ratingMatch) rating = parseFloat(ratingMatch[1]);
    const reviewMatch = text.match(/([\d,]+)\s*(?:review|feedback|job)/i);
    if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);

    let budget = null;
    const budgetMatch = text.match(/(?:budget|fixed)[:\s]*\$\s*([\d,.]+)/i)
      || text.match(/\$\s*([\d,.]+)\s*(?:–|-|to)\s*\$\s*([\d,.]+)\s*\/\s*hr/i)
      || text.match(/est\.\s*budget[:\s]*\$\s*([\d,.]+)/i);
    if (budgetMatch) budget = parseFloat(budgetMatch[1].replace(/,/g, ''));

    // Hire rate (mis. "Hire rate: 95%" atau "95% hire rate")
    const hireRate = parseHireRate(text);

    // Kapan proyek terakhir dilihat (mis. "Viewed 3 hours ago", "Last viewed 2 days ago")
    // Hanya teks yang eksplisit menyebut "viewed"/"seen" agar tidak tertukar
    // dengan "Posted 5 days ago".
    let lastViewDays = null;
    const lastViewMatch = text.match(/(?:last\s*(?:viewed|view)(?:\s+by\s+client)?|viewed|seen)\s*:?\s*(yesterday|just\s*now|\d+\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago)\b/i);
    if (lastViewMatch) lastViewDays = parseRelativeTime(lastViewMatch[1]);

    // Phone number verified (Upwork)
    let phoneVerified = null;
    if (/phone\s+(?:number\s+)?verified/i.test(text)) phoneVerified = true;
    else if (/phone\s+(?:number\s+)?unverified/i.test(text)) phoneVerified = false;
    if (card.querySelector('[data-test="phone-verified"], [data-test="phone-number-verified"]')) phoneVerified = true;
    // Fallback: baca dari icon/badge verifikasi (title/aria-label + warna)
    if (phoneVerified === null) {
      const v = extractVerifications(card);
      if (v.phoneVerified !== null) phoneVerified = v.phoneVerified;
    }

    return {
      paymentVerified, totalSpent, rating, reviewCount, budget,
      description: text, isMicrotask: false,
      depositMade: null, identityVerified: null, memberSince: null,
      emailVerified: null, phoneVerified, hireRate, lastViewDays,
    };
  }

  // ─── Freelancer Parser (card listing) ─────────────────────────────────────────
  function parseFreelancerCard(card) {
    // Parser baru (scam-parsers.js) — sumber utama metadata.
    if (Parsers) {
      const parsed = Parsers.parseFreelancerCard(card, window);
      if (parsed) return parsed;
    }
    return parseFreelancerCardFallback(card);
  }

  /**
   * Parser cadangan Freelancer (berbasis regex atas teks kartu).
   * Dipakai hanya bila scam-parsers.js gagal dimuat.
   */
  function parseFreelancerCardFallback(card) {
    const text = textOf(card);
    const verifications = extractVerifications(card);

    // Budget / bid — ambil angka dollar pertama (budget range)
    let budget = null;
    const budgetMatch = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
    if (budgetMatch) budget = parseFloat(budgetMatch[1].replace(/,/g, ''));

    // Rating — pola "X.X" di dekat bintang atau "/5"
    let rating = null, reviewCount = 0;
    const ratingMatch = text.match(/([\d.]+)\s*\/?\s*5(?!\d)/);
    if (ratingMatch) rating = parseFloat(ratingMatch[1]);
    const reviewMatch = text.match(/([\d,]+)\s*(?:reviews?|feedbacks?)/i);
    if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);

    // Member since (kadang tampil di card client info)
    const memberSince = parseMemberSince(text);

    return {
      paymentVerified: verifications.paymentVerified,
      depositMade: verifications.depositMade,
      identityVerified: verifications.identityVerified,
      emailVerified: verifications.emailVerified,
      totalSpent: null,
      rating,
      reviewCount,
      budget,
      description: text,
      isMicrotask: false,
      memberSince,
    };
  }

  // ─── Helper: querySelectorAll yang juga mencari di dalam shadow DOM (Angular)
  function querySelectorAllDeep(selector, root = document) {
    const results = [];
    const seen = new Set();
    const walk = (node) => {
      if (![Node.ELEMENT_NODE, Node.DOCUMENT_NODE, Node.DOCUMENT_FRAGMENT_NODE].includes(node.nodeType)) return;
      if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot) walk(node.shadowRoot);
      try {
        if (node.nodeType === Node.ELEMENT_NODE && node.matches(selector) && !seen.has(node)) {
          seen.add(node);
          results.push(node);
        }
        const matches = node.querySelectorAll(selector);
        for (const m of matches) {
          if (!seen.has(m)) {
            seen.add(m);
            results.push(m);
          }
        }
      } catch (e) { /* skip invalid selector on this node */ }
      // Cari host shadow hanya sekali untuk subtree ini; menelusuri setiap
      // elemen dan menjalankan querySelectorAll berulang membuat pencarian
      // kuadratik pada halaman Freelancer yang besar.
      try {
        node.querySelectorAll('*').forEach((el) => {
          if (el.shadowRoot) walk(el.shadowRoot);
        });
      } catch (e) { /* root mungkin tidak mendukung selector */ }
    };
    walk(root);
    return results;
  }

  // ─── Freelancer Detail Page Scanner ──────────────────────────────────────────
  function scanFreelancerDetailPage() {
    const requirement = detectFreelancerRequirement(null, document.body);
    const existingDetailBadge = querySelectorAllDeep('.freeup-badge.freeup-badge-lg')[0];
    if (document.body.hasAttribute('data-freeup-detail-scanned') && existingDetailBadge) {
      const existingWrap = existingDetailBadge.closest('.freeup-badge-wrap');
      // Jangan berhenti pada badge lama: panel verifikasi Freelancer dapat
      // muncul belakangan. Buang badge sebelumnya agar scan ini membaca ulang
      // status terbaru dan membangun tooltip yang diperbarui.
      if (existingWrap) existingWrap.remove();
      else existingDetailBadge.remove();
    }
    document.body.removeAttribute('data-freeup-detail-scanned');

    try {
      // Parser baru (scam-parsers.js) membaca metadata detail (verifikasi,
      // member since, rating, budget, avg bid, jumlah bid). Bila modul tidak
      // tersedia, dipakai parser cadangan di bawah.
      let data = null;
      if (Parsers) {
        const parsed = Parsers.parseFreelancerDetail(document.body, window);
        if (parsed) data = parsed;
      }
      if (!data) data = parseFreelancerDetailFallback();

      // Freelancer merender sebagian panel verifikasi di open Shadow DOM.
      // Parser DOM biasa tidak menembus batas itu, meski labelnya terlihat di
      // halaman. Ambil status dari teks aktual yang tampak di seluruh detail.
      data = enrichFreelancerVerificationText(data, document.body);
      cacheFreelancerDetailData(normalizeFreelancerProjectUrl(location.href), data);
      // Simpan hasil detail ke record kartu listing untuk proyek yang sama.
      // Saat pengguna kembali ke daftar, kartu dirender ulang dengan kriteria
      // yang sebelumnya hanya tersedia di halaman detail.
      applyFreelancerDetailDataToListingForCurrentProject(data);

      const result = scoreCard(data, PLATFORM);
      const detailRequirement = detectFreelancerRequirement(data, document.body);
      if (detailRequirement) cacheFreelancerRequirement(normalizeFreelancerProjectUrl(location.href), detailRequirement);
      const badge = makeBadge(result, { large: true, requirement: detailRequirement });
      if (detailRequirement) applyRequirementToListingForCurrentProject(detailRequirement);
      // Tempelkan langsung di documentElement, di luar body/kartu proyek.
      // Posisi fixed membuat badge terlihat walau markup detail berubah atau
      // berada di dalam Shadow DOM.
      badge.classList.add('freeup-detail-badge');
      badge.style.cssText = 'position:fixed;top:14px;right:16px;left:auto;bottom:auto;z-index:2147483647;margin:0;max-width:calc(100vw - 32px);pointer-events:auto;';
      document.documentElement.appendChild(badge);
      document.body.setAttribute('data-freeup-detail-scanned', '1');
    } catch (e) {
      // Jangan gagal diam-diam: dulu error di sini tertutup sehingga badge
      // detail tidak pernah muncul tanpa jejak apa pun.
      console.warn('[FreeUp Scam Detector] Gagal memindai halaman detail Freelancer:', e);
    }
  }

  // Retry scan untuk halaman detail Freelancer (SPA memuat konten secara asinkron).
  // WAJIB dicek isFreelancerDetailPage(): tanpa guard ini, halaman listing
  // pun ikut dipindai dan muncul badge detail yang menyesatkan.
  if (isFreelancer) {
    [1500, 3000, 5000, 8000, 12000, 15000].forEach((delay) => {
      setTimeout(() => {
        if (document.body.hasAttribute('data-freeup-detail-scanned') && querySelectorAllDeep('.freeup-badge.freeup-badge-lg').length) return;
        if (!isFreelancerDetailPage()) return;
        scanFreelancerDetailPage();
      }, delay);
    });
  }

  /**
   * Parser cadangan halaman detail Freelancer (berbasis regex atas teks body).
   * Dipakai hanya bila scam-parsers.js gagal dimuat.
   */
  function parseFreelancerDetailFallback() {
    const bodyText = textOf(document.body);

    // 1. Verifikasi — cari panel client/sidebar
    const verifications = extractVerifications(document.body);

    // 2. Member since
    const memberSince = parseMemberSince(bodyText);

    // 3. Rating & reviews
    let rating = null, reviewCount = 0;
    const ratingMatch = bodyText.match(/([\d.]+)\s*\/?\s*5(?!\d)/);
    if (ratingMatch) rating = parseFloat(ratingMatch[1]);
    const reviewMatch = bodyText.match(/([\d,]+)\s*(?:reviews?|feedbacks?)/i);
    if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);

    // 4. Budget
    let budget = null;
    const budgetMatch = bodyText.match(/(?:budget|project\s+budget|fixed\s+price)[:\s\n]*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)
      || bodyText.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:USD)?/);
    if (budgetMatch) budget = parseFloat(budgetMatch[1].replace(/,/g, ''));

    // 5. Deskripsi proyek — cari section description
    let description = bodyText;
    const descEl = document.querySelector('[class*="description" i], [class*="Description" i], [data-section="description"], .project-description');
    if (descEl) description = textOf(descEl) || bodyText;

    return {
      paymentVerified: verifications.paymentVerified,
      depositMade: verifications.depositMade,
      identityVerified: verifications.identityVerified,
      emailVerified: verifications.emailVerified,
      totalSpent: null,
      rating,
      reviewCount,
      budget,
      description,
      isMicrotask: false,
      memberSince,
    };
  }

  // ─── Inject ke kartu ──────────────────────────────────────────────────────────
  const PROCESSED_ATTR = 'data-freeup-scanned';

  /**
   * Cari elemen anchor untuk penempatan badge.
   * Setiap platform punya struktur HTML berbeda, jadi penempatan dibuat
   * spesifik per platform agar badge selalu:
   *   1. Berada di baris sendiri (tidak menempel di tengah teks judul)
   *   2. Rata kiri, sejajar dengan judul proyek
   *   3. Tidak keluar dari kartu / tidak menempel di kolom kiri list
   */
  function resolveBadgeAnchor(card) {
    if (isUpwork) return resolveUpworkAnchor(card);
    return resolveFreelancerAnchor(card);
  }

  // ─── Upwork: judul ada di <h2 data-test="job-title"> atau heading card ──────
  function resolveUpworkAnchor(card) {
    // 1. Judul resmi Upwork (heading block) → badge di baris bawah judul
    const jobTitle = card.querySelector('[data-test="job-title"], [data-test="job-tile-title"]');
    if (jobTitle) return jobTitle;

    // 2. Link judul → naik ke heading pembungkusnya supaya badge
    //    tidak menyisip di dalam teks judul (inline)
    const titleLink = card.querySelector(
      '[data-test="job-tile-title-link"], a[data-test="job-title"], a[href*="/jobs/~"], a[href*="/jobs/"]'
    );
    if (titleLink) {
      // 2a. Heading semantik (h1–h4) — perilaku asli, dipertahankan
      const heading = titleLink.closest('h1, h2, h3, h4');
      if (heading && heading !== card && !titleLink.contains(heading)) return heading;
      // 2b. Heading berbasis kelas (tidak boleh link itu sendiri)
      const clsHeading = titleLink.closest('[class*="title" i], [class*="header" i]');
      if (clsHeading && clsHeading !== titleLink && clsHeading !== card && !titleLink.contains(clsHeading)) {
        return clsHeading;
      }
      return titleLink;
    }

    // 3. Heading biasa di dalam kartu
    const heading = card.querySelector('h1, h2, h3, h4');
    if (heading) return heading;

    // 4. Kontainer baris metadata (sejak badge harus tetap di dalam kartu)
    const meta = card.querySelector(
      '[data-test="job-tile-info"], [class*="job-tile-info" i], ul[class*="token" i], [class*="description" i]'
    );
    if (meta) return meta;

    return null;
  }

  // ─── Freelancer: judul ada di dalam block heading kartu ────────────────────
  function resolveFreelancerAnchor(card) {
    // 1. Block heading khusus (kelas asli Freelancer)
    const headingBlock = card.querySelector(
      '.JobSearchCard-primary-heading, [class*="primary-heading" i], [class*="project-heading" i], [class*="card-heading" i]'
    );
    if (headingBlock) return headingBlock;

    // 2. Link judul proyek → naik ke heading pembungkusnya (bukan ke <a> itu
    //    sendiri, supaya badge tidak menempel di dalam teks judul)
    const titleLink = card.querySelector('a[href*="/projects/"], a[href*="/project/"]');
    if (titleLink) {
      const heading = titleLink.closest(
        'h1, h2, h3, h4, [class*="heading" i], [class*="title" i], [class*="header" i]'
      );
      if (heading && heading !== titleLink && heading !== card && !titleLink.contains(heading)) return heading;
      return titleLink;
    }

    // 3. Heading biasa
    const heading = card.querySelector('h1, h2, h3, h4');
    if (heading) return heading;

    // 4. Tanpa judul yang bisa diidentifikasi → biarkan fallback di processCard
    //    yang menyisipkan badge sebagai anak pertama kolom utama kartu.
    //    Sengaja TIDAK memakai [class*="primary"] karena itu bisa membuat
    //    badge muncul sebagai kolom tersendiri di sisi kiri kartu.
    return null;
  }

  function getUpworkProjectKey(rootOrUrl) {
    let value = typeof rootOrUrl === 'string' ? rootOrUrl : '';
    const isCardElement = !!(rootOrUrl && typeof rootOrUrl !== 'string' && rootOrUrl.getAttribute);
    if (!value && rootOrUrl && rootOrUrl.getAttribute) {
      // Job links appear as /jobs/~ID, /jobs/details/~ID, and sometimes as a
      // viewer query URL. Resolve each candidate instead of assuming one path.
      const links = querySelectorAllDeep('a[href*="/jobs/"]', rootOrUrl);
      const link = links.find((item) => getUpworkProjectKey(item.getAttribute('href') || item.href)) || null;
      value = link ? (link.getAttribute('href') || link.href) : (rootOrUrl.getAttribute('data-job-uid') || '');
    }
    // Never substitute the current viewer URL for a card with no readable ID:
    // that makes every unidentifiable listing card look like the open project.
    if (!value && isCardElement) return '';
    if (!value) value = location.href;
    try {
      const sourceUrl = new URL(String(value), location.href);
      const viewerState = sourceUrl.searchParams.get('job-details-viewer');
      if (viewerState) {
        const viewer = JSON.parse(viewerState.replace(/\\~/g, '~'));
        const id = String(viewer.ciphertext || '').match(/~?([a-z0-9_-]+)/i);
        if (id) return id[1].split('_')[0].toLowerCase();
      }
      const path = sourceUrl.pathname;
      const explicitJobPath = path.match(/\/jobs\/(?:details\/|apply\/|)~([a-z0-9_-]+)/i)
        || path.match(/\/jobs\/(?:details|apply)\/([a-z0-9_-]{10,})/i)
        || path.match(/\/jobs\/([0-9]{10,})(?:[_/?#-]|$)/i);
      if (explicitJobPath) return explicitJobPath[1].split('_')[0].toLowerCase();
    } catch (e) { /* bukan URL viewer Upwork */ }
    // data-job-uid can itself be a raw Upwork ID (sometimes prefixed with ~).
    const rawId = String(value).match(/^~?([a-z0-9_-]+)$/i);
    if (rawId) return rawId[1].split('_')[0].toLowerCase();
    return '';
  }

  function upworkTitleCacheKey(title) {
    const normalized = String(title || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    return normalized ? `freeup-upwork-detail-title:${normalized}` : '';
  }

  function readCachedUpworkDetailData(projectKey, title) {
    try {
      const titleKey = upworkTitleCacheKey(title);
      const raw = (projectKey && sessionStorage.getItem(`freeup-upwork-detail:${projectKey}`))
        || (titleKey && sessionStorage.getItem(titleKey));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.memberSince) data.memberSince = new Date(data.memberSince);
      return data;
    } catch (e) { return null; }
  }

  function cacheUpworkDetailData(projectKey, data) {
    if (!data) return;
    try {
      const serialized = JSON.stringify(data);
      if (projectKey) sessionStorage.setItem(`freeup-upwork-detail:${projectKey}`, serialized);
      const titleKey = upworkTitleCacheKey(data.title);
      if (titleKey) sessionStorage.setItem(titleKey, serialized);
    }
    catch (e) { /* session storage mungkin dinonaktifkan */ }
  }

  let recentlyOpenedUpworkCard = null;

  function rememberClickedUpworkCard(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    const card = path.find((node) => node && node.nodeType === Node.ELEMENT_NODE
      && node.matches && node.matches('[data-test="job-tile"], .job-tile, [class*="JobTile"], article[data-job-uid], section[data-ev-job-uid]'));
    if (!card) return;
    const link = path.find((node) => node && node.nodeType === Node.ELEMENT_NODE
      && node.matches && node.matches('a[href*="/jobs/"]'));
    const projectKey = (link && getUpworkProjectKey(link.getAttribute('href') || link.href))
      || getUpworkProjectKey(card);
    recentlyOpenedUpworkCard = { card, projectKey, openedAt: Date.now() };
  }

  function mergeUpworkDetailData(target, detailData) {
    if (!target || !detailData) return false;
    let changed = false;
    ['paymentVerified', 'phoneVerified', 'hireRate', 'lastViewDays', 'totalSpent', 'rating', 'reviewCount', 'budget', 'description', 'memberSince', 'proposalCount', 'proposalTier'].forEach((key) => {
      const value = detailData[key];
      if (value === null || value === undefined || value === '') return;
      if (target[key] !== value) {
        target[key] = value;
        changed = true;
      }
    });
    return changed;
  }

  function applyCachedUpworkDetailDataToCard(card) {
    const data = card && card.__freeupScamData;
    if (!data) return;
    const detailData = readCachedUpworkDetailData(getUpworkProjectKey(card), data.title);
    if (!mergeUpworkDetailData(data, detailData)) return;
    const oldWrap = card.querySelector('.freeup-badge-wrap');
    if (oldWrap) oldWrap.replaceWith(makeBadge(scoreCard(data, PLATFORM), {}));
  }

  function refreshUpworkListingCardFromDetail(card, detailData) {
    if (!card || !detailData) return;
    try {
      // Reparse the live card instead of relying on __freeupScamData. Upwork
      // can replace card nodes while keeping the old detector marker/badge,
      // leaving that in-memory object absent or stale.
      const data = parseUpworkCard(card) || card.__freeupScamData;
      if (!data) return;
      card.__freeupScamData = data;
      mergeUpworkDetailData(data, detailData);

      const oldWrap = card.querySelector('.freeup-badge-wrap');
      const newBadge = makeBadge(scoreCard(data, PLATFORM), {});
      if (oldWrap) {
        oldWrap.replaceWith(newBadge);
        card.setAttribute(PROCESSED_ATTR, '1');
      } else {
        // Let the usual insertion logic choose the title anchor.
        card.removeAttribute(PROCESSED_ATTR);
        processCard(card, parseUpworkCard);
      }
    } catch (e) {
      console.warn('[FreeUp Scam Detector] Gagal memperbarui badge listing dari detail Upwork:', e);
    }
  }

  function processCard(card, parser) {
    if (isUpwork && card.querySelector('.freeup-badge-wrap')) {
      applyCachedUpworkDetailDataToCard(card);
      if (card.hasAttribute(PROCESSED_ATTR)) return;
    }
    if (card.hasAttribute(PROCESSED_ATTR) && card.querySelector('.freeup-badge-wrap')) return;
    // Freelancer dapat merender ulang isi kartu tanpa mengganti node kartu.
    // Jika badge hilang tetapi marker tertinggal, izinkan pemasangan ulang.
    if (card.hasAttribute(PROCESSED_ATTR)) card.removeAttribute(PROCESSED_ATTR);
    // Jika pemindaian ulang menemukan ulang kartu yang sama, jangan sisipkan
    // badge kedua (mis. setelah DOM SPA memindahkan elemen).
    if (card.querySelector('.freeup-badge-wrap')) {
      card.setAttribute(PROCESSED_ATTR, '1');
      return;
    }

    try {
      const data = parser(card);
      if (isFreelancer || isUpwork) card.__freeupScamData = data;
      if (isUpwork) mergeUpworkDetailData(data, readCachedUpworkDetailData(getUpworkProjectKey(card), data.title));
      const result = scoreCard(data, PLATFORM);
      const requirement = detectFreelancerRequirement(data, card);
      const badge = makeBadge(result, { requirement });

      // CSS content-script tidak menembus Shadow DOM. Pasang gaya ringkas
      // pada root shadow yang sama agar badge yang ditemukan di sana terlihat.
      const root = card.getRootNode();
      if (root && root !== document && root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !root.querySelector('style[data-freeup-scam-styles]')) {
        const style = document.createElement('style');
        style.setAttribute('data-freeup-scam-styles', '1');
        style.textContent = '.freeup-badge-wrap{display:block;width:max-content;max-width:100%;margin:6px 0 2px;font:12px/1.3 Arial,sans-serif}.freeup-badge{display:inline-flex;align-items:center;gap:4px;position:relative;z-index:10;padding:3px 9px;border:1px solid transparent;border-radius:20px;font-weight:600;white-space:nowrap;cursor:default}.freeup-safe{background:#dcfce7;color:#166534;border-color:#86efac}.freeup-neutral{background:#fef9c3;color:#713f12;border-color:#fde047}.freeup-risky{background:#fee2e2;color:#991b1b;border-color:#fca5a5}.freeup-risk-level{display:inline-block;margin-left:3px;padding-left:6px;border-left:1px solid currentColor;font-size:10px;font-weight:700;opacity:.95}.freeup-risk-level-low{color:#15803d!important}.freeup-risk-level-medium{color:#a16207!important}.freeup-risk-level-high{color:#c2410c!important}.freeup-risk-level-critical{color:#b91c1c!important}.freeup-restriction-warning{display:inline-flex;align-items:center;justify-content:center;margin-left:2px;color:#d97706;font-size:15px;font-weight:800;line-height:1}.freeup-restriction-blocked{color:#b91c1c!important;font-size:14px}.freeup-badge-tooltip{display:none;position:absolute;bottom:calc(100% + 6px);left:0;min-width:220px;max-width:280px;padding:8px 10px;border-radius:8px;background:#1e293b;color:#f1f5f9;white-space:normal;z-index:9999}.freeup-badge:hover .freeup-badge-tooltip{display:block}.freeup-badge-tooltip li.requirement{color:#93c5fd}';
        root.insertBefore(style, root.firstChild);
      }

      const anchor = resolveBadgeAnchor(card);
      if (anchor) {
        anchor.insertAdjacentElement('afterend', badge);
      } else {
        card.insertBefore(badge, card.firstChild);
      }
      card.setAttribute(PROCESSED_ATTR, '1');
    } catch (e) {
      console.warn('[FreeUp Scam Detector] Gagal memproses kartu Freelancer:', e);
    }
  }

  // ─── Deteksi jenis halaman Upwork (detail vs listing) ───────────────────────
  // URL listing: /ab/jobs/search/... , /freelance-jobs/...
  // URL detail : /jobs/apply/<id>_<slug>/ , /jobs/~<id>
  function isUpworkDetailPage() {
    // Upwork juga menampilkan detail sebagai viewer tertanam di halaman
    // pencarian. Pada URL ini path tetap /nx/s/find-work/ dan ID proyek ada
    // di JSON query parameter `job-details-viewer`.
    try {
      const viewerState = new URL(location.href).searchParams.get('job-details-viewer');
      if (viewerState) {
        const viewer = JSON.parse(viewerState.replace(/\\~/g, '~'));
        if (viewer && viewer.ciphertext) {
          // URL pencarian tetap menyimpan parameter viewer setelah dialog
          // ditutup. Anggap detail aktif hanya jika shell viewer masih terlihat.
          return !!findVisibleUpworkDetailRoot();
        }
      }
    } catch (e) { /* abaikan query viewer yang tidak valid */ }

    // 1. Penanda DOM khas halaman detail
    const strongMarkers = [
      '[data-test="client-container"]',
      '[data-test="client-info"]',
      '[data-test="job-description"]',
      '[data-test="proposals-count"]',
      '[data-test="proposal-count"]',
    ];
    for (const sel of strongMarkers) {
      try {
        if (document.querySelector(sel)) return true;
      } catch (e) { /* selector tidak valid → abaikan */ }
    }

    // 2. DOM listing (ada kartu job) → bukan detail
    if (document.querySelector('[data-test="job-tile"], .job-tile, [class*="JobTile"]')) return false;

    // 3. Fallback terakhir: pola URL detail
    return /\/jobs?\/apply\/|\/jobs?\/~[a-z0-9]/i.test(getPath());
  }

  function findVisibleUpworkDetailRoot() {
    const selectors = [
      '[data-test="job-details-viewer"]',
      '[data-test*="job-details-viewer" i]',
      '[data-test="job-details"]',
      '[role="dialog"]',
      '[class*="job-details-viewer" i]',
      '[class*="JobDetailsViewer" i]',
      '[class*="JobDetails" i]',
    ];
    const candidates = [];
    for (const selector of selectors) candidates.push(...querySelectorAllDeep(selector));
    return Array.from(new Set(candidates))
      .filter((el) => {
        if (!el.isConnected || el.getAttribute('aria-hidden') === 'true') return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .sort((a, b) => deepTextOf(b).length - deepTextOf(a).length)[0] || null;
  }

  function findUpworkDetailRoot() {
    const visibleRoot = findVisibleUpworkDetailRoot();
    if (visibleRoot) return visibleRoot;
    const selectors = [
      '[data-test="job-details-viewer"]',
      '[data-test*="job-details-viewer" i]',
      '[data-test="job-details"]',
      '[role="dialog"]',
      '[class*="job-details-viewer" i]',
      '[class*="JobDetailsViewer" i]',
      '[class*="JobDetails" i]',
    ];
    for (const selector of selectors) {
      const matches = querySelectorAllDeep(selector);
      if (!matches.length) continue;
      // Viewer shell biasanya punya teks job + client. Pilih shell terlengkap
      // di antara kecocokan selector spesifik yang sama.
      return matches.sort((a, b) => deepTextOf(b).length - deepTextOf(a).length)[0];
    }
    return document.body;
  }

  // ─── Upwork Detail Page Scanner ───────────────────────────────────────────────
  function scanUpworkDetailPage() {
    const embeddedViewer = (() => {
      try { return !!new URL(location.href).searchParams.get('job-details-viewer'); }
      catch (e) { return false; }
    })();
    const detailRoot = embeddedViewer ? findVisibleUpworkDetailRoot() : findUpworkDetailRoot();
    // Viewer bisa belum terpasang atau sudah ditutup sementara URL SPA belum
    // berubah. Jangan membuat badge detail dari isi halaman listing.
    if (!detailRoot) return;

    if (document.body.hasAttribute('data-freeup-upwork-detail-scanned')) {
      const oldBadge = document.querySelector('.freeup-badge.freeup-badge-lg');
      const oldWrap = oldBadge && oldBadge.closest('.freeup-badge-wrap');
      if (oldWrap) oldWrap.remove();
      else if (oldBadge) oldBadge.remove();
    }
    document.body.removeAttribute('data-freeup-upwork-detail-scanned');
    document.body.setAttribute('data-freeup-upwork-detail-scanned', '1');

    try {
      // Parser baru (scam-parsers.js) — di halaman detail Upwork jumlah
      // proposal tersedia PERSIS, bukan hanya tier.
      let data = null;
      if (Parsers) {
        const parsed = Parsers.parseUpworkDetail(detailRoot, window);
        if (parsed) data = parsed;
      }
      if (!data) data = parseUpworkDetailFallback(detailRoot);

      // Label Last viewed kadang berada di subtree client/shadow yang tidak
      // ikut terbaca oleh textContent parser utama. Ambil teks rendered dari
      // viewer aktif dan parse ulang kriteria ini secara terarah.
      const lastViewDays = getUpworkLastViewDays(detailRoot)
        ?? getUpworkLastViewDaysFromClientPanels(detailRoot)
        ?? (detailRoot === document.body ? null : getUpworkLastViewDaysFromClientPanels(document.body));
      if (lastViewDays !== null) data.lastViewDays = lastViewDays;

      const viewerProjectKey = getUpworkProjectKey(location.href);
      const recentClick = recentlyOpenedUpworkCard
        && Date.now() - recentlyOpenedUpworkCard.openedAt < 60000
        && recentlyOpenedUpworkCard.card.isConnected
        ? recentlyOpenedUpworkCard
        : null;
      const projectKey = viewerProjectKey || (recentClick && recentClick.projectKey) || '';
      const cardProjectKey = recentClick
        ? (recentClick.projectKey || getUpworkProjectKey(recentClick.card))
        : '';
      // Store the same details under both the viewer ID and the listing card
      // ID, since Upwork can encode these IDs through different URL shapes.
      [projectKey, cardProjectKey].filter(Boolean).forEach((key) => cacheUpworkDetailData(key, data));

      // Upwork's embedded details viewer only slides over the existing search
      // page. The listing branch of scanAll() therefore may never run when the
      // viewer closes. Refresh the matching underlying card now, while the
      // listing DOM is still present, and keep the same detail cache for reloads.
      if (projectKey || recentClick) {
        const listingCards = querySelectorAllDeep(
          '[data-test="job-tile"], .job-tile, [class*="JobTile"], article[data-job-uid], section[data-ev-job-uid]'
        );
        const matchingCards = new Set();
        if (recentClick) {
          // A user-initiated viewer belongs to the exact card they opened.
          // Do not fan out to other cards that happen to expose a reused ID.
          matchingCards.add(recentClick.card);
        } else {
          listingCards.forEach((card) => {
            if (getUpworkProjectKey(card) === projectKey) matchingCards.add(card);
          });
        }
        matchingCards.forEach((card) => refreshUpworkListingCardFromDetail(card, data));
      }

      const result = scoreCard(data, PLATFORM);
      const badge = makeBadge(result, { large: true });
      // Letakkan di layer dokumen paling atas agar tidak terpotong atau berada
      // di bawah stacking context overlay detail Upwork.
      badge.classList.add('freeup-detail-badge');
      badge.classList.add('freeup-upwork-detail-badge');
      badge.style.cssText = 'position:fixed;top:12px;left:12px;right:auto;bottom:auto;z-index:2147483647;display:block;width:max-content;max-width:calc(100vw - 24px);margin:0;pointer-events:auto;';
      document.documentElement.appendChild(badge);
    } catch (e) {
      // Silent fail
    }
  }

  function getUpworkLastViewDays(root) {
    if (!root) return null;
    const sources = [deepTextOf(root)];
    if (typeof root.innerText === 'string') sources.push(root.innerText);
    // Upwork sometimes exposes this client signal through an accessible label
    // or title instead of a text node; include those values from the viewer.
    querySelectorAllDeep('[aria-label], [title]', root).forEach((el) => {
      sources.push(el.getAttribute('aria-label') || '', el.getAttribute('title') || '');
    });
    for (const source of sources) {
      if (Parsers && typeof Parsers.parseLastView === 'function') {
        const days = Parsers.parseLastView(source);
        if (days !== null) return days;
      } else if (/(?:last\s*(?:viewed|view)(?:\s+by\s+(?:the\s+)?client)?|viewed|seen)\s*[:\-]?\s*yesterday\b/i.test(source)) {
        return 1;
      }
    }
    return null;
  }

  function getUpworkLastViewDaysFromClientPanels(root) {
    if (!root) return null;
    const panels = querySelectorAllDeep(
      '[data-test*="client-container" i], [data-test*="client-info" i], [data-test*="client-details" i], [class*="client-info" i], [class*="client-details" i], [class*="client-history" i], [class*="about-client" i]',
      root
    ).sort((a, b) => deepTextOf(b).length - deepTextOf(a).length);
    for (const panel of panels) {
      const days = getUpworkLastViewDays(panel);
      if (days !== null) return days;
    }
    return null;
  }

  /**
   * Parser cadangan halaman detail Upwork.
   * Dipakai hanya bila scam-parsers.js gagal dimuat.
   */
  function parseUpworkDetailFallback(root = document.body) {
    const bodyText = textOf(root);
    const verifications = extractVerifications(root);

    let rating = null, reviewCount = 0;
    const ratingMatch = bodyText.match(/([\d.]+)\s*\/?\s*5(?!\d)/);
    if (ratingMatch) rating = parseFloat(ratingMatch[1]);
    const reviewMatch = bodyText.match(/([\d,]+)\s*(?:reviews?|feedbacks?)/i);
    if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);

    let budget = null;
    const budgetMatch = bodyText.match(/(?:budget|fixed\s+price|hourly)[:\s\n]*\$?\s*([\d,]+(?:\.\d{1,2})?)/i)
      || bodyText.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:USD)?/);
    if (budgetMatch) budget = parseFloat(budgetMatch[1].replace(/,/g, ''));

    let description = bodyText;
    const descEl = root.querySelector('[data-test="job-description"], [class*="job-description" i], [class*="description" i]');
    if (descEl) description = textOf(descEl) || bodyText;

    return {
      paymentVerified: verifications.paymentVerified,
      phoneVerified: verifications.phoneVerified,
      depositMade: verifications.depositMade,
      identityVerified: verifications.identityVerified,
      emailVerified: verifications.emailVerified,
      totalSpent: null,
      rating,
      reviewCount,
      budget,
      description,
      isMicrotask: false,
      memberSince: null,
      hireRate: parseHireRate(bodyText),
      lastViewDays: getUpworkLastViewDays(root),
    };
  }

  function scanAll() {
    if (isUpwork) {
      if (isUpworkDetailPage()) {
        scanUpworkDetailPage();
      } else {
        document.querySelectorAll('.freeup-upwork-detail-badge').forEach((el) => el.remove());
        document.body.removeAttribute('data-freeup-upwork-detail-scanned');
        const cards = document.querySelectorAll(
          '[data-test="job-tile"], .job-tile, [class*="JobTile"], article[data-job-uid], section[data-ev-job-uid]'
        );
        cards.forEach(card => processCard(card, parseUpworkCard));
      }
    }

    if (isFreelancer) {
      if (isFreelancerDetailPage()) {
        scanFreelancerDetailPage();
      } else {
        // Freelancer memakai navigasi SPA. Bersihkan badge fixed halaman
        // detail saat route berubah kembali ke listing agar tidak menutupi
        // badge kartu proyek.
        document.querySelectorAll('.freeup-detail-badge').forEach((el) => el.remove());
        document.body.removeAttribute('data-freeup-detail-scanned');

        const projectLinkCount = querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]').length;
        // Freelancer saat ini memakai .project-contest-card sebagai elemen
        // kartu Angular. Proses node kartu tersebut langsung supaya filter
        // kandidat generik tidak membuangnya karena tautan/tag tambahan.
        let cards = Array.from(new Set(querySelectorAllDeep('.project-contest-card, [class*="project-contest-card" i]')))
          .filter((card) => querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]', card).length > 0);

        if (cards.length === 0) {
          cards = querySelectorAllDeep(FREELANCER_CARD_SELECTOR);
          // Saring kandidat generik: buang wrapper list supaya badge tidak
          // keluar dari kartu proyek.
          cards = filterFreelancerCards(cards);
        }

        // Fallback: jika selector di atas tidak menemukan apa pun,
        // cari elemen yang mengandung indikator proyek (Avg Bid / "bids")
        if (cards.length === 0) {
          cards = findFreelancerCardsByContent();
        }
        if (cards.length === 0) {
          cards = findFreelancerCardsGeneric();
        }
        if (cards.length === 0 && projectLinkCount > 0) {
          cards = findFreelancerCardsFromProjectLinks();
        }

        console.log('[FreeUp Scam Detector] Freelancer project links found:', projectLinkCount);
        console.log('[FreeUp Scam Detector] Freelancer cards found:', cards.length);
        cards.forEach((card) => processCard(card, parseFreelancerCard));
        lookupFreelancerRequirementsForListing(cards);
      }
    }
  }

  /**
   * Saring kandidat kartu Freelancer.
   *
   * Freelancer memakai beberapa pola DOM sekaligus (JobSearchCard-item,
   * ProjectCard, fl-project-card, ...). Sebagian pola tersebut juga cocok
   * dengan WRAPPER list, bukan kartu. Akibatnya badge sempat disisipkan
   * sebagai sibling di luar kartu → tampil di kolom kiri list.
   *
   * Aturan filter:
   *  1. Kartu harus punya link proyek (a[href*="/projects/"]).
   *  2. Elemen yang memuat LEBIH DARI SATU proyek → itu wrapper list, dibuang.
   *  3. Satu proyek = satu kartu. Karena rantai elemen Freelancer
   *     (kartu > primary > heading) semuanya cocok dengan selector, yang
   *     dipakai adalah elemen PALING DALAM yang tetap memuat data lengkap
   *     (judul + harga/bid), supaya teks parse tidak kosong.
   */
  function filterFreelancerCards(candidates) {
    const list = Array.from(candidates);
    const kept = [];

    for (const el of list) {
      if (!el.isConnected) continue;

      const links = el.querySelectorAll('a[href*="/projects/"], a[href*="/project/"]');
      if (links.length === 0) continue;

      // Lebih dari satu proyek di dalam satu elemen → itu wrapper list
      if (projectIds(el).size > 1) continue;

      kept.push(el);
    }

    // Kelompokkan kandidat berdasarkan id proyeknya
    const byProject = new Map();
    for (const el of kept) {
      const id = projectIds(el).values().next().value || '';
      if (!byProject.has(id)) byProject.set(id, []);
      byProject.get(id).push(el);
    }

    return Array.from(byProject.values()).map(pickFreelancerCard);
  }

  /**
   * Pilih satu elemen kartu terbaik dari sekumpulan kandidat yang
   * menunjuk proyek yang sama.
   */
  function pickFreelancerCard(group) {
    if (group.length === 1) return group[0];

    // Pilih elemen KARTU (root) yang memuat seluruh kandidat lain dalam
    // grup yang sama, bukan elemen daun seperti blok harga.
    const containsCount = (el) => group.filter((o) => o !== el && el.contains(o)).length;
    let best = group[0];
    for (const el of group) {
      const c = containsCount(el);
      const bestC = containsCount(best);
      if (c > bestC) best = el;
      else if (c === bestC && (el.textContent || '').length > (best.textContent || '').length) best = el;
    }
    if (!best.querySelector('a[href*="/projects/"], a[href*="/project/"]')) {
      return group.reduce((b, el) => (cardScore(el) > cardScore(b) ? el : b));
    }
    return best;
  }

  // Kumpulan id proyek yang ditautkan di dalam sebuah elemen
  function projectIds(el) {
    const ids = new Set();
    el.querySelectorAll('a[href*="/projects/"], a[href*="/project/"]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/projects?\/(?:[^/]+\/)?([^/?#]+)/i);
      ids.add(m ? m[1].toLowerCase() : href.toLowerCase());
    });
    return ids;
  }

  // Skor "seberapa lengkap" sebuah elemen sebagai kartu proyek
  function cardScore(el) {
    const text = textOf(el).trim().length;
    const hasPrice = el.querySelector(
      '[class*="price" i], [class*="budget" i], [class*="bid" i], [class*="rate" i]'
    ) ? 500 : 0;
    const hasDesc = el.querySelector('[class*="description" i], [class*="summary" i]') ? 200 : 0;
    return text + hasPrice + hasDesc;
  }

  // Fallback: deteksi kartu proyek berdasarkan konten teks
  function findFreelancerCardsByContent() {
    const candidates = [];
    const allEls = document.querySelectorAll('div, article, li, section');
    for (const el of allEls) {
      const text = textOf(el);
      if (!text || text.length < 50 || text.length > 2500) continue;
      // Indikator kuat: ada "Avg Bid" atau "X bids" + budget ($)
      const hasBid = /avg\s+bid/i.test(text) || /\b\d+\s+bids?\b/i.test(text) || /bid\s*amount/i.test(text);
      const hasBudget = /[\$₹€£]\s*[\d,]+/.test(text) || /budget/i.test(text) || /hourly/i.test(text) || /fixed\s*price/i.test(text);
      // Wajib ada link ke halaman detail proyek — agar kartu non-proyek
      // (mis. paket membership) tidak salah terdeteksi.
      const hasProjectLink = el.querySelector('a[href*="/projects/"], a[href*="/project/"]');
      const projectLinkCount = el.querySelectorAll('a[href*="/projects/"], a[href*="/project/"]').length;
      if (hasBid && hasBudget && hasProjectLink && projectLinkCount <= 3) {
        candidates.push({ el, len: text.length });
      }
    }
    // Pilih elemen terkecil untuk setiap kartu (hindari container yang membungkus banyak kartu)
    // Sort by length ascending, lalu hilangkan elemen yang merupakan ancestor dari kandidat lain
    candidates.sort((a, b) => a.len - b.len);
    const results = new Set();
    for (const { el } of candidates) {
      // Skip jika elemen ini adalah ancestor dari elemen yang sudah dipilih
      let isAncestor = false;
      for (const picked of results) {
        if (el.contains(picked)) { isAncestor = true; break; }
      }
      if (!isAncestor) results.add(el);
    }
    return Array.from(results);
  }

  // Fallback generik: elemen terkecil yang memuat tepat satu link proyek.
  // Dipakai bila semua selector & fallback konten gagal menemukan kartu.
  function findFreelancerCardsGeneric() {
    const anchors = querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]');
    const bestByProject = new Map();
    const composedParent = (el) => el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
    const projectKey = (href) => {
      const match = String(href || '').match(/\/projects?\/(?:[^/]+\/)?([^/?#]+)/i);
      return match ? match[1].toLowerCase() : '';
    };

    for (const anchor of anchors) {
      const projectId = projectKey(anchor.getAttribute('href') || anchor.href);
      if (!projectId) continue;
      let el = anchor;
      const candidates = [];

      // Naik dari tautan judul menuju container proyek. Freelancer dapat
      // menambahkan beberapa wrapper Angular di antara judul dan kartu, jadi
      // jangan mengasumsikan kartu selalu dekat dengan tautannya. Ikuti host
      // saat parentElement berakhir di batas Shadow DOM.
      for (let depth = 0; el && depth < 24; depth++, el = composedParent(el)) {
        const text = deepTextOf(el).replace(/\s+/g, ' ').trim();
        if (text.length < 15 || text.length > 6000) continue;

        const links = el === anchor
          ? [anchor]
          : querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]', el);
        const ids = new Set();
        links.forEach((link) => {
          const id = projectKey(link.getAttribute('href') || link.href);
          if (id) ids.add(id);
        });
        // Shadow DOM atau markup hasil render dapat membuat pencarian
        // descendant tidak menyertakan link pemicu. Tetap terima ancestor
        // yang benar-benar membungkus anchor tersebut.
        if (ids.size > 1 || (ids.size === 1 && !ids.has(projectId))) continue;
        if (ids.size === 0 && el !== anchor && !el.contains(anchor)) continue;

        const cls = typeof el.className === 'string' ? el.className : '';
        const classHint = /(?:project|job|search|contest|result|card|tile|item)/i.test(cls);
        const hasProjectDetails = /[\d$€£₹]|\b(?:usd|eur|gbp|avg\.?\s*bid|bids?|budget|hourly|fixed\s+price)\b/i.test(text);
        // Cari wadah yang berisi konteks proyek. Teks pendek hanya menjadi
        // fallback jika markup tidak menyediakan wadah kartu yang jelas.
        candidates.push({ element: el, textLength: text.length, depth, classHint, hasProjectDetails });
      }

      if (!candidates.length) continue;
      const qualifying = candidates.filter((candidate) =>
        candidate.textLength >= 45 && (candidate.classHint || candidate.hasProjectDetails)
      );
      const pool = qualifying.length ? qualifying : candidates;
      // Prioritaskan kartu/wrapper proyek yang paling dekat dengan link,
      // lalu elemen dengan konteks teks terpendek agar tidak memilih list.
      pool.sort((a, b) => Number(b.classHint) - Number(a.classHint) || a.textLength - b.textLength || a.depth - b.depth);
      const chosen = pool[0];
      const existing = bestByProject.get(projectId);
      if (!existing || chosen.textLength < existing.textLength) {
        bestByProject.set(projectId, { element: chosen.element, textLength: chosen.textLength });
      }
    }

    return Array.from(bestByProject.values(), (entry) => entry.element);
  }

  // Fallback paling akhir: bentuk kandidat dari induk tautan proyek. Ini
  // menjaga scanner tetap bekerja bila Freelancer mengganti kelas kartu atau
  // teks kartu baru tersedia setelah komponen selesai dirender.
  function findFreelancerCardsFromProjectLinks() {
    const anchors = querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]');
    const byProject = new Map();
    const composedParent = (el) => el.parentElement || (el.getRootNode && el.getRootNode().host) || null;

    for (const anchor of anchors) {
      let urlKey = '';
      try {
        const url = new URL(anchor.getAttribute('href') || anchor.href, location.href);
        url.search = '';
        url.hash = '';
        urlKey = url.href;
      } catch (e) { /* tautan tidak valid */ }
      if (!urlKey) continue;

      let node = composedParent(anchor);
      let fallback = node;
      let chosen = null;
      for (let depth = 1; node && depth <= 18; depth++, node = composedParent(node)) {
        const text = deepTextOf(node).replace(/\s+/g, ' ').trim();
        if (text.length > 5000) break;
        if (!text.length) continue;

        const links = querySelectorAllDeep('a[href*="/projects/"], a[href*="/project/"]', node);
        const projectUrls = new Set();
        links.forEach((link) => {
          try {
            const url = new URL(link.getAttribute('href') || link.href, location.href);
            url.search = '';
            url.hash = '';
            projectUrls.add(url.href);
          } catch (e) { /* abaikan tautan tidak valid */ }
        });
        if (!projectUrls.size || projectUrls.size > 1 || !projectUrls.has(urlKey)) break;

        fallback = node;
        const cls = typeof node.className === 'string' ? node.className : '';
        if (/project-contest-card|project-card|job-card/i.test(cls)) {
          chosen = node;
          break;
        }
        // Ambil wrapper pertama yang cukup kaya untuk menjadi satu kartu,
        // bukan container hasil pencarian yang membungkus banyak proyek.
        if (text.length >= 45) {
          chosen = node;
          break;
        }
      }

      const candidate = chosen || fallback;
      if (!candidate) continue;
      const existing = byProject.get(urlKey);
      const textLength = deepTextOf(candidate).length;
      if (!existing || textLength > existing.textLength) {
        byProject.set(urlKey, { element: candidate, textLength });
      }
    }

    return Array.from(byProject.values(), (entry) => entry.element);
  }

  function deepTextOf(root) {
    let text = '';
    const visit = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.nodeValue + ' ';
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
      if (node.shadowRoot) visit(node.shadowRoot);
      for (const child of node.childNodes || []) visit(child);
    };
    visit(root);
    return text;
  }

  function enrichFreelancerVerificationText(data, root) {
    if (!isFreelancer || !data || !root) return data;
    // Beberapa versi Freelancer menyimpan status hanya di atribut khusus
    // (aria-label, data-testid, class SVG, dll). Kumpulkan semua nilai atribut
    // sambil melintasi light DOM dan open Shadow DOM, bukan mengandalkan nama
    // atribut tertentu.
    const parts = [];
    const elements = [];
    // innerText reads the rendered/composed text. It can include text that is
    // visible through a component's flattened tree even when textContent on
    // the surrounding document omits it.
    if (typeof root.innerText === 'string') parts.push(root.innerText);
    const visit = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.nodeValue || '');
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
      if (node.nodeType === Node.ELEMENT_NODE) {
        elements.push(node);
        for (const attr of Array.from(node.attributes || [])) parts.push(attr.value || '');
        if (node.shadowRoot) visit(node.shadowRoot);
      }
      for (const child of node.childNodes || []) visit(child);
    };
    visit(root);
    const text = parts.join(' ')
      // Seragamkan label teks, atribut bertanda hubung, dan class camelCase
      // (contoh: `emailVerified` menjadi `email Verified`).
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ');
    const patterns = {
      paymentVerified: {
        positive: /\bpayment(?:\s+\w+){0,3}\s+verified\b/i,
        negative: /\bpayment\s+(?:(?:is\s+)?un\s*verified|(?:is\s+)?not\s+verified)\b/i,
        positiveLocal: /(?:memverifikasi\s+pembayaran|pembayaran\s+(?:telah\s+)?terverifikasi)/i,
        negativeLocal: /(?:pembayaran\s+(?:belum|tidak)\s+terverifikasi|pembayaran\s+belum\s+diverifikasi)/i,
      },
      emailVerified: {
        positive: /\bemail(?:\s+\w+){0,3}\s+verified\b/i,
        negative: /\bemail\s+(?:(?:is\s+)?un\s*verified|(?:is\s+)?not\s+verified)\b/i,
        positiveLocal: /(?:memverifikasi\s+email|email\s+(?:telah\s+)?terverifikasi)/i,
        negativeLocal: /(?:email\s+(?:belum|tidak)\s+terverifikasi|email\s+belum\s+diverifikasi)/i,
      },
      depositMade: {
        positive: /\bdeposit(?:\s+\w+){0,2}\s+made\b/i,
        negative: /\bdeposit\s+(?:(?:is\s+)?not\s+made|was\s+not\s+made)\b/i,
        positiveLocal: /(?:setoran\s+(?:sudah|telah)\s+dibuat|deposit\s+(?:sudah|telah)\s+dibuat)/i,
        negativeLocal: /(?:setoran\s+belum\s+dibuat|deposit\s+belum\s+dibuat)/i,
      },
    };

    const normalized = (value) => String(value || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const hasGreenStatusRow = (pattern) => {
      const candidates = elements.map((el) => ({
        el,
        text: normalized(el.innerText || el.textContent),
      })).filter((item) => item.text.length > 0 && item.text.length <= 180 &&
        (pattern.positive.test(item.text) || pattern.positiveLocal.test(item.text)))
        .sort((a, b) => a.text.length - b.text.length);

      for (const candidate of candidates) {
        let row = candidate.el;
        let rowHasGreenIcon = false;
        for (let depth = 0; row && depth <= 5; depth++, row = row.parentElement || (row.getRootNode && row.getRootNode().host) || null) {
          const rowText = normalized(row.innerText || row.textContent);
          // Batasi ke satu baris status. Jika naik sampai container seluruh
          // panel, ikon hijau milik Email dapat keliru terbaca untuk Payment.
          if (rowText.length > 90) break;
          const icons = querySelectorAllDeep('svg, fl-icon, i, path, circle, rect, polygon, use, [class*="icon" i], [class*="check" i], [class*="tick" i]', row);
          rowHasGreenIcon = icons.some((icon) => {
            try {
              const style = window.getComputedStyle(icon);
              return isGreenColor(style.color) || isGreenColor(style.fill) || isGreenColor(style.stroke);
            } catch (e) { return false; }
          });
          if (rowHasGreenIcon) break;
        }

        // Pada tampilan Freelancer ini, teks label tetap hitam; ikon status
        // yang berubah hijau. Label kandidat mengikat ikon ke kriteria yang
        // benar, jadi cukup ikon hijau pada baris status yang sama.
        if (rowHasGreenIcon) return true;
      }
      return false;
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const positive = pattern.positive.test(text) || pattern.positiveLocal.test(text);
      const negative = pattern.negative.test(text) || pattern.negativeLocal.test(text);
      // Label saja bukan bukti terverifikasi: Freelancer memakai warna hijau
      // pada teks DAN ikon untuk menandai status yang benar-benar verified.
      if (positive) data[key] = hasGreenStatusRow(pattern);
      else if (negative) data[key] = false;
    }
    return data;
  }


  // ─── Pertama kali scan ────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAll);
  } else {
    scanAll();
  }

  // ─── MutationObserver untuk SPA (kartu baru dimuat tanpa reload) ──────────────
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.type === 'characterData') {
        shouldScan = true;
        break;
      }
      if (Array.from(m.addedNodes).some((node) => !isDetectorNode(node))) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) {
      observeOpenShadowRoots(document.body);
      clearTimeout(observer._t);
      observer._t = setTimeout(scanAll, 300);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Beberapa versi Upwork menyembunyikan viewer (tanpa menghapus node) saat
  // pengguna mengklik area luar. MutationObserver di atas tidak melihat
  // perubahan class/style, jadi ricontrolla route dan listing sesudah klik luar.
  if (isUpwork) {
    document.addEventListener('click', rememberClickedUpworkCard, true);
    document.addEventListener('click', (event) => {
      const detailBadge = document.querySelector('.freeup-upwork-detail-badge');
      if (!detailBadge) return;
      const viewerRoot = findVisibleUpworkDetailRoot();
      if (viewerRoot && viewerRoot.contains(event.target)) return;
      // Viewer can finish its close transition after the click handler. Rescan
      // after the transition as well as immediately so listing cards consume
      // the detail cache even when Upwork only hides the viewer with CSS.
      [80, 350, 750].forEach((delay) => setTimeout(scanAll, delay));
    }, true);
  }

  // Freelancer mengganti route lewat History API tanpa reload. Badge detail
  // berada di documentElement (di luar body), jadi bersihkan segera saat URL
  // berubah; menunggu DOM listing selesai dirender dapat meninggalkan badge
  // detail menutupi badge kartu yang baru.
  let lastFreelancerRoute = location.href;
  function handleFreelancerRouteChange() {
    const nextRoute = location.href;
    if (nextRoute === lastFreelancerRoute) return;
    lastFreelancerRoute = nextRoute;

    if (isFreelancer) {
      document.querySelectorAll('.freeup-detail-badge').forEach((el) => el.remove());
      document.body.removeAttribute('data-freeup-detail-scanned');
      // Konten rute sebelumnya bisa tetap ada selama transisi SPA. Scan ulang
      // beberapa kali agar pertama-tama badge lama terhapus, lalu kartu baru
      // mendapat badge setelah DOM listing terpasang.
      [0, 250, 800].forEach((delay) => setTimeout(scanAll, delay));
    } else {
      setTimeout(scanAll, 0);
    }
  }

  window.addEventListener('popstate', handleFreelancerRouteChange);
  window.addEventListener('hashchange', handleFreelancerRouteChange);
  if (isFreelancer) {
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        handleFreelancerRouteChange();
        return result;
      };
    }
    // Fallback untuk perubahan route yang tidak memakai event History standar.
    setInterval(handleFreelancerRouteChange, 500);
  }

  // MutationObserver pada document tidak melihat perubahan di dalam Shadow
  // DOM. Freelancer merender sebagian hasil pencarian di sana, jadi amati
  // setiap open shadow root dan jadwalkan scan saat kartu dimuat/berubah.
  const observedShadowRoots = new WeakSet();
  const shadowObserver = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.type === 'characterData' || Array.from(mutation.addedNodes).some((node) => !isDetectorNode(node)))) return;
    observeOpenShadowRoots(document.body);
    clearTimeout(observer._t);
    observer._t = setTimeout(scanAll, 300);
  });

  function isDetectorNode(node) {
    return node.nodeType === Node.ELEMENT_NODE && (
      node.matches('.freeup-badge-wrap, style[data-freeup-scam-styles]') ||
      !!node.closest('.freeup-badge-wrap, style[data-freeup-scam-styles]')
    );
  }

  function observeOpenShadowRoots(root) {
    const visit = (treeRoot) => {
      if (!treeRoot || (treeRoot.nodeType !== Node.ELEMENT_NODE && treeRoot.nodeType !== Node.DOCUMENT_NODE && treeRoot.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)) return;
      const hosts = [];
      if (treeRoot.nodeType === Node.ELEMENT_NODE && treeRoot.shadowRoot) hosts.push(treeRoot);
      try {
        treeRoot.querySelectorAll('*').forEach((el) => {
          if (el.shadowRoot) hosts.push(el);
        });
      } catch (e) { /* root mungkin tidak mendukung selector */ }

      for (const host of hosts) {
        const shadowRoot = host.shadowRoot;
        if (!observedShadowRoots.has(shadowRoot)) {
          observedShadowRoots.add(shadowRoot);
          shadowObserver.observe(shadowRoot, { childList: true, subtree: true, characterData: true });
          visit(shadowRoot);
        }
      }
    };
    visit(root);
  }

  observeOpenShadowRoots(document.body);

  // Retry scan untuk halaman yang merender kartu secara tertunda (SPA).
  if (isFreelancer) {
    [1500, 4000].forEach((delay) => {
      setTimeout(() => {
        if (document.querySelectorAll('.freeup-badge-wrap').length === 0) {
          scanAll();
        }
      }, delay);
    });
  }

  // ─── Listener dari popup untuk toggle on-the-fly ─────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'scamDetectorToggle') {
      if (msg.enabled) {
        scanAll();
      } else {
        document.querySelectorAll('.freeup-badge-wrap').forEach(el => el.remove());
        document.querySelectorAll('[data-freeup-scanned]').forEach(el => el.removeAttribute('data-freeup-scanned'));
        document.body.removeAttribute('data-freeup-detail-scanned');
        document.body.removeAttribute('data-freeup-upwork-detail-scanned');
      }
    }
  });
})();
