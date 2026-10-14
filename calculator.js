(function (global) {
  'use strict';

  const DEFAULT_CONFIG = {
    upwork: {
      serviceFeeRate: 10,
      connectPrice: 0.15,
      vatRate: 0,
      fxMargin: 0,
      targetCurrency: 'IDR',
      exchangeRate: 16000,
      selectedMethod: 'paypal',
      methods: {
        ach_us: { name: 'Direct to U.S. Bank (ACH)', flatFee: 0, providerRate: 0, fxMargin: 0 },
        local_bank: { name: 'Direct to Local Bank', flatFee: 0.99, providerRate: 0, fxMargin: 0 },
        wire: { name: 'U.S. Dollar Wire Transfer', flatFee: 50, providerRate: 0, fxMargin: 0 },
        instant_pay: { name: 'Instant Pay (U.S.)', flatFee: 2, providerRate: 0, fxMargin: 0 },
        paypal: { name: 'PayPal', flatFee: 2, providerRate: 2.9, fxMargin: 2.5 },
        payoneer: { name: 'Payoneer', flatFee: 1, providerRate: 0.5, fxMargin: 1.5 },
        wise_ach: { name: 'Wise (ACH - US Domestic)', flatFee: 0, providerRate: 0, fxMargin: 0.4 },
        wise_swift: { name: 'Wise (SWIFT Wire)', flatFee: 6.11, providerRate: 0, fxMargin: 0.4 }
      }
    },
    freelancer: {
      serviceFeeRate: 10,
      connectPrice: 0,
      vatRate: 0,
      fxMargin: 0,
      targetCurrency: 'IDR',
      exchangeRate: 16000,
      selectedMethod: 'paypal',
      methods: {
        ach_us: { name: 'Direct to U.S. Bank (ACH)', flatFee: 0, providerRate: 0, fxMargin: 0 },
        local_bank: { name: 'Direct to Local Bank', flatFee: 0.99, providerRate: 0, fxMargin: 0 },
        wire: { name: 'U.S. Dollar Wire Transfer', flatFee: 50, providerRate: 0, fxMargin: 0 },
        instant_pay: { name: 'Instant Pay (U.S.)', flatFee: 2, providerRate: 0, fxMargin: 0 },
        paypal: { name: 'PayPal', flatFee: 2, providerRate: 2.9, fxMargin: 2.5 },
        payoneer: { name: 'Payoneer', flatFee: 1, providerRate: 0.5, fxMargin: 1.5 },
        wise_ach: { name: 'Wise (ACH - US Domestic)', flatFee: 0, providerRate: 0, fxMargin: 0.4 },
        wise_swift: { name: 'Wise (SWIFT Wire)', flatFee: 6.11, providerRate: 0, fxMargin: 0.4 }
      }
    }
  };

  // Config global (bukan per-platform)
  const DEFAULT_GLOBAL_CONFIG = {
    scamDetector: {
      enabled: true  // ON/OFF fitur deteksi scam di halaman listing
    },
    kursConversion: {
      enabled: true,  // ON/OFF fitur kurs conversion badge di list projek
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
    }
  };

  async function loadGlobalConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('freeupGlobalConfig', (result) => {
        const saved = result.freeupGlobalConfig || {};
        resolve(Object.assign({}, DEFAULT_GLOBAL_CONFIG, saved));
      });
    });
  }

  async function saveGlobalConfig(cfg) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ freeupGlobalConfig: cfg }, resolve);
    });
  }

  function loadConfig(platform = 'upwork') { // Add platform parameter
    return new Promise((resolve) => {
      chrome.storage.sync.get('freeupCalcConfig', (data) => {
        const saved = data.freeupCalcConfig || {};
        const platformConfig = deepMerge(DEFAULT_CONFIG[platform], saved[platform] || {});
        resolve(platformConfig);
      });
    });
  }

  function saveConfig(config, platform = 'upwork') { // Add platform parameter
    return new Promise((resolve) => {
      chrome.storage.sync.set({ freeupCalcConfig: { [platform]: config } }, () => resolve());
    });
  }

  function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  function calculate(inputs, config) {
    const bidAmount = parseFloat(inputs.bidAmount) || 0;
    const connectsUsed = parseFloat(inputs.connectsUsed) || 0;
    const methodKey = inputs.method || config.selectedMethod;
    const method = config.methods[methodKey] || config.methods.paypal;
    const platform = inputs.platform || 'upwork'; // Default to upwork
    const projectType = inputs.projectType || 'fixed'; // Default to fixed

    let serviceFee;
    if (platform === 'freelancer') {
      const calculatedFee = bidAmount * 0.10; // 10% fee
      serviceFee = round2(Math.max(calculatedFee, 5)); // Minimum $5
    } else { // Default to Upwork logic
      serviceFee = round2(bidAmount * (config.serviceFeeRate / 100));
    }
    const vatOnFee = round2(serviceFee * (config.vatRate / 100));
    const afterServiceFee = round2(bidAmount - serviceFee - vatOnFee);

    const connectCost = round2(connectsUsed * config.connectPrice);
    const afterConnects = round2(afterServiceFee - connectCost);

    const withdrawalFlat = round2(method.flatFee);
    const providerFee = round2(afterConnects * (method.providerRate / 100));
    const afterWithdrawal = round2(afterConnects - withdrawalFlat - providerFee);

    const fxRate = method.fxMargin ?? config.fxMargin ?? 0;
    const fxCost = round2(afterWithdrawal * (fxRate / 100));
    const netUsd = round2(afterWithdrawal - fxCost);

    const netTarget = round2(netUsd * config.exchangeRate);

    const totalFees = round2(serviceFee + vatOnFee + connectCost + withdrawalFlat + providerFee + fxCost);
    const takeHomePct = bidAmount > 0 ? round2((netUsd / bidAmount) * 100) : 0;

    return {
      bidAmount,
      serviceFee,
      vatOnFee,
      afterServiceFee,
      connectCost,
      afterConnects,
      withdrawalFlat,
      providerFee,
      afterWithdrawal,
      fxCost,
      netUsd,
      netTarget,
      totalFees,
      takeHomePct,
      methodName: method.name,
      methodKey
    };
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  async function fetchExchangeRate() {
    try {
      const response = await fetch('https://allratestoday.com/api/open/central-bank/bi?source=USD&target=IDR');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data && data.rate) {
        return data.rate;
      } else {
        throw new Error('Invalid API response for exchange rate');
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      return null; // Return null on error
    }
  }

  // ─── Currency conversion helpers ────────────────────────────────────────────
  // Cache rate exchange agar tidak fetch berulang (12 jam)
  const _rateCache = { data: null, ts: 0 };
  const RATE_CACHE_MS = 12 * 60 * 60 * 1000;

  async function fetchUsdRates() {
    const now = Date.now();
    if (_rateCache.data && (now - _rateCache.ts) < RATE_CACHE_MS) {
      return _rateCache.data;
    }
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data && data.rates) {
        _rateCache.data = data.rates;
        _rateCache.ts = now;
        return data.rates;
      }
    } catch (e) {
      console.error('Error fetching USD rates:', e);
    }
    return null;
  }

  // Konversi amount dari mata uang `currency` ke USD
  async function convertToUsd(amount, currency) {
    if (!amount || !currency) return amount;
    currency = currency.toUpperCase();
    if (currency === 'USD') return amount;
    const rates = await fetchUsdRates();
    if (!rates) return amount; // fallback: tidak bisa konversi, return asli
    const rate = rates[currency];
    if (!rate || rate <= 0) return amount;
    return round2(amount / rate);
  }

  const CURRENCY_LOCALES = {
    IDR: 'id-ID',
    USD: 'en-US',
    EUR: 'de-DE',
    GBP: 'en-GB',
    PHP: 'en-PH',
    INR: 'en-IN',
    MYR: 'ms-MY',
    SGD: 'en-SG',
    AUD: 'en-AU',
    CAD: 'en-CA',
    JPY: 'ja-JP',
    CNY: 'zh-CN'
  };

  function formatCurrency(amount, currency) {
    const cur = (currency || 'USD').toUpperCase();
    const locale = CURRENCY_LOCALES[cur] || 'en-US';
    try {
      const options = {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      };
      if (cur === 'IDR') {
        // IDR: exchange rate sudah disimpan sebagai nilai penuh (misal 16000),
        // jadi TIDAK perlu dikalikan lagi. Cukup format tanpa desimal.
        options.minimumFractionDigits = 0;
        options.maximumFractionDigits = 0;
      }
      return new Intl.NumberFormat(locale, options).format(amount);
    } catch (e) {
      return '$' + amount.toFixed(2);
    }
  }

  function formatRupiah(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return 'Rp 0';
    const rounded = Math.round(amount);
    return 'Rp ' + rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  async function fetchAllIdrRates() {
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data && data.rates && data.rates.IDR) {
        const idrPerUsd = data.rates.IDR;
        const rates = {
          USD: Math.round(idrPerUsd),
          EUR: Math.round(idrPerUsd / (data.rates.EUR || 0.92)),
          GBP: Math.round(idrPerUsd / (data.rates.GBP || 0.79)),
          AUD: Math.round(idrPerUsd / (data.rates.AUD || 1.52)),
          CAD: Math.round(idrPerUsd / (data.rates.CAD || 1.36)),
          SGD: Math.round(idrPerUsd / (data.rates.SGD || 1.34)),
          INR: round2(idrPerUsd / (data.rates.INR || 84))
        };
        return rates;
      }
    } catch (e) {
      console.error('Error fetching all IDR rates:', e);
    }
    return null;
  }

  function parseRateText(text) {
    if (!text) return null;
    const clean = text.replace(/[\n\r\t]+/g, ' ').trim();

    // 1. Detect Currency
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

    // 2. Detect Hourly vs Fixed
    const isHourly = /\b(?:hr|hour|hourly|\/\s*hr)\b/i.test(clean);

    // 3. Match Range (e.g. "$250 - $750", "$20.00 - $40.00", "20.00-40.00", "₹1,500 - 12,500")
    const rangeMatch = clean.match(/(?:[\$€£₹¥A-Za-z]{1,4}\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:[\$€£₹¥A-Za-z]{1,4})?\s*(?:[-–—]|\bto\b)\s*(?:[\$€£₹¥A-Za-z]{1,4}\s*)?([\d,]+(?:\.\d{1,2})?)/i);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
      const max = parseFloat(rangeMatch[2].replace(/,/g, ''));
      if (!isNaN(min) && !isNaN(max) && min > 0) {
        return { currency, min, max, isHourly, isRange: true };
      }
    }

    // 4. Match Single Amount (e.g. "$500", "Est. Budget: $1,200", "Hourly: $25.00")
    // Target matches with money symbol or explicit budget/hourly keyword
    const moneyMatch = clean.match(/(?:[\$€£₹¥]\s*|\b(?:budget|rate|hourly|fixed)[:\s]*[\$€£₹¥]?\s*)([\d,]+(?:\.\d{1,2})?)/i)
      || clean.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:USD|EUR|GBP|INR|AUD|CAD|SGD|MYR|PHP|JPY|IDR)/i);

    if (moneyMatch) {
      const val = parseFloat(moneyMatch[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        return { currency, min: val, max: null, isHourly, isRange: false };
      }
    }

    // Fallback: any standalone number with currency in text
    const numMatch = clean.match(/([\d,]+(?:\.\d{1,2})?)/);
    if (numMatch) {
      const val = parseFloat(numMatch[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0 && (val >= 5 || isHourly)) {
        return { currency, min: val, max: null, isHourly, isRange: false };
      }
    }

    return null;
  }

  function convertRateToIdr(rateInfo, rates) {
    if (!rateInfo) return null;
    const { currency, min, max, isHourly, isRange } = rateInfo;

    if (currency === 'IDR') {
      const text = isRange && max
        ? `${formatRupiah(min)} - ${formatRupiah(max)}${isHourly ? ' / jam' : ''}`
        : `${formatRupiah(min)}${isHourly ? ' / jam' : ''}`;
      return {
        text,
        tooltip: 'Mata uang sudah dalam Rupiah (IDR)'
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

  global.FreeUpCalc = {
    DEFAULT_CONFIG,
    DEFAULT_GLOBAL_CONFIG,
    loadConfig,
    saveConfig,
    loadGlobalConfig,
    saveGlobalConfig,
    calculate,
    formatCurrency,
    formatRupiah,
    round2,
    fetchExchangeRate,
    fetchUsdRates,
    fetchAllIdrRates,
    convertToUsd,
    parseRateText,
    convertRateToIdr
  };
})(typeof window !== 'undefined' ? window : this);
