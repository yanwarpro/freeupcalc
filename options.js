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
    // Elements for conditional visibility
    serviceFeeRateField: document.getElementById('serviceFeeRate').closest('.field'),
    connectPriceField: document.getElementById('connectPrice').closest('.field')
  };

  let globalConfig = null;

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
      showSaveStatus('Scam Detector ' + (els.scamDetectorEnabled.checked ? 'diaktifkan ✓' : 'dinonaktifkan'));
    });
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
    populateForm();
    renderMethods();
    updateRateHint();
    showSaveStatus();
  }

  init();
})();
