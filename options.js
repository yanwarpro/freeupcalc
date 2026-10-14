(function () {
  'use strict';

  const Calc = window.FreeUpCalc;
  let config = null;
  let saveTimer = null;

  const els = {
    platformSelect: document.getElementById('platformSelect'),
    serviceFeeRate: document.getElementById('serviceFeeRate'),
    connectPrice: document.getElementById('connectPrice'),
    vatRate: document.getElementById('vatRate'),
    selectedMethod: document.getElementById('selectedMethod'),
    fxMargin: document.getElementById('fxMargin'),
    targetCurrency: document.getElementById('targetCurrency'),
    exchangeRate: document.getElementById('exchangeRate'),
    updateRateBtn: document.getElementById('updateRateBtn'),
    rateHint: document.getElementById('rateHint'),
    methodsList: document.getElementById('methodsList'),
    resetBtn: document.getElementById('resetBtn'),
    saveStatus: document.getElementById('saveStatus'),
    scamDetectorEnabled: document.getElementById('scamDetectorEnabled'),
    // Kurs Conversion elements
    kursConversionEnabled: document.getElementById('kursConversionEnabled'),
    kursTargetCurrency: document.getElementById('kursTargetCurrency'),
    kursRateUSD: document.getElementById('kursRateUSD'),
    kursRateEUR: document.getElementById('kursRateEUR'),
    kursRateGBP: document.getElementById('kursRateGBP'),
    kursRateAUD: document.getElementById('kursRateAUD'),
    kursRateCAD: document.getElementById('kursRateCAD'),
    kursRateSGD: document.getElementById('kursRateSGD'),
    kursRateINR: document.getElementById('kursRateINR'),
    updateAllKursBtn: document.getElementById('updateAllKursBtn'),
    // Elements for conditional visibility
    serviceFeeRateField: document.getElementById('serviceFeeRate').closest('.field'),
    connectPriceField: document.getElementById('connectPrice').closest('.field')
  };

  let globalConfig = null;
  let globalSaveTimer = null;

  const CURRENCY_EXAMPLES = {
    IDR: '16000',
    USD: '1',
    EUR: '0.92',
    GBP: '0.79',
    PHP: '58',
    INR: '83',
    MYR: '4.7',
    SGD: '1.35',
    AUD: '1.52',
    CAD: '1.36',
    JPY: '157',
    CNY: 'zh-CN'
  };

  async function init() {
    await loadPlatformConfig();
    globalConfig = await Calc.loadGlobalConfig();
    populateForm();
    populateKursConversion();
    renderMethods();
    bindEvents();
    updateRateHint();
    togglePlatformInputs();
    // Set state toggle scam detector
    els.scamDetectorEnabled.checked = !!(globalConfig.scamDetector && globalConfig.scamDetector.enabled);
  }

  async function loadPlatformConfig() {
    const platform = els.platformSelect.value;
    config = await Calc.loadConfig(platform); // Pass platform to loadConfig
  }

  function togglePlatformInputs() {
    const platform = els.platformSelect.value;
    const isUpwork = platform === 'upwork';

    els.serviceFeeRateField.classList.toggle('hidden', !isUpwork);
    els.connectPriceField.classList.toggle('hidden', !isUpwork);
  }

  function updateRateHint() {
    const cur = (els.targetCurrency.value || '').toUpperCase().trim();
    const example = CURRENCY_EXAMPLES[cur];
    if (!cur || cur === 'USD') {
      els.rateHint.innerHTML = 'Kurs mata uang tujuan. Isi <b>1</b> jika USD.';
      return;
    }
    const rate = parseFloat(els.exchangeRate.value) || 0;
    let warn = '';
    if (cur === 'IDR' && rate > 0 && rate < 1000) {
      warn = ' <span style="color:#ef4444;font-weight:600;">⚠️ IDR harusnya ~16000, cek lagi ya.</span>';
    }
    els.rateHint.innerHTML = 'Kurs penuh. Contoh: 1 USD = ' + (example ? Calc.formatCurrency(example, cur).replace(/\.00$/, '') : '?') +
      ' → isi <b>' + (example || 'sesuai kurs') + '</b>.' + warn;
  }

  function populateForm() {
    els.serviceFeeRate.value = config.serviceFeeRate || '';
    els.connectPrice.value = config.connectPrice || '';
    els.vatRate.value = config.vatRate || '';
    els.fxMargin.value = config.fxMargin || '';
    els.targetCurrency.value = config.targetCurrency || '';
    els.exchangeRate.value = config.exchangeRate || '';

    els.selectedMethod.innerHTML = '';
    for (const [key, method] of Object.entries(config.methods || {})) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = method.name;
      if (key === config.selectedMethod) opt.selected = true;
      els.selectedMethod.appendChild(opt);
    }
  }

  function renderMethods() {
    els.methodsList.innerHTML = '';
    for (const [key, method] of Object.entries(config.methods || {})) {
      const row = document.createElement('div');
      row.className = 'method-row';
      row.innerHTML = `
        <div>
          <div class="m-name">${method.name}</div>
          <div class="m-label">Nama Metode</div>
        </div>
        <div>
          <input type="number" class="m-flat" data-key="${key}" value="${method.flatFee}" min="0" step="0.01" />
          <div class="m-label">Flat Fee (USD)</div>
        </div>
        <div>
          <input type="number" class="m-rate" data-key="${key}" value="${method.providerRate}" min="0" step="0.1" />
          <div class="m-label">Provider Fee (%)</div>
        </div>
        <div>
          <input type="number" class="m-fx" data-key="${key}" value="${method.fxMargin ?? 0}" min="0" step="0.1" />
          <div class="m-label">FX Margin (%)</div>
        </div>
      `;
      els.methodsList.appendChild(row);
    }

    els.methodsList.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', onMethodInput);
    });
  }

  function bindEvents() {
    els.platformSelect.addEventListener('change', async () => {
      await loadPlatformConfig();
      populateForm();
      renderMethods();
      updateRateHint();
      togglePlatformInputs();
    });

    const fields = ['serviceFeeRate', 'connectPrice', 'vatRate', 'selectedMethod', 'fxMargin', 'targetCurrency', 'exchangeRate'];
    fields.forEach((id) => {
      els[id].addEventListener('input', scheduleSave);
      els[id].addEventListener('change', scheduleSave);
    });
    els.targetCurrency.addEventListener('input', updateRateHint);
    els.exchangeRate.addEventListener('input', updateRateHint);
    els.resetBtn.addEventListener('click', resetToDefault);
    els.updateRateBtn.addEventListener('click', updateExchangeRate);

    // Scam Detector toggle
    els.scamDetectorEnabled.addEventListener('change', async () => {
      if (!globalConfig.scamDetector) globalConfig.scamDetector = {};
      globalConfig.scamDetector.enabled = els.scamDetectorEnabled.checked;
      await Calc.saveGlobalConfig(globalConfig);
      notifyTabs({ action: 'scamDetectorToggle', enabled: els.scamDetectorEnabled.checked });
      showSaveStatus('Scam Detector ' + (els.scamDetectorEnabled.checked ? 'diaktifkan ✓' : 'dinonaktifkan'));
    });

    // ── Kurs Conversion Events ───────────────────────────────────────────────
    els.kursConversionEnabled.addEventListener('change', async () => {
      if (!globalConfig.kursConversion) globalConfig.kursConversion = {};
      globalConfig.kursConversion.enabled = els.kursConversionEnabled.checked;
      await Calc.saveGlobalConfig(globalConfig);
      notifyTabs({ action: 'kursConversionToggle', enabled: els.kursConversionEnabled.checked });
      showSaveStatus('Kurs Conversion ' + (els.kursConversionEnabled.checked ? 'diaktifkan ✓' : 'dinonaktifkan'));
    });

    const kursFields = [
      { el: els.kursRateUSD, key: 'USD' },
      { el: els.kursRateEUR, key: 'EUR' },
      { el: els.kursRateGBP, key: 'GBP' },
      { el: els.kursRateAUD, key: 'AUD' },
      { el: els.kursRateCAD, key: 'CAD' },
      { el: els.kursRateSGD, key: 'SGD' },
      { el: els.kursRateINR, key: 'INR' },
    ];

    kursFields.forEach(({ el, key }) => {
      const onKursInput = () => {
        if (!globalConfig.kursConversion) globalConfig.kursConversion = {};
        if (!globalConfig.kursConversion.rates) globalConfig.kursConversion.rates = {};
        const val = parseFloat(el.value) || 0;
        globalConfig.kursConversion.rates[key] = val;

        // Sync USD dengan exchangeRate kalkulator
        if (key === 'USD' && val > 0) {
          els.exchangeRate.value = val;
          config.exchangeRate = val;
          scheduleSave();
        }
        scheduleSaveGlobal();
      };
      el.addEventListener('input', onKursInput);
      el.addEventListener('change', onKursInput);
    });

    // Sinkronkan exchangeRate kalkulator ke input kursRateUSD jika diubah manual
    els.exchangeRate.addEventListener('input', () => {
      const v = parseFloat(els.exchangeRate.value) || 0;
      if (v > 0) {
        els.kursRateUSD.value = v;
        if (!globalConfig.kursConversion) globalConfig.kursConversion = {};
        if (!globalConfig.kursConversion.rates) globalConfig.kursConversion.rates = {};
        globalConfig.kursConversion.rates.USD = v;
        scheduleSaveGlobal();
      }
    });

    els.updateAllKursBtn.addEventListener('click', updateAllKursRates);
  }

  function populateKursConversion() {
    if (!globalConfig.kursConversion) {
      globalConfig.kursConversion = {
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
    }
    const kc = globalConfig.kursConversion;
    els.kursConversionEnabled.checked = kc.enabled !== false;
    els.kursTargetCurrency.value = kc.targetCurrency || 'IDR';

    const rates = kc.rates || {};
    // Sync USD dari platform config jika ada
    if (config && config.exchangeRate && !rates.USD) {
      rates.USD = config.exchangeRate;
    }
    els.kursRateUSD.value = rates.USD || 16000;
    els.kursRateEUR.value = rates.EUR || 17500;
    els.kursRateGBP.value = rates.GBP || 21000;
    els.kursRateAUD.value = rates.AUD || 10500;
    els.kursRateCAD.value = rates.CAD || 11800;
    els.kursRateSGD.value = rates.SGD || 12200;
    els.kursRateINR.value = rates.INR || 190;
  }

  async function updateAllKursRates() {
    els.updateAllKursBtn.disabled = true;
    els.updateAllKursBtn.textContent = 'Mengambil Kurs Pasar...';
    try {
      const rates = await Calc.fetchAllIdrRates();
      if (rates) {
        if (!globalConfig.kursConversion) globalConfig.kursConversion = {};
        globalConfig.kursConversion.rates = rates;

        els.kursRateUSD.value = rates.USD || '';
        els.kursRateEUR.value = rates.EUR || '';
        els.kursRateGBP.value = rates.GBP || '';
        els.kursRateAUD.value = rates.AUD || '';
        els.kursRateCAD.value = rates.CAD || '';
        els.kursRateSGD.value = rates.SGD || '';
        els.kursRateINR.value = rates.INR || '';

        // Sync USD dengan exchangeRate kalkulator
        if (rates.USD) {
          els.exchangeRate.value = rates.USD;
          config.exchangeRate = rates.USD;
          scheduleSave();
        }

        await Calc.saveGlobalConfig(globalConfig);
        notifyTabs({ action: 'kursRatesUpdated', config: globalConfig.kursConversion });
        showSaveStatus('Semua kurs IDR berhasil diperbarui!');
      } else {
        showSaveStatus('Gagal mengambil kurs pasar.', true);
      }
    } catch (e) {
      console.error('Error fetching all IDR rates:', e);
      showSaveStatus('Error: Gagal update kurs.', true);
    } finally {
      els.updateAllKursBtn.disabled = false;
      els.updateAllKursBtn.textContent = '🔄 Update Semua Kurs Pasar';
    }
  }

  function scheduleSaveGlobal() {
    clearTimeout(globalSaveTimer);
    showSaveStatus('Menyimpan kurs...');
    globalSaveTimer = setTimeout(async () => {
      await Calc.saveGlobalConfig(globalConfig);
      notifyTabs({ action: 'kursRatesUpdated', config: globalConfig.kursConversion });
      showSaveStatus('Kurs tersimpan ✓');
    }, 400);
  }

  function notifyTabs(msg) {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          try {
            chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
          } catch (e) {}
        });
      });
    }
  }

  async function updateExchangeRate() {
    els.updateRateBtn.disabled = true;
    els.updateRateBtn.textContent = 'Mengambil...';
    try {
      const rate = await Calc.fetchExchangeRate();
      if (rate) {
        els.exchangeRate.value = rate;
        scheduleSave();
        showSaveStatus('Kurs berhasil diperbarui!');
      } else {
        showSaveStatus('Gagal memperbarui kurs.', true);
      }
    } catch (error) {
      console.error('Error updating exchange rate:', error);
      showSaveStatus('Error: Gagal memperbarui kurs.', true);
    } finally {
      els.updateRateBtn.disabled = false;
      els.updateRateBtn.textContent = 'Update Otomatis';
    }
  }

  function onMethodInput(e) {
    const key = e.target.dataset.key;
    const val = parseFloat(e.target.value) || 0;
    if (e.target.classList.contains('m-flat')) {
      config.methods[key].flatFee = val;
    } else if (e.target.classList.contains('m-fx')) {
      config.methods[key].fxMargin = val;
    } else {
      config.methods[key].providerRate = val;
    }
    scheduleSave();
  }

  function collectForm() {
    config.serviceFeeRate = parseFloat(els.serviceFeeRate.value) || 0;
    config.connectPrice = parseFloat(els.connectPrice.value) || 0;
    config.vatRate = parseFloat(els.vatRate.value) || 0;
    config.fxMargin = parseFloat(els.fxMargin.value) || 0;
    config.targetCurrency = (els.targetCurrency.value || '').toUpperCase().trim();
    config.exchangeRate = parseFloat(els.exchangeRate.value) || 1;
    config.selectedMethod = els.selectedMethod.value;
  }

  function scheduleSave() {
    collectForm();
    showSaveStatus();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const platform = els.platformSelect.value;
      Calc.saveConfig(config, platform).then(() => { // Pass platform to saveConfig
        console.log('Config saved', config);
      });
    }, 400);
  }

  function showSaveStatus(message = 'Menyimpan...', isError = false) {
    els.saveStatus.textContent = message;
    els.saveStatus.classList.add('show');
    els.saveStatus.classList.toggle('error', isError);
    clearTimeout(showSaveStatus._t);
    showSaveStatus._t = setTimeout(() => {
      els.saveStatus.textContent = 'Tersimpan ✓';
      els.saveStatus.classList.remove('error');
      setTimeout(() => els.saveStatus.classList.remove('show'), 1500);
    }, 500);
  }

  async function resetToDefault() {
    if (!confirm('Reset semua pengaturan ke nilai default untuk platform ini?')) return;
    const platform = els.platformSelect.value;
    config = JSON.parse(JSON.stringify(Calc.DEFAULT_CONFIG[platform])); // Use platform-specific default
    await Calc.saveConfig(config, platform); // Pass platform to saveConfig
    globalConfig = JSON.parse(JSON.stringify(Calc.DEFAULT_GLOBAL_CONFIG));
    await Calc.saveGlobalConfig(globalConfig);
    populateForm();
    populateKursConversion();
    renderMethods();
    updateRateHint();
    showSaveStatus('Pengaturan direset ke default');
  }

  init();
})();
