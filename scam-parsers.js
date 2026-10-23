/*
 * FreeUp Calc — Scam Parsers (lapisan DOM per platform)
 *
 * Tanggung jawab:
 *  - scam-parsers.js : MEMBACA metadata proyek dari DOM yang terlihat saja.
 *                      Tidak pernah memanggil fetch/XHR ke API internal platform.
 *  - scam-engine.js  : logika murni (skor risiko + kriteria "aman").
 *  - scam-detector.js: memindai kartu lalu menyuntik badge.
 *
 * Catatan implementasi:
 *  - Semua pembacaan teks memakai `textContent` (bukan `innerText`) supaya
 *    perilakunya identik di browser dan di jsdom (jsdom tidak mengimplementasikan
 *    innerText), serta tidak bergantung pada layout/visibility.
 *  - Setiap selector punya daftar fallback karena DOM platform bisa berubah.
 */
(function (root, factory) {
  let api;
  if (typeof module !== 'undefined' && module.exports) {
    let eng = null;
    try { eng = require('./scam-engine.js'); } catch (e) { eng = null; }
    api = factory(eng);
    module.exports = api;
  } else {
    api = factory(root.FreeUpScamEngine);
    root.FreeUpScamParsers = api;
  }
})(typeof self !== 'undefined' ? self : this, function (engine) {
  'use strict';
  // ─── Utilitas dasar ──────────────────────────────────────────────────────────
  function textOf(el) {
    if (!el) return '';
    const t = el.textContent != null ? el.textContent : '';
    return String(t).replace(/\s+/g, ' ').trim();
  }

  function query(root, selectors) {
    if (!root || typeof root.querySelector !== 'function') return null;
    for (let i = 0; i < selectors.length; i++) {
      const sel = selectors[i];
      if (!sel) continue;
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (e) { /* selector tidak valid → lewati */ }
    }
    return null;
  }

  function firstText(root, selectors) {
    return textOf(query(root, selectors));
  }

  function toNumber(value) {
    if (value === null || value === undefined) return null;
    const m = String(value).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return isNaN(n) ? null : n;
  }

  // ─── Warna / status verifikasi ───────────────────────────────────────────────
  function isGreenColor(cssColor) {
    if (!cssColor) return false;
    const m = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return false;
    const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
    return g > r && g > b && g >= 100;
  }

  // ─── Status verifikasi dari ikon/badge ───────────────────────────────────────
  function detectVerifiedStatus(el, win) {
    if (!el) return null;
    let probe = el;
    const icon = el.querySelector(
      'fl-icon, svg, [class*="icon" i], [class*="Icon" i], i, [class*="check" i], [class*="tick" i]'
    );
    if (icon) probe = icon;

    if (win && win.getComputedStyle) {
      try {
        const style = win.getComputedStyle(probe);
        const color = style && style.color;
        const fill = style && style.fill;
        if (isGreenColor(color) || isGreenColor(fill)) return true;
        // Abu-abu saja tidak cukup untuk menyimpulkan "unverified".
      } catch (e) { /* abaikan */ }
    }

    // Class name sebagai indikator (aman untuk jsdom).
    // PENTING: cek pola negatif DULUAN, karena "unverified" mengandung
    // "verified" — kalau positif dicek lebih dulu, "unverified" terbaca true.
    // Kata generik seperti "fill" sengaja TIDAK dipakai (banyak class SVG
    // generik memakai kata itu, bukan penanda status verifikasi).
    const cls = ((probe.className && probe.className.toString) ? probe.className.toString() : '').toLowerCase();
    if (/(un-?verified|not-?verified|inactive|negative|pending|missing|invalid)/.test(cls)) return false;
    if (/(verified|success|green|active|check|tick|done|positive|complete)/.test(cls)) return true;

    const state = probe.getAttribute && (probe.getAttribute('data-state') || probe.getAttribute('data-verified'));
    if (state) {
      if (/true|verified|success|complete/i.test(state)) return true;
      if (/false|unverified|pending|missing/i.test(state)) return false;
    }
    return null;
  }

  const VERIFICATION_KEYWORDS = [
    { key: 'paymentVerified',  re: /payment\s+verified/i },
    { key: 'depositMade',      re: /deposit\s+made/i },
    { key: 'identityVerified', re: /identity\s+verified/i },
    { key: 'emailVerified',    re: /email\s+verified/i },
    { key: 'phoneVerified',    re: /phone\s*(?:number\s*)?verified/i },
    { key: 'profileCompleted', re: /profile\s+completed/i },
  ];

  // Cari elemen kecil yang teksnya cocok regex verifikasi
  function findVerificationItem(container, re) {
    const candidates = container.querySelectorAll('li, div, span, fl-text, p, strong, small');
    let best = null;
    let bestLength = Infinity;
    for (const el of candidates) {
      const t = textOf(el);
      if (re.test(t) && t.length > 0 && t.length < 80 && t.length < bestLength) {
        best = el;
        bestLength = t.length;
      }
    }
    return best;
  }

  // Elemen data-test milik Upwork (status sudah terenkode di nama selector)
  const VERIFICATION_TEST_MAP = [
    ['paymentVerified',  ['[data-test="payment-verified"]', '[data-test="payment-unverified"]']],
    ['depositMade',      ['[data-test="deposit-made"]', '[data-test="deposit-not-made"]']],
    ['identityVerified', ['[data-test="identity-verified"]', '[data-test="identity-unverified"]']],
    ['emailVerified',    ['[data-test="email-verified"]', '[data-test="email-unverified"]']],
    ['phoneVerified',    ['[data-test="phone-verified"]', '[data-test="phone-unverified"]', '[data-test="phone-number-verified"]']],
    ['profileCompleted', ['[data-test="profile-completed"]']],
  ];

  /**
   * Ekstrak status verifikasi (payment/deposit/identity/email/phone/profile).
   * Sumber: atribut title/aria-label, ikon data-test, dan teks "X verified".
   */
  function extractVerifications(container, win) {
    const result = {
      paymentVerified: null,
      depositMade: null,
      identityVerified: null,
      emailVerified: null,
      phoneVerified: null,
      profileCompleted: null,
    };
    if (!container) return result;

    // 0. Sinyal negatif dievaluasi DULUAN.
    //    Contoh: "Payment unverified" TIDAK boleh dianggap "verified"
    //    hanya karena mengandung kata "verified".
    const text = textOf(container);
    const NEGATIVE_PATTERNS = [
      ['paymentVerified',  /payment\s+(?:is\s+)?(?:un-?verified|not\s+verified)/i],
      ['depositMade',      /deposit\s+(?:is\s+)?(?:not\s+made|was\s+not\s+made)/i],
      ['identityVerified', /identity\s+(?:is\s+)?(?:un-?verified|not\s+verified)/i],
      ['emailVerified',    /email\s+(?:is\s+)?(?:un-?verified|not\s+verified)/i],
      ['phoneVerified',    /phone\s*(?:number\s*)?(?:is\s+)?(?:un-?verified|not\s+verified)/i],
    ];
    for (const [key, re] of NEGATIVE_PATTERNS) {
      if (re.test(text)) result[key] = false;
    }

    // 1. Icon/badge dengan title atau aria-label
    container.querySelectorAll('[title], [aria-label]').forEach((el) => {
      const label = (el.getAttribute('title') || el.getAttribute('aria-label') || '');
      for (const { key, re } of VERIFICATION_KEYWORDS) {
        if (re.test(label)) {
          const status = detectVerifiedStatus(el, win);
          if (status !== null) result[key] = status;
        }
      }
    });

    // 2. Elemen data-test (status terenkode di nama selector)
    for (const [key, sels] of VERIFICATION_TEST_MAP) {
      if (result[key] !== null) continue;
      for (const sel of sels) {
        const el = query(container, [sel]);
        if (!el) continue;
        const status = detectVerifiedStatus(el, win);
        if (status !== null) { result[key] = status; break; }
        if (/unverified|not\s+verified/i.test(sel)) { result[key] = false; break; }
        if (/unverified|not\s+verified/i.test(textOf(el))) { result[key] = false; break; }
        result[key] = true;
        break;
      }
    }

    // 3. Teks polos "Payment verified" dsb.
    for (const { key, re } of VERIFICATION_KEYWORDS) {
      if (result[key] !== null) continue;
      if (!re.test(text)) continue;
      const itemEl = findVerificationItem(container, re);
      if (itemEl) {
        const status = detectVerifiedStatus(itemEl, win);
        result[key] = (status !== null) ? status : true;
      } else {
        result[key] = true;
      }
    }

    // 4. Sinyal negatif eksplisit (cadangan bila langkah 0 tidak cocok)
    if (result.paymentVerified === null && /payment\s+un-?verified/i.test(text)) result.paymentVerified = false;
    if (result.emailVerified === null && /email\s+un-?verified/i.test(text)) result.emailVerified = false;
    if (result.phoneVerified === null && /phone\s*(?:number\s*)?un-?verified/i.test(text)) result.phoneVerified = false;
    if (result.identityVerified === null && /identity\s+(?:not\s+verified|un-?verified)/i.test(text)) result.identityVerified = false;
    if (result.depositMade === null && /deposit\s+(?:not\s+made|was\s+not\s+made)/i.test(text)) result.depositMade = false;

    return result;
  }

  /**
   * True bila setidaknya satu status verifikasi sudah diketahui (true/false).
   * Dipakai untuk deciding fallback: kalau panel klien tidak memuat info
   * verifikasi sama sekali, coba parse dari seluruh halaman.
   */
  function hasAnyVerification(verifications) {
    if (!verifications) return false;
    for (const key in verifications) {
      if (verifications[key] === true || verifications[key] === false) return true;
    }
    return false;
  }

  // ─── "Member since" ───────────────────────────────────────────────────────────
  function parseMemberSince(text) {
    if (!text) return null;
    const patterns = [
      /member\s+since\s+([a-z]{3,9}\.?\s+\d{1,2},?\s*\d{4})/i,
      /since\s+([a-z]{3,9}\.?\s+\d{1,2},?\s*\d{4})/i,
      /joined\s+(?:on\s+)?([a-z]{3,9}\.?\s+\d{1,2},?\s*\d{4})/i,
      /bergabung\s+(?:sejak\s+)?([a-z]{3,9}\.?\s+\d{1,2},?\s*\d{4})/i,
    ];
    for (const p of patterns) {
      const m = String(text).match(p);
      if (m) {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime())) return d;
      }
    }
    return null;
  }

  // ─── Budget ───────────────────────────────────────────────────────────────────
  /**
   * Ambil budget dari teks kartu.
   * Prioritas: rentang ("$250 - $750") → nilai tengah; lalu label budget; lalu angka dollar pertama.
   */
  function parseBudget(text) {
    if (!text) return null;
    const range = text.match(/\$\s*([\d,.]+)\s*(?:-|–|—|to)\s*\$\s*([\d,.]+)/);
    if (range) {
      const lo = toNumber(range[1]);
      const hi = toNumber(range[2]);
      if (lo !== null && hi !== null) return (lo + hi) / 2;
      if (lo !== null) return lo;
      if (hi !== null) return hi;
    }
    const labeled = text.match(/(?:budget|fixed|est\.?\s*budget|price|hourly)\s*:?\s*\$\s*([\d,.]+)/i);
    if (labeled) return toNumber(labeled[1]);
    const plain = text.match(/\$\s*([\d,.]+)/);
    if (plain) return toNumber(plain[1]);
    return null;
  }

  // ─── Kompetisi: Upwork (tier proposal) & Freelancer (jumlah bid) ──────────────
  const PROPOSAL_TIER_PATTERNS = [
    // "50+ proposals" → min 50, tanpa batas atas
    { re: /(\d+)\s*\+\s*proposals?/i, build: m => ({ min: toNumber(m[1]), max: null }) },
    // "10 to 20 proposals" / "10 - 20 proposals"
    { re: /(\d+)\s*(?:to|-|–|—)\s*(\d+)\s*proposals?/i, build: m => ({ min: toNumber(m[1]), max: toNumber(m[2]) }) },
    // "Fewer than 10 proposals" / "Less than 10 proposals"
    { re: /(?:fewer|less)\s+than\s+(\d+)\s*proposals?/i, build: m => ({ min: 0, max: toNumber(m[1]) }) },
    // "Under 5 proposals" → min 0, tanpa batas atas
    { re: /under\s+(\d+)\s*proposals?/i, build: m => ({ min: 0, max: toNumber(m[1]) }) },
    // "Proposals: 12" / "12 proposals" → angka persis
    { re: /(\d+)\s*proposals?/i, build: m => ({ min: toNumber(m[1]), max: toNumber(m[1]) }) },
  ];

  /**
   * Parse tier proposal Upwork.
   * Mengembalikan { min, max, label, exact } atau null.
   *  - min/max = batas angka proposal
   *  - exact   = true bila angka persis diketahui
   */
  function parseProposalTier(text) {
    if (!text) return null;
    for (const p of PROPOSAL_TIER_PATTERNS) {
      const m = String(text).match(p.re);
      if (!m) continue;
      const range = p.build(m);
      if (range.min === null && range.max === null) continue;
      const exact = range.min !== null && range.max !== null && range.min === range.max;
      let label;
      if (range.max === null) label = range.min + '+ proposals';
      else if (range.min === 0) label = 'Under ' + range.max + ' proposals';
      else if (range.min === range.max) label = range.min + (range.min === 1 ? ' proposal' : ' proposals');
      else label = range.min + '–' + range.max + ' proposals';
      return { min: range.min, max: range.max, label, exact };
    }
    return null;
  }

  /**
   * Parse jumlah proposal Upwork persis.
   * Hanya cocok untuk bentuk "Proposals 12" / "Proposals: 12" (label di depan),
   * yang dipakai pada halaman detail. Angka sebelum label ("12 proposals")
   * ditangani oleh parseProposalTier() sebagai exact.
   */
  function parseExactProposalCount(text) {
    if (!text) return null;
    const m = String(text).match(/proposals?\s*:?\s*(\d+)/i);
    if (!m) return null;
    const count = toNumber(m[1]);
    if (count === null) return null;
    return { count, label: count + (count === 1 ? ' proposal' : ' proposals') };
  }

  /**
   * Parse waktu terakhir dilihat Upwork (termasuk "Last viewed by client: yesterday").
   * Hanya teks eksplisit "viewed"/"seen" agar tidak tertukar dengan "Posted 5 days ago".
   */
  function parseLastView(text) {
    if (!text) return null;
    const s = String(text);
    const m = s.match(/(?:last\s*(?:viewed|view)(?:\s+by\s+(?:the\s+)?client)?|viewed|seen)\s*:?\s*(yesterday|just\s*now|\d+\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago)\b/i);
    if (m) {
      const days = engine ? engine.parseRelativeTime(m[1]) : null;
      if (days !== null) return days;
    }
    return null;
  }

  /**
   * Parse jumlah bid Freelancer ("12 bids", "Bids 12", "5 bids, 3 awarded").
   * Mengembalikan { count, label } atau null.
   */
  function parseBidCount(text) {
    if (!text) return null;
    const m = String(text).match(/(\d[\d,]*)\s*bids?\b/i)
      || String(text).match(/\bbids?\s*:?\s*(\d[\d,]*)/i);
    if (!m) return null;
    const count = toNumber(m[1]);
    if (count === null) return null;
    return { count, label: count + (count === 1 ? ' bid' : ' bids') };
  }

  /** Parse "Avg Bid $120" → { amount, label } */
  function parseAvgBid(text) {
    if (!text) return null;
    const m = String(text).match(/(?:avg\.?\s*bid|average\s*bid|bids\s*avg)\s*:?\s*\$\s*([\d,.]+)/i);
    if (!m) return null;
    const amount = toNumber(m[1]);
    if (amount === null) return null;
    return { amount, label: 'Avg Bid $' + amount };
  }

  // ─── Helper: hire rate (duplikat kecil agar parsers mandiri) ─────────────────
  function parseHireRate(text) {
    if (!text) return null;
    const m = String(text).match(/hire\s*rate\s*:?\s*(\d{1,3}(?:\.\d+)?)\s*%/i)
      || String(text).match(/(\d{1,3}(?:\.\d+)?)\s*%\s*hire\s*rate/i);
    return m ? parseFloat(m[1]) : null;
  }

  // ─── Helper: total spending Upwork ("$5K total spent", "$1,200 spent") ──────
  function parseTotalSpent(text) {
    if (!text) return null;
    const s = String(text);
    const m = s.match(/\$\s*([\d,.]+)\s*([kKmM])?\s*(?:total\s+)?spent/i)
      || s.match(/spent\s*:?\s*\$\s*([\d,.]+)\s*([kKmM])?/i);
    if (m) {
      let val = toNumber(m[1]);
      if (val === null) return null;
      const suffix = (m[2] || '').toLowerCase();
      if (suffix === 'k') val *= 1000;
      else if (suffix === 'm') val *= 1000000;
      return val;
    }
    if (/\$\s*0\s*(?:total\s+)?spent/i.test(s)) return 0;
    if (/\bno\s+payments?\s+(?:made|yet)\b/i.test(s)) return 0;
    return null;
  }

  // ─── Helper: rating + jumlah ulasan ────────────────────────────────────────
  function parseRatingAndReviews(text) {
    const result = { rating: null, reviewCount: null };
    if (!text) return result;
    const s = String(text);
    const ratingMatch = s.match(/([\d]+(?:\.\d+)?)\s*(?:\/\s*5|out\s+of\s+5|stars?)/i)
      || s.match(/([\d]+(?:\.\d+)?)\s*★/)
      || s.match(/(?:rating|score)\s*:?\s*([\d]+(?:\.\d+)?)/i);
    if (ratingMatch) {
      const v = parseFloat(ratingMatch[1]);
      if (!isNaN(v) && v >= 0 && v <= 5) result.rating = v;
    }
    const revMatch = s.match(/([\d,]+)\s*(?:reviews?|feedbacks?)/i)
      || s.match(/(?:reviews?|feedbacks?)\s*:?\s*([\d,]+)/i);
    if (revMatch) {
      const n = toNumber(revMatch[1]);
      if (n !== null) result.reviewCount = n;
    }
    return result;
  }

  // ─── Selectors per platform (tiap daftar punya fallback) ────────────────────
  const UPWORK_TITLE_SELECTORS = [
    '[data-test="job-title"]',
    '[data-test="job-tile-title"]',
    '[data-test="job-tile-title-link"]',
    '[class*="job-title" i]',
    'h1, h2, h3',
  ];
  const UPWORK_DESCRIPTION_SELECTORS = [
    '[data-test="job-description"]',
    '[data-test="job-tile-description"]',
    '[data-test="description"]',
    '[class*="job-description" i]',
    '[class*="description" i]',
  ];
  const UPWORK_PRICE_SELECTORS = [
    '[data-test="budget"]',
    '[data-test="job-price"]',
    '[data-test="job-tile-price"]',
    '[class*="price" i]',
    '[class*="budget" i]',
  ];
  const UPWORK_PROPOSAL_SELECTORS = [
    '[data-test="proposals-count"]',
    '[data-test="job-tile-proposals"]',
    '[data-test="proposal-count"]',
    '[class*="proposal" i]',
  ];
  const UPWORK_CLIENT_SELECTORS = [
    '[data-test="client-container"]',
    '[data-test="client-info"]',
    '[data-test*="client-info" i]',
    '[data-test*="client-container" i]',
    '[data-test="client-info-section"]',
    '[class*="client-info" i]',
    '[class*="clientInfo" i]',
    '[class*="client-details" i]',
    '[class*="client-history" i]',
    '[class*="about-client" i]',
  ];
  const FREELANCER_TITLE_SELECTORS = [
    '.JobSearchCard-primary-heading',
    '[data-test="project-title"]',
    '[class*="primary-heading" i]',
    '[class*="project-title" i]',
    '[class*="card-title" i]',
    'h1, h2, h3',
  ];
  const FREELANCER_DESCRIPTION_SELECTORS = [
    '[data-section="description"]',
    '[data-test="project-description"]',
    '[class*="primary-description" i]',
    '[class*="project-description" i]',
    '[class*="description" i]',
  ];
  const FREELANCER_PRICE_SELECTORS = [
    '.JobSearchCard-primary-price',
    '[class*="primary-price" i]',
    '[class*="project-price" i]',
    '[class*="price" i]',
    '[class*="budget" i]',
  ];
  const FREELANCER_BID_SELECTORS = [
    '.JobSearchCard-secondary-bids',
    '[data-test="bids-count"]',
    '[class*="bids" i]',
    '[class*="bid-count" i]',
  ];
  const FREELANCER_CLIENT_SELECTORS = [
    '[data-test="user-info"]',
    '[class*="UserInfo" i]',
    '[class*="user-info" i]',
    '[class*="client-info" i]',
    '[class*="ProjectDetailSidebar" i]',
    '[class*="sidebar" i]',
  ];

  // ─── Parser Upwork: kartu listing ───────────────────────────────────────────
  /**
   * Baca metadata proyek dari kartu listing Upwork.
   * Semua data diambil dari DOM yang terlihat saja (tanpa fetch/XHR).
   *
   * CATATAN: kartu Upwork hanya menampilkan TIER proposal ("50+ proposals",
   * "10 to 20 proposals"), bukan jumlah proposal persis. Jumlah persis hanya
   * tersedia di halaman detail → lihat parseUpworkDetail().
   */
  function parseUpworkCard(card, win) {
    if (!card) return null;
    const text = textOf(card);
    const verifications = extractVerifications(card, win);

    const descEl = query(card, UPWORK_DESCRIPTION_SELECTORS);
    const description = descEl ? textOf(descEl) : text;

    const priceEl = query(card, UPWORK_PRICE_SELECTORS);
    const priceText = priceEl ? textOf(priceEl) : '';
    const budget = parseBudget(priceText || text);

    const proposalEl = query(card, UPWORK_PROPOSAL_SELECTORS);
    const proposalText = proposalEl ? textOf(proposalEl) : '';
    const proposalTier = parseProposalTier(proposalText || text);

    const { rating, reviewCount } = parseRatingAndReviews(text);

    return {
      platform: 'upwork',
      title: firstText(card, UPWORK_TITLE_SELECTORS) || null,
      description,
      budget,
      paymentVerified: verifications.paymentVerified,
      phoneVerified: verifications.phoneVerified,
      hireRate: parseHireRate(text),
      lastViewDays: parseLastView(text),
      totalSpent: parseTotalSpent(text),
      rating,
      reviewCount,
      proposalTier,
      proposalCount: proposalTier && proposalTier.exact ? proposalTier.min : null,
      avgBid: null,
      bidCount: null,
      // Tidak tersedia di kartu listing
      depositMade: null,
      identityVerified: null,
      emailVerified: null,
      memberSince: null,
      isMicrotask: false,
    };
  }

  // ─── Parser Upwork: halaman detail proyek ───────────────────────────────────
  /**
   * Baca metadata proyek dari halaman detail Upwork.
   * Di sini jumlah proposal tersedia PERSIS ("Proposals 12"), dan profil klien
   * (hire rate, total spent, last view, verifikasi) lebih lengkap.
   */
  function parseUpworkDetail(root, win) {
    if (!root) return null;
    const text = textOf(root);

    // Verifikasi: coba panel klien dulu, baru seluruh halaman.
    const clientEl = query(root, UPWORK_CLIENT_SELECTORS);
    let verifications = extractVerifications(clientEl, win);
    if (!hasAnyVerification(verifications)) verifications = extractVerifications(root, win);

    const descEl = query(root, UPWORK_DESCRIPTION_SELECTORS);
    const description = descEl ? textOf(descEl) : text;

    const priceEl = query(root, UPWORK_PRICE_SELECTORS);
    const budget = parseBudget(priceEl ? textOf(priceEl) : text);

    // Jumlah proposal persis → prioritaskan label "Proposals 12"
    const proposalEl = query(root, UPWORK_PROPOSAL_SELECTORS);
    const proposalText = proposalEl ? textOf(proposalEl) : text;
    const exact = parseExactProposalCount(proposalText);
    let proposalCount = exact ? exact.count : null;
    let proposalTier = parseProposalTier(proposalText);
    if (proposalCount === null && proposalTier && proposalTier.exact) proposalCount = proposalTier.min;
    if (!proposalTier && proposalCount !== null) {
      proposalTier = { min: proposalCount, max: proposalCount, label: proposalCount + ' proposals', exact: true };
    }

    const { rating, reviewCount } = parseRatingAndReviews(text);

    return {
      platform: 'upwork',
      title: firstText(root, UPWORK_TITLE_SELECTORS) || null,
      description,
      budget,
      paymentVerified: verifications.paymentVerified,
      phoneVerified: verifications.phoneVerified,
      hireRate: parseHireRate(text),
      lastViewDays: parseLastView(text),
      totalSpent: parseTotalSpent(text),
      rating,
      reviewCount,
      proposalTier,
      proposalCount,
      avgBid: (function () { const a = parseAvgBid(text); return a ? a.amount : null; })(),
      bidCount: null,
      depositMade: verifications.depositMade,
      identityVerified: verifications.identityVerified,
      emailVerified: verifications.emailVerified,
      memberSince: parseMemberSince(text),
      isMicrotask: false,
    };
  }
  // ─── Parser Freelancer: kartu listing ───────────────────────────────────────
  /**
   * Baca metadata proyek dari kartu listing Freelancer.com.
   * Semua data diambil dari DOM yang terlihat saja (tanpa fetch/XHR).
   */
  function parseFreelancerCard(card, win) {
    if (!card) return null;
    const text = textOf(card);
    const verifications = extractVerifications(card, win);

    const descEl = query(card, FREELANCER_DESCRIPTION_SELECTORS);
    const description = descEl ? textOf(descEl) : text;

    const priceEl = query(card, FREELANCER_PRICE_SELECTORS);
    const priceText = priceEl ? textOf(priceEl) : '';
    const budget = parseBudget(priceText || text);

    const bidEl = query(card, FREELANCER_BID_SELECTORS);
    const bidText = bidEl ? textOf(bidEl) : '';
    const bidInfo = parseBidCount(bidText || text);
    const bidCount = bidInfo ? bidInfo.count : null;
    const bidTier = parseProposalTier(bidText || text);

    const { rating, reviewCount } = parseRatingAndReviews(text);

    return {
      platform: 'freelancer',
      title: firstText(card, FREELANCER_TITLE_SELECTORS) || null,
      description,
      budget,
      paymentVerified: verifications.paymentVerified,
      phoneVerified: verifications.phoneVerified,
      hireRate: parseHireRate(text),
      lastViewDays: parseLastView(text),
      totalSpent: parseTotalSpent(text),
      rating,
      reviewCount,
      proposalTier: bidTier,
      proposalCount: bidCount,
      avgBid: (function () { const a = parseAvgBid(text); return a ? a.amount : null; })(),
      bidCount,
      depositMade: verifications.depositMade,
      identityVerified: verifications.identityVerified,
      emailVerified: verifications.emailVerified,
      memberSince: parseMemberSince(text),
      isMicrotask: /microtask|fixed\s+price\s+project|hourly\s+project/i.test(text),
    };
  }

  // ─── Parser Freelancer: halaman detail proyek ───────────────────────────────
  /**
   * Baca metadata proyek dari halaman detail Freelancer.com.
   * Panel sidebar memuat info owner (reputation, payment verified, status member).
   */
  function parseFreelancerDetail(root, win) {
    if (!root) return null;
    const text = textOf(root);

    // Verifikasi: panel owner dulu, baru seluruh halaman.
    const clientEl = query(root, FREELANCER_CLIENT_SELECTORS);
    let verifications = extractVerifications(clientEl, win);
    if (!hasAnyVerification(verifications)) verifications = extractVerifications(root, win);

    const descEl = query(root, FREELANCER_DESCRIPTION_SELECTORS);
    const description = descEl ? textOf(descEl) : text;

    const priceEl = query(root, FREELANCER_PRICE_SELECTORS);
    const budget = parseBudget(priceEl ? textOf(priceEl) : text);

    const bidEl = query(root, FREELANCER_BID_SELECTORS);
    const bidText = bidEl ? textOf(bidEl) : text;
    const bidInfo = parseBidCount(bidText);
    const bidCount = bidInfo ? bidInfo.count : null;
    const bidTier = parseProposalTier(bidText);

    const { rating, reviewCount } = parseRatingAndReviews(text);

    return {
      platform: 'freelancer',
      title: firstText(root, FREELANCER_TITLE_SELECTORS) || null,
      description,
      budget,
      paymentVerified: verifications.paymentVerified,
      phoneVerified: verifications.phoneVerified,
      hireRate: parseHireRate(text),
      lastViewDays: parseLastView(text),
      totalSpent: parseTotalSpent(text),
      rating,
      reviewCount,
      proposalTier: bidTier,
      proposalCount: bidCount,
      avgBid: (function () { const a = parseAvgBid(text); return a ? a.amount : null; })(),
      bidCount,
      depositMade: verifications.depositMade,
      identityVerified: verifications.identityVerified,
      emailVerified: verifications.emailVerified,
      memberSince: parseMemberSince(text),
      isMicrotask: /microtask|fixed\s+price\s+project|hourly\s+project/i.test(text),
    };
  }
  // ─── API publik ─────────────────────────────────────────────────────────────
  const api = {
    // Fungsi dasar (diekspor agar bisa dipakai ulang / diuji)
    parseBudget,
    parseAvgBid,
    parseHireRate,
    parseTotalSpent,
    parseRatingAndReviews,
    parseMemberSince,
    parseLastView,
    parseProposalTier,
    parseExactProposalCount,
    parseBidCount,
    extractVerifications,
    detectVerifiedStatus,
    hasAnyVerification,

    // Parser per platform
    parseUpworkCard,
    parseUpworkDetail,
    parseFreelancerCard,
    parseFreelancerDetail,

    // Router otomatis: pilih parser berdasarkan platform + konteks
    /**
     * @param {Element} root     Elemen kartu / container detail
     * @param {Object}  opts     { platform: 'upwork'|'freelancer', mode: 'card'|'detail', window }
     */
    parse(root, opts) {
      const o = opts || {};
      const platform = String(o.platform || '').toLowerCase();
      const mode = String(o.mode || 'card').toLowerCase();
      const win = o.window || (root && root.ownerDocument && root.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
      if (platform === 'upwork') {
        return mode === 'detail' ? parseUpworkDetail(root, win) : parseUpworkCard(root, win);
      }
      if (platform === 'freelancer') {
        return mode === 'detail' ? parseFreelancerDetail(root, win) : parseFreelancerCard(root, win);
      }
      return null;
    },
  };

  // ─── Export (UMD-like, aman untuk browser & CommonJS) ──────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.UpworkCalcScamParsers = api;
  }
  if (typeof window !== 'undefined' && window) {
    window.UpworkCalcScamParsers = api;
  }

  return api;
});
