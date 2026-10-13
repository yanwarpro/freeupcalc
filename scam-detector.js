/*
 * FreeUp Calc — Scam Detector
 * Diinjeksikan ke halaman listing Upwork & Freelancer.com
 * Memindai setiap kartu proyek dan menambahkan badge risiko.
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
  const isUpwork = host.includes('upwork.com');
  const isFreelancer = host.includes('freelancer.com');
  if (!isUpwork && !isFreelancer) return;

  // ─── Scoring Engine ───────────────────────────────────────────────────────────
  const RISK = {
    PAYMENT_UNVERIFIED: { points: 3, label: 'Payment belum diverifikasi' },
    ZERO_SPENT:         { points: 2, label: '$0 total spending (belum pernah bayar)' },
    LOW_SPENT:          { points: 1, label: 'Spending masih sangat kecil (<$100)' },
    NO_RATING:          { points: 1, label: 'Belum ada rating/ulasan klien' },
    EXTERNAL_CONTACT:   { points: 3, label: 'Minta kontak di luar platform (Telegram/WA/email)' },
    UNREALISTIC_BUDGET: { points: 2, label: 'Budget tidak realistis vs. kompleksitas pekerjaan' },
    SUSPICIOUS_PATTERN: { points: 1, label: 'Pola deskripsi mencurigakan' },
  };

  const OFFPLATFORM_RE = /telegram|whatsapp|wa\.me|signal|line\.me|wechat|\bkik\b|discord\.gg|\bviber\b|gmail\.com|yahoo\.com|hotmail\.com|outlook\.com/i;
  const SCAM_WORDS_RE  = /\bupfront\b|\badvance\s+payment\b|\bsend\s+money\b|\bcheck\s+scam\b|\btraining\s+fee\b|\bno\s+experience\s+needed\b.*\$[\d,]+|\beasy\s+money\b|\bwork\s+from\s+home\b.*\$[\d,]+\s*per\s+(day|hour|week)/i;

  function scoreCard(data) {
    const risks = [];
    const oks = [];
    let score = 0;

    // 1. Payment verification
    if (data.paymentVerified === false) {
      score += RISK.PAYMENT_UNVERIFIED.points;
      risks.push(RISK.PAYMENT_UNVERIFIED.label);
    } else if (data.paymentVerified === true) {
      oks.push('Payment verified ✓');
    }

    // 2. Total spent
    if (data.totalSpent !== null) {
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

    // 3. Rating
    if (data.rating !== null && data.rating === 0 && data.reviewCount === 0) {
      score += RISK.NO_RATING.points;
      risks.push(RISK.NO_RATING.label);
    } else if (data.rating > 0) {
      oks.push('Rating ' + data.rating.toFixed(1) + '/5.0 ✓');
    }

    // 4. Off-platform contact di deskripsi
    if (data.description && OFFPLATFORM_RE.test(data.description)) {
      score += RISK.EXTERNAL_CONTACT.points;
      risks.push(RISK.EXTERNAL_CONTACT.label);
    }

    // 5. Pola kata scam di deskripsi
    if (data.description && SCAM_WORDS_RE.test(data.description)) {
      score += RISK.SUSPICIOUS_PATTERN.points;
      risks.push(RISK.SUSPICIOUS_PATTERN.label);
    }

    // 6. Budget tidak realistis (sangat kecil: <$5 untuk proyek bukan microtask)
    if (data.budget !== null && data.budget > 0 && data.budget < 5 && !data.isMicrotask) {
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
  function makeBadge(result) {
    const LABELS = { safe: '🟢 Aman', neutral: '🟡 Perlu Cek', risky: '🔴 Berisiko' };
    const CLASSES = { safe: 'freeup-safe', neutral: 'freeup-neutral', risky: 'freeup-risky' };

    const label = LABELS[result.level];
    const cls = CLASSES[result.level];

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
      <span class="freeup-badge ${cls}">
        ${label}
        <span class="freeup-badge-tooltip">${tooltipContent}</span>
      </span>`;
    return wrap;
  }

  // ─── UPWORK Parser ─────────────────────────────────────────────────────────────
  function parseUpworkCard(card) {
    const text = card.innerText || '';
    const html = card.innerHTML || '';

    // Payment verified: ikon centang atau teks "Payment verified"
    let paymentVerified = null;
    if (/payment\s+verified/i.test(text)) paymentVerified = true;
    else if (/payment\s+unverified|unverified/i.test(text)) paymentVerified = false;
    // Cek ikon (Upwork pakai aria-label atau data-test)
    if (card.querySelector('[data-test="payment-verified"]')) paymentVerified = true;
    if (card.querySelector('[data-test="payment-unverified"]')) paymentVerified = false;

    // Total spent
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

    // Rating
    let rating = null, reviewCount = 0;
    const ratingMatch = text.match(/([\d.]+)\s*(?:out\s+of\s+5|\/\s*5)/i)
      || text.match(/(?:rating|score)[:\s]*([\d.]+)/i);
    if (ratingMatch) rating = parseFloat(ratingMatch[1]);
    const reviewMatch = text.match(/([\d,]+)\s*(?:review|feedback|job)/i);
    if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);

    // Budget
    let budget = null;
    const budgetMatch = text.match(/(?:budget|fixed)[:\s]*\$\s*([\d,.]+)/i)
      || text.match(/\$\s*([\d,.]+)\s*(?:–|-|to)\s*\$\s*([\d,.]+)\s*\/\s*hr/i)
      || text.match(/est\.\s*budget[:\s]*\$\s*([\d,.]+)/i);
    if (budgetMatch) budget = parseFloat(budgetMatch[1].replace(/,/g, ''));

    // Description / judul
    const description = text;

    return { paymentVerified, totalSpent, rating, reviewCount, budget, description, isMicrotask: false };
  }

  // ─── Freelancer Parser ─────────────────────────────────────────────────────────
  function parseFreelancerCard(card) {
    const text = card.innerText || '';

    // Payment: Freelancer tidak tampilkan eksplisit di card listing, set null
    const paymentVerified = null;

    // Budget/bid
    let budget = null;
    const budgetMatch = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
    if (budgetMatch) budget = parseFloat(budgetMatch[1].replace(/,/g, ''));

    // Rating
    let rating = null, reviewCount = 0;
    const ratingMatch = text.match(/([\d.]+)\s*\/?\s*5/);
    if (ratingMatch) rating = parseFloat(ratingMatch[1]);

    const description = text;
    return { paymentVerified: null, totalSpent: null, rating, reviewCount, budget, description, isMicrotask: false };
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

      // Cari tempat inject yang baik (judul atau footer kartu)
      const anchor =
        card.querySelector('[data-test="job-title"], h2, h3, .job-title, .project-title, .JobTitle, .listing-title') ||
        card.querySelector('header, .job-header, .card-header') ||
        card;

      anchor.insertAdjacentElement('afterend', badge);
    } catch (e) {
      // Silent fail per kartu
    }
  }

  function scanAll() {
    if (isUpwork) {
      // Upwork job tiles di halaman search
      const cards = document.querySelectorAll(
        '[data-test="job-tile"], .job-tile, [class*="JobTile"], article[data-job-uid], section[data-ev-job-uid]'
      );
      cards.forEach(card => processCard(card, parseUpworkCard));
    }

    if (isFreelancer) {
      const cards = document.querySelectorAll(
        '.JobSearchCard-item, [class*="project-card"], .search-result-item, .project-list-item'
      );
      cards.forEach(card => processCard(card, parseFreelancerCard));
    }
  }

  // ─── Pertama kali scan ────────────────────────────────────────────────────────
  // Tunggu DOM ready
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
        // Hapus semua badge yang sudah ada
        document.querySelectorAll('.freeup-badge-wrap').forEach(el => el.remove());
        document.querySelectorAll('[data-freeup-scanned]').forEach(el => el.removeAttribute('data-freeup-scanned'));
      }
    }
  });
})();
