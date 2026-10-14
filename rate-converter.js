/* ============================================================
 * FreeUp Calc — Rate Kurs Conversion Badge
 * Diinjeksikan ke halaman listing Upwork & Freelancer.com
 * Menampilkan badge konversi nilai Rupiah (IDR) tepat di atas
 * rate/budget pada setiap kartu proyek di list.
 * ============================================================ */
(async function () {
  'use strict';

  // ─── Default Config ─────────────────────────────────────────────────────────
  const DEFAULT_KURS_CONFIG = {
    enabled: true,
    targetCurrency: 'IDR',
    rates: {
      USD: 16000,
      EUR: 17500,
      GBP: 21000,
      AUD: 10500,
      CAD: 11800,
      SGD: 12200,
      INR: 190
    }
  };

  let activeConfig = { ...DEFAULT_KURS_CONFIG };

  // ─── Ambil konfigurasi dari storage ─────────────────────────────────────────
  function loadConfig() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
          resolve(activeConfig);
          return;
        }

        chrome.storage.sync.get(['freeupGlobalConfig', 'freeupCalcConfig'], (result) => {
          if (chrome.runtime.lastError) {
            console.warn('[FreeUp Rate Converter] Storage read error:', chrome.runtime.lastError);
            resolve(activeConfig);
            return;
          }

          const globalCfg = result ? (result.freeupGlobalConfig || {}) : {};
          const savedKurs = globalCfg.kursConversion || {};

          activeConfig = {
            enabled: savedKurs.enabled !== false,
            targetCurrency: savedKurs.targetCurrency || 'IDR',
            rates: {
              ...DEFAULT_KURS_CONFIG.rates,
              ...(savedKurs.rates || {})
            }
          };

          const calcCfg = result ? (result.freeupCalcConfig || {}) : {};
          const upworkRate = calcCfg.upwork?.exchangeRate;
          if (upworkRate && !savedKurs.rates?.USD) {
            activeConfig.rates.USD = upworkRate;
          }

          resolve(activeConfig);
        });
      } catch (err) {
        console.warn('[FreeUp Rate Converter] Load config error:', err);
        resolve(activeConfig);
      }
    });
  }

  await loadConfig();

  const host = location.hostname;
  const isTest = location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1';
  const isUpwork = host.includes('upwork.com') || isTest;
  const isFreelancer = host.includes('freelancer.com') || isTest;
  if (!isUpwork && !isFreelancer) return;

  // ─── Helper Formatting Rupiah ───────────────────────────────────────────────
  function formatRupiah(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return 'Rp 0';
    const rounded = Math.round(amount);
    return 'Rp ' + rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // ─── Helper Parser Nilai Rate/Budget Umum ───────────────────────────────────
  function parseRateText(text) {
    if (!text) return null;
    const clean = text.replace(/[\n\r\t]+/g, ' ').trim();

    // 1. Deteksi Mata Uang
    let currency = 'USD';
    const codeMatch = clean.match(/\b(USD|EUR|GBP|INR|AUD|CAD|SGD|MYR|PHP|JPY|CNY|NZD|HKD|CHF|IDR)\b/i);
    if (codeMatch) {
      currency = codeMatch[1].toUpperCase();
    } else if (/₹/.test(clean)) {
      currency = 'INR';
    } else if (/€/.test(clean)) {
      currency = 'EUR';
    } else if (/£/.test(clean)) {
      currency = 'GBP';
    } else if (/¥/.test(clean)) {
      currency = 'JPY';
    } else if (/A\$|AUD/i.test(clean)) {
      currency = 'AUD';
    } else if (/C\$|CAD/i.test(clean)) {
      currency = 'CAD';
    } else if (/S\$|SGD/i.test(clean)) {
      currency = 'SGD';
    } else if (/Rp|IDR/i.test(clean)) {
      currency = 'IDR';
    } else if (/\$/.test(clean)) {
      currency = 'USD';
    }

    // 2. Deteksi Hourly vs Fixed
    const isHourly = /\b(?:hr|hour|hourly|\/\s*hr)\b/i.test(clean);

    // 3. Pola Range (contoh: "$250 - $750", "$20.00 - $40.00", "20.00-40.00", "₹1,500 - 12,500")
    const rangeMatch = clean.match(/(?:[\$€£₹¥A-Za-z]{1,4}\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:[\$€£₹¥A-Za-z]{1,4})?\s*(?:[-–—]|\bto\b)\s*(?:[\$€£₹¥A-Za-z]{1,4}\s*)?([\d,]+(?:\.\d{1,2})?)/i);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
      const max = parseFloat(rangeMatch[2].replace(/,/g, ''));
      if (!isNaN(min) && !isNaN(max) && min > 0) {
        return { currency, min, max, isHourly, isRange: true };
      }
    }

    // 4. Pola Single Amount
    const moneyMatch = clean.match(/(?:[\$€£₹¥]\s*|\b(?:budget|rate|hourly|fixed)[:\s]*[\$€£₹¥]?\s*)([\d,]+(?:\.\d{1,2})?)/i)
      || clean.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:USD|EUR|GBP|INR|AUD|CAD|SGD|MYR|PHP|JPY|IDR)/i);

    if (moneyMatch) {
      const val = parseFloat(moneyMatch[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        return { currency, min: val, max: null, isHourly, isRange: false };
      }
    }

    const numMatch = clean.match(/([\d,]+(?:\.\d{1,2})?)/);
    if (numMatch) {
      const val = parseFloat(numMatch[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0 && (val >= 5 || isHourly)) {
        return { currency, min: val, max: null, isHourly, isRange: false };
      }
    }

    return null;
  }

  // ─── Helper Konversi ke IDR ─────────────────────────────────────────────────
  function convertRateToIdr(rateInfo, rates) {
    if (!rateInfo) return null;
    const { currency, min, max, isHourly, isRange } = rateInfo;

    if (currency === 'IDR') {
      const text = isRange && max
        ? `${formatRupiah(min)} - ${formatRupiah(max)}${isHourly ? ' / jam' : ''}`
        : `${formatRupiah(min)}${isHourly ? ' / jam' : ''}`;
      return {
        text,
        tooltip: 'Mata uang proyek sudah dalam Rupiah (IDR)'
      };
    }

    const rate = (rates && rates[currency]) || (currency === 'USD' ? 16000 : null);
    if (!rate || rate <= 0) return null;

    const minIdr = Math.round(min * rate);
    const maxIdr = max ? Math.round(max * rate) : null;
    const rateFmt = formatRupiah(rate);
    const tooltip = `Kurs: 1 ${currency} = ${rateFmt} (FreeUp Calc)`;

    const text = isRange && maxIdr
      ? `≈ ${formatRupiah(minIdr)} - ${formatRupiah(maxIdr)}${isHourly ? ' / jam' : ''}`
      : `≈ ${formatRupiah(minIdr)}${isHourly ? ' / jam' : ''}`;

    return { text, tooltip };
  }

  // ─── Buat Elemen Badge ──────────────────────────────────────────────────────
  function createBadge(idrResult) {
    const wrap = document.createElement('span');
    wrap.className = 'freeup-rate-badge-wrap';
    wrap.setAttribute('data-freeup-rate-badge', '1');

    const badge = document.createElement('span');
    badge.className = 'freeup-rate-badge';
    badge.setAttribute('title', idrResult.tooltip);

    const icon = document.createElement('span');
    icon.className = 'freeup-rate-badge-icon';
    icon.textContent = '🇮🇩';

    const text = document.createElement('span');
    text.className = 'freeup-rate-badge-text';
    text.textContent = idrResult.text;

    badge.appendChild(icon);
    badge.appendChild(text);
    wrap.appendChild(badge);

    return wrap;
  }

  // ─── UPWORK Rate Extractor (Sangat Tangguh & Fleksibel) ───────────────────────
  function extractUpworkRateInfo(card) {
    const cardText = card.innerText || card.textContent || '';
    if (!cardText) return null;

    // 1. Tentukan apakah proyek Hourly atau Fixed-Price
    const isHourly = /\bhourly\b|\/\s*hr\b/i.test(cardText);

    // 2. Cek elemen spesifik Upwork di DOM jika tersedia
    const explicitEls = card.querySelectorAll(
      '[data-test="is-fixed-price"], [data-test="budget"], [data-cy="budget"], [data-test="hourly-rate"], [data-test="is-hourly"], [data-test="job-type-label"], [data-test="job-type"]'
    );
    for (const el of explicitEls) {
      const txt = el.innerText || el.textContent || '';
      if (/\$[\d,.]+/i.test(txt)) {
        // Cek range
        const r = txt.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*[-–—to]+\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
        if (r) {
          return {
            currency: 'USD',
            min: parseFloat(r[1].replace(/,/g, '')),
            max: parseFloat(r[2].replace(/,/g, '')),
            isHourly: true,
            isRange: true
          };
        }
        // Cek single
        const s = txt.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
        if (s) {
          const val = parseFloat(s[1].replace(/,/g, ''));
          if (val > 0) {
            return {
              currency: 'USD',
              min: val,
              max: null,
              isHourly,
              isRange: false
            };
          }
        }
      }
    }

    // 3. Pola Rentang Dollar di Seluruh Kartu (mis. "$25.00 - $50.00", "$20.00-$40.00", "$25 - 50")
    const rangeMatch = cardText.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*[-–—to]+\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
      const max = parseFloat(rangeMatch[2].replace(/,/g, ''));
      if (!isNaN(min) && !isNaN(max) && min > 0) {
        return {
          currency: 'USD',
          min,
          max,
          isHourly: true,
          isRange: true
        };
      }
    }

    // 4. Pola Nominal Tunggal Terkait Est. Budget atau Hourly Rate
    const explicitPattern = /(?:Est\.\s*Budget|Budget|Fixed[\s\-]?price|Hourly|Rate)[\s:\-]*\$\s*([\d,]+(?:\.\d{1,2})?)/i;
    const expMatch = cardText.match(explicitPattern);
    if (expMatch) {
      const val = parseFloat(expMatch[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        return {
          currency: 'USD',
          min: val,
          max: null,
          isHourly,
          isRange: false
        };
      }
    }

    // 5. Fallback: Cari semua angka dollar di kartu, abaikan spending klien ($XXk+ spent / $0 spent)
    const dollarMatches = cardText.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*([kKmM\+]?)\s*(spent)?/gi);
    for (const dm of dollarMatches) {
      const suffix = dm[2] || '';
      const isSpent = dm[3] || /spent/i.test(cardText.substring(dm.index, dm.index + 30));
      if (isSpent || suffix.toLowerCase() === 'k' || suffix.toLowerCase() === 'm' || suffix === '+') {
        continue; // Skip spending klien
      }
      const val = parseFloat(dm[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        return {
          currency: 'USD',
          min: val,
          max: null,
          isHourly,
          isRange: false
        };
      }
    }

    return null;
  }

  // ─── UPWORK Card Processor ──────────────────────────────────────────────────
  function processUpworkCard(card) {
    if (card.hasAttribute('data-freeup-rate-scanned')) return;

    const rateInfo = extractUpworkRateInfo(card);
    if (!rateInfo) return;

    const idrResult = convertRateToIdr(rateInfo, activeConfig.rates);
    if (!idrResult) return;

    if (card.querySelector('.freeup-rate-badge-wrap')) return;

    const badge = createBadge(idrResult);

    // ─── Penempatan Badge Rapi & Enak Dilihat ─────────────────────────────────
    // 1. Jika sudah ada scam badge, letakkan berdampingan tepat di sampingnya
    const scamBadge = card.querySelector('.freeup-badge-wrap');
    if (scamBadge) {
      scamBadge.insertAdjacentElement('afterend', badge);
      card.setAttribute('data-freeup-rate-scanned', '1');
      return;
    }

    // 2. Letakkan di bawah judul (heading) proyek
    const titleHeading = card.querySelector(
      '[data-test="job-title"], [data-test="job-tile-title"], h2, h3, .job-title, .project-title, [class*="job-title" i], [class*="title" i], .job-tile-header, header'
    );
    if (titleHeading) {
      titleHeading.insertAdjacentElement('afterend', badge);
      card.setAttribute('data-freeup-rate-scanned', '1');
      return;
    }

    // 3. Fallback via title link
    const titleLink = card.querySelector('a[data-test="job-tile-title-link"], a[href*="/jobs/"]');
    if (titleLink) {
      const heading = titleLink.closest('h1, h2, h3, h4, [class*="title" i], div[class*="header" i]') || titleLink.parentElement;
      heading.insertAdjacentElement('afterend', badge);
      card.setAttribute('data-freeup-rate-scanned', '1');
      return;
    }

    // 4. Fallback sebelum baris metadata / rincian rate
    const metaRow = card.querySelector(
      'ul[class*="token" i], ul[class*="info" i], [data-test="job-tile-info"], [class*="job-tile-info" i], [class*="details" i]'
    );
    if (metaRow) {
      metaRow.insertAdjacentElement('beforebegin', badge);
      card.setAttribute('data-freeup-rate-scanned', '1');
      return;
    }

    // 5. Fallback terakhir: di awal kartu
    card.insertBefore(badge, card.firstChild);
    card.setAttribute('data-freeup-rate-scanned', '1');
  }

  // ─── UPWORK Card Finder ─────────────────────────────────────────────────────
  function findUpworkCards() {
    const cards = new Set();
    const selectors = [
      'article[data-test="JobTile"]',
      'section[data-test="JobTile"]',
      'div[data-test="JobTile"]',
      '[data-test="job-tile"]',
      '[data-test="JobTile"]',
      '[data-ev-job-uid]',
      '[data-job-uid]',
      '[data-qa="job-tile"]',
      '.job-tile',
      '[class*="JobTile"]',
      'section[class*="air3-card"]',
      'article[class*="air3-card"]',
      '[data-test="job-tile-list"] > section',
      '[data-test="job-tile-list"] > article',
      '[data-test="job-tile-list"] > div'
    ];

    document.querySelectorAll(selectors.join(', ')).forEach(el => cards.add(el));

    // Fallback: temukan kartu dari seluruh tautan judul pekerjaan
    const titleLinks = document.querySelectorAll(
      'a[data-test="job-tile-title-link"], [data-test="job-tile-title"] a, a[href*="/jobs/~"]'
    );
    titleLinks.forEach(link => {
      let card = link.closest(
        'article, section, [data-ev-job-uid], [data-job-uid], [data-test="JobTile"], [data-test="job-tile"], .air3-card-section, [class*="card"]'
      );
      if (!card) {
        let cur = link.parentElement;
        while (cur && cur !== document.body) {
          if (cur.tagName === 'ARTICLE' || cur.tagName === 'SECTION' || (cur.tagName === 'DIV' && cur.innerText && /\$[\d,.]+/.test(cur.innerText))) {
            card = cur;
            break;
          }
          cur = cur.parentElement;
        }
      }
      if (card) cards.add(card);
    });

    return Array.from(cards);
  }

  // ─── FREELANCER Scanner ─────────────────────────────────────────────────────
  function processFreelancerCard(card) {
    if (card.hasAttribute('data-freeup-rate-scanned')) return;

    const priceSelectors = [
      '.JobSearchCard-primary-price',
      '.JobSearchCard-secondary-price',
      '[class*="primary-price"]',
      '[class*="secondary-price"]',
      '[data-test="project-budget"]',
      '[data-test="project-price"]',
      '.project-item__price',
      '.project-card__price',
      'fl-text[class*="price"]',
      'span[class*="price"]'
    ];

    let priceEl = null;
    for (const sel of priceSelectors) {
      const el = card.querySelector(sel);
      if (el) {
        priceEl = el;
        break;
      }
    }

    if (!priceEl) {
      const candidates = card.querySelectorAll('div, span, fl-text, p, strong');
      for (const el of candidates) {
        if (el.children.length > 2) continue;
        const t = el.innerText || el.textContent || '';
        if (t.length < 60 && /(?:\$|€|£|₹|A\$|C\$|S\$|IDR|USD|EUR|GBP|INR)[\s]*[\d,.]+/i.test(t)) {
          priceEl = el;
          break;
        }
      }
    }

    if (!priceEl) return;

    const priceText = priceEl.innerText || priceEl.textContent || '';
    const rateInfo = parseRateText(priceText) || parseRateText(card.innerText || '');
    if (!rateInfo) return;

    const idrResult = convertRateToIdr(rateInfo, activeConfig.rates);
    if (!idrResult) return;

    if (card.querySelector('.freeup-rate-badge-wrap')) return;

    const badge = createBadge(idrResult);
    priceEl.insertAdjacentElement('beforebegin', badge);
    card.setAttribute('data-freeup-rate-scanned', '1');
  }

  // ─── FREELANCER Detail Page Scanner ─────────────────────────────────────────
  function processFreelancerDetailPage() {
    if (document.body.hasAttribute('data-freeup-rate-detail-scanned')) return;

    const budgetSelectors = [
      '.PageProjectViewBidding-projectBudget',
      '.project-detail-budget',
      '[data-section="budget"]',
      '[class*="Budget"] [class*="amount"]',
      '[class*="budget"] [class*="amount"]',
      '[class*="BidStats"] [class*="amount"]',
      'app-hourly-project-stat [class*="value"]'
    ];

    let budgetEl = null;
    for (const sel of budgetSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        budgetEl = el;
        break;
      }
    }

    if (!budgetEl) return;

    const text = budgetEl.innerText || budgetEl.textContent || '';
    const rateInfo = parseRateText(text);
    if (!rateInfo) return;

    const idrResult = convertRateToIdr(rateInfo, activeConfig.rates);
    if (!idrResult) return;

    if (document.querySelector('.freeup-rate-badge-wrap')) return;

    const badge = createBadge(idrResult);
    budgetEl.insertAdjacentElement('beforebegin', badge);
    document.body.setAttribute('data-freeup-rate-detail-scanned', '1');
  }

  // ─── Scan All Cards ─────────────────────────────────────────────────────────
  function scanAll() {
    if (!activeConfig.enabled) {
      removeAllBadges();
      return;
    }

    if (isUpwork) {
      const cards = findUpworkCards();
      cards.forEach(processUpworkCard);
    }

    if (isFreelancer) {
      const path = location.pathname || '';
      const isDetailPage = /\/projects?\//i.test(path);

      if (isDetailPage) {
        processFreelancerDetailPage();
      }

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
        'li[class*="project"]'
      ].join(', ');

      const cards = document.querySelectorAll(selectorList);
      cards.forEach(processFreelancerCard);
    }
  }

  function removeAllBadges() {
    document.querySelectorAll('.freeup-rate-badge-wrap').forEach(el => el.remove());
    document.querySelectorAll('[data-freeup-rate-scanned]').forEach(el => el.removeAttribute('data-freeup-rate-scanned'));
    document.body.removeAttribute('data-freeup-rate-detail-scanned');
  }

  // ─── Eksekusi Scan & Antisipasi SPA ─────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAll);
  } else {
    scanAll();
  }

  // Jalankan interval bertahap saat halaman/tab SPA baru saja dimuat
  [200, 500, 1000, 2000, 3500, 5000].forEach(delay => setTimeout(scanAll, delay));

  // Tangkap perpindahan tab router SPA (History API pushState/replaceState)
  window.addEventListener('popstate', () => setTimeout(scanAll, 300));
  try {
    const origPush = history.pushState;
    history.pushState = function () {
      origPush.apply(this, arguments);
      setTimeout(scanAll, 300);
      setTimeout(scanAll, 1200);
    };
    const origReplace = history.replaceState;
    history.replaceState = function () {
      origReplace.apply(this, arguments);
      setTimeout(scanAll, 300);
      setTimeout(scanAll, 1200);
    };
  } catch (e) {}

  // ─── MutationObserver untuk SPA (Infinite Scroll / Paginasi) ───────────────
  let observerTimer = null;
  const observer = new MutationObserver((mutations) => {
    let hasNewNodes = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }
    if (hasNewNodes) {
      clearTimeout(observerTimer);
      observerTimer = setTimeout(scanAll, 200);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ─── Runtime Message Listener ───────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'kursConversionToggle') {
      activeConfig.enabled = !!msg.enabled;
      if (activeConfig.enabled) {
        scanAll();
      } else {
        removeAllBadges();
      }
    } else if (msg.action === 'kursRatesUpdated') {
      if (msg.config) {
        activeConfig = {
          enabled: msg.config.enabled !== false,
          targetCurrency: msg.config.targetCurrency || 'IDR',
          rates: {
            ...activeConfig.rates,
            ...(msg.config.rates || {})
          }
        };
      }
      removeAllBadges();
      scanAll();
    }
  });
})();
