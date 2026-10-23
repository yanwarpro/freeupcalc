/*
 * FreeUp Calc — Scam Engine (logika murni, tanpa DOM)
 *
 * Dipisahkan dari scam-detector.js agar:
 *  1. Ada satu sumber kebenaran untuk aturan skor & kriteria "aman"
 *  2. Bisa diuji otomatis lewat Node (test/test-scam-score.js)
 *
 * Kriteria "AMAN" (kategori 🟢) per platform:
 *  Freelancer.com : Payment verified + Email verified + Deposit made
 *  Upwork.com     : Payment verified + Hire rate > 90% + Last view < 2 hari
 *                   + Phone number verified
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FreeUpScamEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── Scoring Engine ───────────────────────────────────────────────────────────
  // `critical: true` → sinyal scam keras. Risiko ini membatalkan badge 🟢 Aman
  // walaupun seluruh kriteria "aman" platform terpenuhi.
  const RISK = {
    // Generic / Upwork
    PAYMENT_UNVERIFIED: { points: 3, label: 'Payment belum diverifikasi' },
    ZERO_SPENT:         { points: 2, label: '$0 total spending (belum pernah bayar)' },
    LOW_SPENT:          { points: 1, label: 'Spending masih sangat kecil (<$100)' },
    NO_RATING:          { points: 1, label: 'Belum ada rating/ulasan klien' },
    EXTERNAL_CONTACT:   { points: 3, label: 'Minta kontak di luar platform (Telegram/WA/email)', critical: true },
    UNREALISTIC_BUDGET: { points: 2, label: 'Budget tidak realistis vs. kompleksitas pekerjaan' },
    SUSPICIOUS_PATTERN: { points: 1, label: 'Pola deskripsi mencurigakan' },
    // Freelancer-specific
    DEPOSIT_NOT_MADE:   { points: 4, label: 'Deposit belum dibuat — dana belum di-escrow (faktor paling penting)' },
    IDENTITY_UNVERIFIED:{ points: 1, label: 'Identity belum diverifikasi' },
    NEW_ACCOUNT:        { points: 2, label: 'Akun klien baru (< 6 bulan) — waspada fake account' },
    VAGUE_DESCRIPTION:  { points: 1, label: 'Deskripsi proyek terlalu singkat/tidak jelas' },
    TOO_GOOD_TO_BE_TRUE:{ points: 2, label: 'Bayaran terlalu tinggi untuk pekerjaan yang terlalu mudah', critical: true },
    // Email / Phone / Hire rate / Last view (Upwork)
    EMAIL_UNVERIFIED:   { points: 2, label: 'Email belum diverifikasi' },
    PHONE_UNVERIFIED:   { points: 2, label: 'Nomor telepon belum diverifikasi' },
    LOW_HIRE_RATE:      { points: 2, label: 'Hire rate rendah (<= 90%) — klien jarang memakai freelancer' },
    STALE_LAST_VIEW:    { points: 2, label: 'Proyek terakhir dilihat > 2 hari lalu (kemungkinan sudah terisi)' },
    // Metadata baru dari scam-parsers.js (kompetisi & rata-rata bid)
    NO_PROPOSALS:       { points: 1, label: 'Belum ada proposal/bid masuk untuk proyek bernilai besar' },
    LOW_AVG_BID:        { points: 1, label: 'Rata-rata bid jauh di bawah budget — indikasi proyek menggoda murah' },
  };

  // ─── Kriteria "AMAN" per platform ─────────────────────────────────────────────
  // Sebuah proyek hanya berlabel 🟢 Aman bila SEMUA kriteria platform terpenuhi.
  const SAFE_CRITERIA = {
    freelancer: [
      { key: 'paymentVerified', label: 'Payment verified' },
      { key: 'emailVerified',   label: 'Email verified' },
      { key: 'depositMade',     label: 'Deposit made' },
    ],
    upwork: [
      { key: 'paymentVerified', label: 'Payment verified' },
      { key: 'hireRate',        label: 'Hire rate > 90%' },
      { key: 'lastViewDays',    label: 'Terakhir dilihat < 2 hari' },
      { key: 'phoneVerified',   label: 'Phone number verified' },
    ],
  };

  // Ambang batas numerik untuk kriteria aman Upwork
  const SAFE_THRESHOLDS = {
    hireRateMin: 90,      // hire rate harus > 90%
    lastViewMaxDays: 2,   // last view harus < 2 hari
  };

  const OFFPLATFORM_RE = /telegram|whatsapp|wa\.me|signal|line\.me|wechat|\bkik\b|discord\.gg|\bviber\b|gmail\.com|yahoo\.com|hotmail\.com|outlook\.com/i;
  const SCAM_WORDS_RE  = /\bupfront\b|\badvance\s+payment\b|\bsend\s+money\b|\bcheck\s+scam\b|\btraining\s+fee\b|\bno\s+experience\s+needed\b.*\$[\d,]+|\beasy\s+money\b|\bwork\s+from\s+home\b.*\$[\d,]+\s*per\s+(day|hour|week)/i;
  const TOO_GOOD_RE    = /\b(no\s+experience\s+needed|easy\s+(?:money|job|work|task)|quick\s+money|get\s+paid\s+(?:fast|quickly)|make\s+\$[\d,]+\s+(?:per|a|every)\s+(?:day|hour|week|month)|no\s+skills?\s+required|anyone\s+can\s+do)\b/i;

  // ─── Helper: parse "Hire rate: 95%" ─────────────────────────────────────────
  function parseHireRate(text) {
    if (!text) return null;
    const m = text.match(/hire\s*rate\s*:?\s*(\d{1,3}(?:\.\d+)?)\s*%/i)
      || text.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*hire\s*rate/i);
    return m ? parseFloat(m[1]) : null;
  }

  // ─── Helper: parse waktu relatif ("2 hours ago") → jumlah hari (float) ──────
  function parseRelativeTime(text) {
    if (!text) return null;
    // Mapping durasi unit → jumlah hari
    const UNIT_DAYS = {
      second: 1 / 86400, seconds: 1 / 86400, sec: 1 / 86400, secs: 1 / 86400,
      detik: 1 / 86400,
      minute: 1 / 1440, minutes: 1 / 1440, min: 1 / 1440, mins: 1 / 1440, menit: 1 / 1440,
      hour: 1 / 24, hours: 1 / 24, hr: 1 / 24, hrs: 1 / 24, jam: 1 / 24,
      day: 1, days: 1, hari: 1,
      week: 7, weeks: 7, minggu: 7,
      month: 30, months: 30, bulan: 30,
      year: 365, years: 365, tahun: 365,
    };

    const m = text.match(/(\d+)\s*([a-z]+)\s+ago\b/i);
    if (m) {
      const days = UNIT_DAYS[m[2].toLowerCase()];
      if (days !== undefined) return parseInt(m[1], 10) * days;
    }

    if (/just\s*now|momen\s+ini|baru\s+saja/i.test(text)) return 0;
    if (/yesterday|kemarin/i.test(text)) return 1;
    return null;
  }

  // Format hari relatif menjadi teks singkat
  function formatLastView(days) {
    if (days < 1) {
      const h = Math.max(1, Math.round(days * 24));
      return h + ' jam lalu';
    }
    return Math.round(days) + ' hari lalu';
  }

  // ─── Evaluasi kriteria "AMAN" per platform ──────────────────────────────────
  // Setiap kriteria: { key, label, pass, value, known }
  function evaluateSafeCriteria(data, platform) {
    const criteria = SAFE_CRITERIA[platform] || [];
    const out = [];

    for (const c of criteria) {
      const val = data[c.key];
      let pass = false;
      let known = true;

      if (c.key === 'hireRate') {
        known = (typeof val === 'number' && !isNaN(val));
        pass = known && val > SAFE_THRESHOLDS.hireRateMin;
      } else if (c.key === 'lastViewDays') {
        known = (typeof val === 'number' && !isNaN(val));
        pass = known && val < SAFE_THRESHOLDS.lastViewMaxDays;
      } else {
        known = (val === true || val === false);
        pass = (val === true);
      }

      out.push({ key: c.key, label: c.label, pass, value: val, known });
    }

    return out;
  }

  // Cek apakah daftar label risiko mengandung risiko yang ditandai critical
  function hasCriticalRisk(risks) {
    return risks.some(r => {
      for (const key in RISK) {
        if (RISK[key].critical && r.indexOf(RISK[key].label) === 0) return true;
      }
      return false;
    });
  }

  function getRiskLevel(score, critical) {
    if (critical) return { code: 5, label: 'Kritis' };
    if (score > 3) return { code: 4, label: 'Sangat tinggi' };
    if (score === 3) return { code: 3, label: 'Tinggi' };
    if (score > 0) return { code: 2, label: 'Sedang' };
    return { code: 1, label: 'Rendah' };
  }

  // ─── Scoring Engine utama ───────────────────────────────────────────────────
  function scoreCard(data, platform) {
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

    // 2. Deposit made (Freelancer — syarat kategori aman)
    if (data.depositMade === false) {
      score += RISK.DEPOSIT_NOT_MADE.points;
      risks.push(RISK.DEPOSIT_NOT_MADE.label);
    } else if (data.depositMade === true) {
      oks.push('Deposit made ✓ (dana sudah di-escrow)');
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

    // 12. Email verified (Freelancer — syarat kategori aman)
    if (data.emailVerified === false) {
      score += RISK.EMAIL_UNVERIFIED.points;
      risks.push(RISK.EMAIL_UNVERIFIED.label);
    } else if (data.emailVerified === true) {
      oks.push('Email verified ✓');
    }

    // 13. Phone number verified (Upwork — syarat kategori aman)
    if (data.phoneVerified === false) {
      score += RISK.PHONE_UNVERIFIED.points;
      risks.push(RISK.PHONE_UNVERIFIED.label);
    } else if (data.phoneVerified === true) {
      oks.push('Phone number verified ✓');
    }

    // 14. Hire rate (Upwork — syarat kategori aman, harus > 90%)
    if (typeof data.hireRate === 'number' && !isNaN(data.hireRate)) {
      if (data.hireRate > SAFE_THRESHOLDS.hireRateMin) {
        oks.push('Hire rate ' + data.hireRate + '% ✓');
      } else {
        score += RISK.LOW_HIRE_RATE.points;
        risks.push(RISK.LOW_HIRE_RATE.label + ' (' + data.hireRate + '%)');
      }
    }

    // 15. Last view / kapan proyek terakhir dilihat (Upwork — syarat aman, < 2 hari)
    if (typeof data.lastViewDays === 'number' && !isNaN(data.lastViewDays)) {
      if (data.lastViewDays < SAFE_THRESHOLDS.lastViewMaxDays) {
        oks.push('Terakhir dilihat ' + formatLastView(data.lastViewDays) + ' ✓');
      } else {
        score += RISK.STALE_LAST_VIEW.points;
        risks.push(RISK.STALE_LAST_VIEW.label + ' (' + formatLastView(data.lastViewDays) + ')');
      }
    }

    // 16. Kompetisi proposal/bid (dari scam-parsers.js)
    // Hanya bermakna bila proyek bernilai besar: proyek murah tanpa proposal
    // memang wajar, proyek mahal tanpa satu pun proposal mencurigakan.
    if (data.proposalCount === 0 && data.budget && data.budget >= 500) {
      score += RISK.NO_PROPOSALS.points;
      risks.push(RISK.NO_PROPOSALS.label);
    }

    // 17. Rata-rata bid jauh di bawah budget (indikasi proyek "godaan murah")
    if (
      typeof data.avgBid === 'number' && !isNaN(data.avgBid) &&
      typeof data.budget === 'number' && !isNaN(data.budget) &&
      data.budget >= 100 && data.avgBid > 0 && data.avgBid < data.budget * 0.2
    ) {
      score += RISK.LOW_AVG_BID.points;
      risks.push(RISK.LOW_AVG_BID.label + ' ($' + Math.round(data.avgBid) + ' vs budget $' + Math.round(data.budget) + ')');
    }

    // ─── Kriteria "AMAN" per platform ────────────────────────────────────────
    const safeCriteria = evaluateSafeCriteria(data, platform);
    const allSafe = safeCriteria.length > 0 && safeCriteria.every(c => c.pass);
    const missingSafe = safeCriteria.filter(c => !c.pass);

    // ─── Tentukan level ──────────────────────────────────────────────────────
    // Prioritas:
    //  1. Semua kriteria aman platform terpenuhi → 🟢 Aman
    //     (kecuali ada sinyal scam keras, mis. minta kontak di luar platform)
    //  2. Ada sinyal scam keras ATAU skor risiko tinggi → 🔴 Berisiko
    //  3. Selain itu (kriteria aman belum lengkap) → 🟡 Perlu Cek
    let level;
    if (allSafe && !hasCriticalRisk(risks)) {
      level = 'safe';
    } else if (hasCriticalRisk(risks) || score > 3) {
      level = 'risky';
    } else {
      level = 'neutral';
    }

    const criticalRisk = hasCriticalRisk(risks);
    const riskLevel = getRiskLevel(score, criticalRisk);
    return { score, level, risks, oks, safeCriteria, allSafe, missingSafe, criticalRisk, riskLevel };
  }

  return {
    RISK,
    SAFE_CRITERIA,
    SAFE_THRESHOLDS,
    OFFPLATFORM_RE,
    SCAM_WORDS_RE,
    TOO_GOOD_RE,
    parseHireRate,
    parseRelativeTime,
    formatLastView,
    evaluateSafeCriteria,
    hasCriticalRisk,
    getRiskLevel,
    scoreCard,
  };
});
