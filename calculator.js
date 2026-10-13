(function (global) {
  'use strict';

  const DEFAULT_CONFIG = {
    upwork: {
      serviceFeeRate: 10,
      connectPrice: 0.15,
      vatRate: 0,
      fxMargin: 0,
      targetCurrency: 'USD',
      exchangeRate: 1,
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
      targetCurrency: 'USD',
      exchangeRate: 1,
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

  global.FreeUpCalc = {
    DEFAULT_CONFIG,
    DEFAULT_GLOBAL_CONFIG,
    loadConfig,
    saveConfig,
    loadGlobalConfig,
    saveGlobalConfig,
    calculate,
    formatCurrency,
    round2,
    fetchExchangeRate
  };
})(typeof window !== 'undefined' ? window : this);
