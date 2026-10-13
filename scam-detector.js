/*
 * FreeUp Calc — Scam Detector
 * Diinjeksikan ke halaman listing Upwork & Freelancer.com
 * Memindai setiap kartu proyek dan menambahkan badge risiko.
 *
 * Kriteria penilaian untuk Freelancer.com:
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
      chrome.storage.sync.get('freeupGlobalConfig', (result) => {
        const cfg = result.freeupGlobalConfig || {};
        const enabled = cfg.scamDetector ? cfg.scamDetector.enabled !== false : true;
        resolve(enabled);
      });
    });
  }

  const enabled = await isEnabled();
  if (!enabled) return;

  const host = location.hostname;
  const path = location.pathname || '';
  const isUpwork = host.includes('upwork.com');
  const isFreelancer = host.includes('freelancer.com');
  if (!isUpwork && !isFreelancer) return;

  // Deteksi halaman detail proyek Freelancer (URL mengandung /projects/)
  const isFreelancerDetail = isFreelancer && /\/projects?\//i.test(path);

  // Deteksi halaman listing proyek Freelancer.
  // Hanya halaman browse/search yang perlu dipindai — halaman lain
  // (membership, dashboard, profile, dll.) tidak memiliki kartu proyek.
    const isFreelancerListing = isFreelancer && !isFreelancerDetail;

  // ─── Scoring Engine ───────────────────────────────────────────────────────────
  const RISK = {
    // Generic / Upwork
    PAYMENT_UNVERIFIED: { points: 3, label: 'Payment belum diverifikasi' },
    ZERO_SPENT:         { points: 2, label: '$0 total spending (belum pernah bayar)' },
    LOW_SPENT:          { points: 1, label: 'Spending masih sangat kecil (<$100)' },
    NO_RATING:          { points: 1, label: 'Belum ada rating/ulasan klien' },
    EXTERNAL_CONTACT:   { points: 3, label: 'Minta kontak di luar platform (Telegram/WA/email)' },
    UNREALISTIC_BUDGET: { points: 2, label: 'Budget tidak realistis vs. kompleksitas pekerjaan' },
    SUSPICIOUS_PATTERN: { points: 1, label: 'Pola deskripsi mencurigakan' },
    // Freelancer-specific
    DEPOSIT_NOT_MADE:   { points: 4, label: 'Deposit belum dibuat — dana belum di-esrow (faktor paling penting)' },
    IDENTITY_UNVERIFIED:{ points: 1, label: 'Identity belum diverifikasi' },
    NEW_ACCOUNT:        { points: 2, label: 'Akun klien baru (< 6 bulan) — waspada fake account' },
    VAGUE_DESCRIPTION:  { points: 1, label: 'Deskripsi proyek terlalu singkat/tidak jelas' },
    TOO_GOOD_TO_BE_TRUE:{ points: 2, label: 'Bayaran terlalu tinggi untuk pekerjaan yang terlalu mudah' },
  };

  const OFFPLATFORM_RE = /telegram|whatsapp|wa\.me|signal|line\.me|wechat|\bkik\b|discord\.gg|\bviber\b|gmail\.com|yahoo\.com|hotmail\.com|outlook\.com/i;
  const SCAM_WORDS_RE  = /\bupfront\b|\badvance\s+payment\b|\bsend\s+money\b|\bcheck\s+scam\b|\btraining\s+fee\b|\bno\s+experience\s+needed\b.*\$[\d,]+|\beasy\s+money\b|\bwork\s+from\s+home\b.*\$[\d,]+\s*per\s+(day|hour|week)/i;
  const TOO_GOOD_RE    = /\b(no\s+experience\s+needed|easy\s+(?:money|job|work|task)|quick\s+money|get\s+paid\s+(?:fast|quickly)|make\s+\$[\d,]+\s+(?:per|a|every)\s+(?:day|hour|week|month)|no\s+skills?\s+required|anyone\s+can\s+do)\b/i;

  function scoreCard(data) {
    const risks = [];
    const oks = [];
    let score = 0;

    // 1. Payment verification (Upwork + Freelancer)
    if (data.paymentVerified === false) {
      score += RISK.PAYMENT_UNVERIFIED.points;
      risks.push(RISK.PAYMENT_UNVERIFIED.label);
    } else if (data.paymentVerified === true) {
      oks.push('Payment verified ✓');
    }

    // 2. Deposit made (Freelancer — FAKTOR PALING PENTING)
    if (data.depositMade === false) {
      score += RISK.DEPOSIT_NOT_MADE.points;
      risks.push(RISK.DEPOSIT_NOT_MADE.label);
    } else if (data.depositMade === true) {
      oks.push('Deposit made ✓ (dana sudah di-esrow)');
    }

    // 3. Identity verified (Freelancer)
    if (data.identityVerified === false) {
      score += RISK.IDENTITY_UNVERIFIED.points;
      risks.push(RISK.IDENTITY_UNVERIFIED.label);
    } else if (data.identityVerified === true) {
      oks.push('Identity verified ✓');
    }

    // 4. Total spent (Upwork)
    if (data.totalSpent !== null && data.totalSpent !== undefined) {
      if (data.totalSpent === 0) {
        score += RISK.ZERO_SPENT.points;
        risks.push(RISK.ZERO_SPENT.label);
      } else if (data.totalSpent < 100) {
        score += RISK.LOW_SPENT.points;
        risks.push(RISK.LOW_SPENT.label);
      } else {
        oks.push('Sudah spent $' + data.totalSpent.toLocaleString() + ' ✓');
      }
    }

    // 5. Rating & ulasan
    if (data.rating !== null && data.rating !== undefined) {
      if (data.rating === 0 && (data.reviewCount === 0 || data.reviewCount === undefined)) {
        score += RISK.NO_RATING.points;
        risks.push(RISK.NO_RATING.label);
      } else if (data.rating > 0) {
        const revTxt = data.reviewCount ? ' (' + data.reviewCount + ' ulasan)' : '';
        oks.push('Rating ' + data.rating.toFixed(1) + '/5.0' + revTxt + ' ✓');
      }
    }

    // 6. Usia akun (Freelancer "Member Since")
    if (data.memberSince instanceof Date && !isNaN(data.memberSince.getTime())) {
      const ageDays = (Date.now() - data.memberSince.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < 180) {
        score += RISK.NEW_ACCOUNT.points;
        risks.push(RISK.NEW_ACCOUNT.label + ' (bergabung ' + data.memberSince.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ')');
      } else {
        oks.push('Akun lama (member since ' + data.memberSince.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) + ') ✓');
      }
    }

    // 7. Off-platform contact di deskripsi
    if (data.description && OFFPLATFORM_RE.test(data.description)) {
      score += RISK.EXTERNAL_CONTACT.points;
      risks.push(RISK.EXTERNAL_CONTACT.label);
    }

    // 8. Pola kata scam di deskripsi
    if (data.description && SCAM_WORDS_RE.test(data.description)) {
      score += RISK.SUSPICIOUS_PATTERN.points;
      risks.push(RISK.SUSPICIOUS_PATTERN.label);
    }

    // 9. Too good to be true
    if (data.description && TOO_GOOD_RE.test(data.description)) {
      score += RISK.TOO_GOOD_TO_BE_TRUE.points;
      risks.push(RISK.TOO_GOOD_TO_BE_TRUE.label);
    }

    // 10. Deskripsi terlalu singkat (vagueness) — hanya jika budget besar
    if (data.description) {
      const descLen = data.description.trim().length;
      if (descLen > 0 && descLen < 60 && data.budget && data.budget > 100) {
        score += RISK.VAGUE_DESCRIPTION.points;
        risks.push(RISK.VAGUE_DESCRIPTION.label);
      }
    }

    // 11. Budget tidak realistis (sangat kecil: <$5 untuk proyek bukan microtask)
    if (data.budget !== null && data.budget !== undefined && data.budget > 0 && data.budget < 5 && !data.isMicrotask) {
      score += RISK.UNREALISTIC_BUDGET.points;
      risks.push(RISK.UNREALISTIC_BUDGET.label);
    }

    // Tentukan level
    let level;
    if (score <= 1) level = 'safe';
    else if (score <= 3) level = 'neutral';
    else level = 'risky';

    return { score, level, risks, oks };
  }

  // ─── Badge HTML ────────────────────────────────────────────────────────────────
  function makeBadge(result, opts) {
    const LABELS = { safe: '🟢 Aman', neutral: '🟡 Perlu Cek', risky: '🔴 Berisiko' };
    const CLASSES = { safe: 'freeup-safe', neutral: 'freeup-neutral', risky: 'freeup-risky' };

    const label = LABELS[result.level];
    const cls = CLASSES[result.level];
    const sizeCls = opts && opts.large ? 'freeup-badge-lg' : '';

    const okItems = result.oks.map(o => `<li class="ok">${o}</li>`).join('');
    const riskItems = result.risks.map(r => `<li class="risk">⚠ ${r}</li>`).join('');
    const tooltipContent = [
      okItems ? `<ul>${okItems}</ul>` : '',
      riskItems ? `<ul>${riskItems}</ul>` : '',
      `<div style="margin-top:4px;opacity:0.6;font-size:10px">Skor risiko: ${result.score} | FreeUp Calc</div>`
    ].join('');

    const wrap = document.createElement('span');
    wrap.className = 'freeup-badge-wrap';
    wrap.innerHTML = `
      <span class="freeup-badge ${cls} ${sizeCls}">
        ${label}
        <span class="freeup-badge-tooltip">${tooltipContent}</span>
      </span>`;
    return wrap;
  }

  // ─── Helper: cek apakah warna elemen hijau (verified) ────────────────────────
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
    return Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && r < 170;
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
    const text = container.innerText || '';
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
      const t = el.innerText || el.textContent || '';
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
    const text = card.innerText || '';

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

    return {
      paymentVerified, totalSpent, rating, reviewCount, budget,
      description: text, isMicrotask: false,
      depositMade: null, identityVerified: null, memberSince: null,
    };
  }

  // ─── Freelancer Parser (card listing) ─────────────────────────────────────────
  function parseFreelancerCard(card) {
    const text = card.innerText || '';
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
      totalSpent: null,
      rating,
      reviewCount,
      budget,
      description: text,
      isMicrotask: false,
      memberSince,
    };
  }

  // ─── Freelancer Detail Page Scanner ───────────────────────────────────────────
  function scanFreelancerDetailPage() {
    if (document.body.hasAttribute('data-freeup-detail-scanned')) return;
    document.body.setAttribute('data-freeup-detail-scanned', '1');

    try {
      // Ambil seluruh teks halaman untuk ekstrak data klien
      const bodyText = document.body.innerText || '';

      // 1. Verifikasi — cari panel client/sidebar
      let verifications = extractVerifications(document.body);

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
      if (descEl) description = descEl.innerText || descEl.textContent || bodyText;

      const data = {
        paymentVerified: verifications.paymentVerified,
        depositMade: verifications.depositMade,
        identityVerified: verifications.identityVerified,
        totalSpent: null,
        rating,
        reviewCount,
        budget,
        description,
        isMicrotask: false,
        memberSince,
      };

      const result = scoreCard(data);
      const badge = makeBadge(result, { large: true });

      // Inject badge di dekat judul proyek
      const titleEl = document.querySelector('h1, [class*="project-title" i], [class*="ProjectTitle" i], [class*="PageProjectView" i] h1');
      if (titleEl) {
        titleEl.insertAdjacentElement('afterend', badge);
      } else {
        document.body.insertBefore(badge, document.body.firstChild);
      }
    } catch (e) {
      // Silent fail
    }
  }

  // ─── Inject ke kartu ──────────────────────────────────────────────────────────
  const PROCESSED_ATTR = 'data-freeup-scanned';

  function processCard(card, parser) {
    if (card.hasAttribute(PROCESSED_ATTR)) return;
    card.setAttribute(PROCESSED_ATTR, '1');

    try {
      const data = parser(card);
      const result = scoreCard(data);
      const badge = makeBadge(result);

      const anchor =
        card.querySelector('[data-test="job-title"], h2, h3, .job-title, .project-title, .JobTitle, .listing-title, [class*="project-title" i], [class*="job-title" i], [class*="title" i]') ||
        card.querySelector('a[href*="/projects/"], a[href*="/job/"]') ||
        card.querySelector('header, .job-header, .card-header') ||
        card;

      anchor.insertAdjacentElement('afterend', badge);
    } catch (e) {
      // Silent fail per kartu
    }
  }

  function scanAll() {
    if (isUpwork) {
      const cards = document.querySelectorAll(
        '[data-test="job-tile"], .job-tile, [class*="JobTile"], article[data-job-uid], section[data-ev-job-uid]'
      );
      cards.forEach(card => processCard(card, parseUpworkCard));
    }

    if (isFreelancer) {
      if (isFreelancerDetail) {
        scanFreelancerDetailPage();
      } else if (isFreelancerListing) {
        // Daftar selector yang luas untuk menangkap berbagai versi DOM Freelancer
        const selectorList = [
          '.JobSearchCard-item',
          '.job-search-card',
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

        let cards = document.querySelectorAll(selectorList);

        // Fallback: jika selector di atas tidak menemukan apa pun,
        // cari elemen yang mengandung indikator proyek (Avg Bid / "bids")
        if (cards.length === 0) {
          cards = findFreelancerCardsByContent();
        }

        console.log('[FreeUp Scam Detector] Freelancer cards found:', cards.length);
        cards.forEach(card => processCard(card, parseFreelancerCard));
      }
    }
  }

  // Fallback: deteksi kartu proyek berdasarkan konten teks
  function findFreelancerCardsByContent() {
    const candidates = [];
    const allEls = document.querySelectorAll('div, article, li, section');
    for (const el of allEls) {
      const text = el.innerText || '';
      if (!text || text.length < 50 || text.length > 2500) continue;
      // Indikator kuat: ada "Avg Bid" atau "X bids" + budget ($)
      const hasBid = /avg\s+bid/i.test(text) || /\b\d+\s+bids?\b/i.test(text);
      const hasBudget = /\$\s*[\d,]+/.test(text);
      // Wajib ada link ke halaman detail proyek — agar kartu non-proyek
      // (mis. paket membership) tidak salah terdeteksi.
      const hasProjectLink = el.querySelector('a[href*="/projects/"], a[href*="/project/"]');
      if (hasBid && hasBudget && hasProjectLink) {
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
      if (m.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) {
      clearTimeout(observer._t);
      observer._t = setTimeout(scanAll, 300);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ─── Listener dari popup untuk toggle on-the-fly ─────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'scamDetectorToggle') {
      if (msg.enabled) {
        scanAll();
      } else {
        document.querySelectorAll('.freeup-badge-wrap').forEach(el => el.remove());
        document.querySelectorAll('[data-freeup-scanned]').forEach(el => el.removeAttribute('data-freeup-scanned'));
        document.body.removeAttribute('data-freeup-detail-scanned');
      }
    }
  });
})();
