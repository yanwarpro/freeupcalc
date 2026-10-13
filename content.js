(function () {
  'use strict';

  // ─── Utility ───────────────────────────────────────────────────────────────
  function extractNumber(text) {
    if (!text) return null;
    // Hapus simbol mata uang dan spasi, normalkan koma/titik
    const clean = text.replace(/[^\d.,]/g, '');
    // Tangani format "1,000.00" (US) dan "1.000,00" (EU)
    let normalized;
    if (/,\d{3}/.test(clean) || (/,/.test(clean) && /\./.test(clean) && clean.indexOf(',') < clean.indexOf('.'))) {
      // Format US: 1,000.50 → hilangkan koma
      normalized = clean.replace(/,/g, '');
    } else {
      // Format EU atau ambiguous: ganti koma jadi titik
      normalized = clean.replace(/,/g, '.');
    }
    const match = normalized.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }

  function detectPlatform() {
    const host = location.hostname;
    if (host.includes('upwork.com')) return 'upwork';
    if (host.includes('freelancer.com')) return 'freelancer';
    return 'unknown';
  }

  // ─── Upwork Extractors ──────────────────────────────────────────────────────
  function extractConnectsUpwork() {
    const allText = document.body.innerText;

    const requiredPatterns = [
      /required\s+connects?[^0-9]{0,40}(\d+)/i,
      /(\d+)\s+connects?\s+(?:required|to\s+submit)/i,
      /connects?\s+required[^0-9]{0,40}(\d+)/i,
      /submit\s+a\s+proposal[^0-9]{0,60}(\d+)\s*connects?/i
    ];
    for (const p of requiredPatterns) {
      const m = allText.match(p);
      if (m) return parseInt(m[1], 10);
    }

    const selectors = [
      '[data-test="connects-amount"]',
      '.connects-amount',
      '.connects-count',
      '[class*="connect"]'
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const text = el.textContent || '';
        if (/required/i.test(text)) {
          const m = text.match(/(\d+)/);
          if (m) return parseInt(m[1], 10);
        }
      }
    }

    const patterns = [
      /(\d+)\s*connects?\b/i,
      /connects?\s*[:\-]?\s*(\d+)/i
    ];
    for (const p of patterns) {
      const m = allText.match(p);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  function extractBidAmountUpwork() {
    const inputSelectors = [
      'input[name="amount"]',
      'input[data-test="bid-amount"]',
      'input[placeholder*="amount" i]',
      'input[aria-label*="amount" i]',
      'input[type="number"]'
    ];
    for (const sel of inputSelectors) {
      const el = document.querySelector(sel);
      if (el && el.value) {
        const v = extractNumber(el.value);
        if (v && v > 0) return v;
      }
    }

    const textSelectors = [
      '[data-test="budget"]',
      '.budget-amount',
      '.job-budget'
    ];
    for (const sel of textSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const v = extractNumber(el.textContent);
        if (v && v > 0) return v;
      }
    }
    return null;
  }

  function extractProjectTypeUpwork() {
    // 1. Cek elemen/atribut spesifik di halaman job detail Upwork
    const hourlySelectors = [
      '[data-test="job-type-hourly"]',
      '[data-test="hourly-rate"]',
      '[class*="hourlyRate"]',
      '[class*="HourlyRate"]',
    ];
    for (const sel of hourlySelectors) {
      if (document.querySelector(sel)) return 'hourly';
    }

    const fixedSelectors = [
      '[data-test="job-type-fixed"]',
      '[data-test="fixed-price"]',
      '[class*="fixedPrice"]',
      '[class*="FixedPrice"]',
    ];
    for (const sel of fixedSelectors) {
      if (document.querySelector(sel)) return 'fixed';
    }

    // 2. Cek teks halaman — Upwork menampilkan label eksplisit di job detail
    const allText = document.body.innerText;
    // Urutan penting: periksa hourly lebih dulu
    if (/\bhourly\b/i.test(allText)) return 'hourly';
    if (/fixed[\s\-]?price/i.test(allText)) return 'fixed';

    // Default: fixed (paling umum di Upwork)
    return 'fixed';
  }

  // ─── Freelancer.com Extractors ──────────────────────────────────────────────
  function extractBudgetFreelancer() {
    // 1. Cari elemen dengan label "Budget" / "Anggaran" — pola DOM Freelancer
    const labelSelectors = [
      // Budget card di job detail page
      '[class*="Budget"] [class*="amount"]',
      '[class*="budget"] [class*="amount"]',
      '[class*="Budget"] strong',
      '[class*="budget"] strong',
      // Komponen BidDetails / sidebar
      '.PageProjectViewBidding-projectBudget',
      '.project-detail-budget',
      '[data-section="budget"]',
      // Freelancer Angular components
      'fl-text[color="mid"] + fl-text',
      // Bid input form di halaman Place a Bid
      'input[id*="amount"]',
      'input[name*="amount"]',
      'input[placeholder*="amount" i]',
      'input[placeholder*="bid" i]',
    ];

    for (const sel of labelSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const v = extractNumber(el.textContent || el.value || '');
          if (v && v > 0) return v;
        }
      } catch (e) { /* skip invalid selectors */ }
    }

    // 2. Pendekatan teks — cari pola "$X" atau "USD X" di teks halaman
    const allText = document.body.innerText;
    const budgetPatterns = [
      /Budget[:\s\n]+\$?([\d,]+(?:\.\d{1,2})?)\s*(?:USD)?/i,
      /Anggaran[:\s\n]+\$?([\d,]+(?:\.\d{1,2})?)\s*(?:USD)?/i,
      /Average Bid[:\s\n]+\$?([\d,]+(?:\.\d{1,2})?)/i,
      /Fixed\s+Price[:\s\n]+\$?([\d,]+(?:\.\d{1,2})?)/i,
      /Project Budget[:\s\n]+\$?([\d,]+(?:\.\d{1,2})?)/i,
    ];

    for (const p of budgetPatterns) {
      const m = allText.match(p);
      if (m) {
        const v = extractNumber(m[1]);
        if (v && v > 0) return v;
      }
    }

    // 3. Fallback: semua input number di form bid
    const numInputs = document.querySelectorAll('input[type="number"]');
    for (const el of numInputs) {
      if (el.value) {
        const v = extractNumber(el.value);
        if (v && v > 0) return v;
      }
    }

    return null;
  }

  function extractProjectTypeFreelancer() {
    const allText = document.body.innerText;
    // Cek apakah proyek hourly atau fixed
    if (/hourly/i.test(allText)) return 'hourly';
    if (/fixed[\s\-]?price/i.test(allText)) return 'fixed';
    return 'fixed'; // default ke fixed
  }

  function extractHourlyRateFreelancer() {
    // 1. Coba DOM selector spesifik untuk "Average Bid" / hourly stats card
    const domSelectors = [
      // Card statistik di halaman project detail
      '[class*="AverageBid"]',
      '[class*="average-bid"]',
      '[class*="BidStats"] [class*="amount"]',
      '[class*="bid-stats"] [class*="amount"]',
      // Komponen Angular Freelancer
      'app-hourly-project-stat [class*="value"]',
      '[data-hourly-rate]',
      // Input di form bid (sudah terisi)
      'input[id*="hourly"]',
      'input[name*="hourly"]',
      'input[id*="rate"]',
    ];

    for (const sel of domSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const raw = el.textContent || el.value || el.getAttribute('data-hourly-rate') || '';
          const v = extractNumber(raw);
          if (v && v > 0 && v < 10000) return v; // sanity check rate masuk akal
        }
      } catch (e) { /* skip */ }
    }

    // 2. Cari di teks halaman dengan pola yang lebih beragam
    const allText = document.body.innerText;
    const patterns = [
      // "Avg Bid: $XX/hr" atau "Average Bid: $XX / hr"
      /Avg(?:erage)?\s+Bid\s*[:\-]?\s*\$?([\d,]+(?:\.\d{1,2})?)\s*(?:USD)?\s*\/\s*hr/i,
      // "Average bid USD XX/hr"
      /Average\s+bid\s+USD\s+([\d,]+(?:\.\d{1,2})?)\s*\/\s*hr/i,
      // "$XX / hr" dalam konteks hourly project
      /\$([\d,]+(?:\.\d{1,2})?)\s*\/\s*hr/i,
      // "Hourly Rate: $XX"
      /Hourly\s+Rate\s*[:\-]?\s*\$?([\d,]+(?:\.\d{1,2})?)/i,
      // "Rate: $XX/hr"
      /\bRate\s*[:\-]\s*\$?([\d,]+(?:\.\d{1,2})?)\s*\/\s*hr/i,
    ];

    for (const p of patterns) {
      const m = allText.match(p);
      if (m) {
        const v = extractNumber(m[1]);
        if (v && v > 0 && v < 10000) return v;
      }
    }

    return null;
  }

  // ─── Main Listener ──────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'extractJobData') {
      try {
        const platform = detectPlatform();
        let data = { platform, url: location.href, title: document.title };

        if (platform === 'upwork') {
          const projectType = extractProjectTypeUpwork();
          data.projectType = projectType;
          data.bidAmount = extractBidAmountUpwork();
          data.connectsUsed = extractConnectsUpwork();
          if (projectType === 'hourly') {
            // Untuk Upwork hourly, coba baca rate dari input form bid
            data.hourlyRate = extractBidAmountUpwork(); // Upwork pakai input amount yang sama
            data.bidAmount = null;
          }

        } else if (platform === 'freelancer') {
          const projectType = extractProjectTypeFreelancer();
          data.projectType = projectType;
          data.connectsUsed = 0; // Freelancer tidak pakai connects

          if (projectType === 'hourly') {
            data.hourlyRate = extractHourlyRateFreelancer();
            data.bidAmount = null;
          } else {
            data.bidAmount = extractBudgetFreelancer();
            data.hourlyRate = null;
          }
        }

        sendResponse({ success: true, data });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }

    // ── Handler ringan: hanya platform + projectType, tanpa scrape nilai bid ──
    if (msg.action === 'detectProjectType') {
      try {
        const platform = detectPlatform();
        let projectType = 'fixed';
        if (platform === 'upwork') {
          projectType = extractProjectTypeUpwork();
        } else if (platform === 'freelancer') {
          projectType = extractProjectTypeFreelancer();
        }
        sendResponse({ success: true, data: { platform, projectType } });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }
  });
})();
