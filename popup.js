(function () {
  'use strict';

  const Calc = window.FreeUpCalc;
  let config = null;

  const els = {
    platformSelect: document.getElementById('platformSelect'),
    projectTypeFixed: document.getElementById('projectTypeFixed'),
    projectTypeHourly: document.getElementById('projectTypeHourly'),
    bidAmountGroup: document.getElementById('bidAmountGroup'),
    hourlyRateGroup: document.getElementById('hourlyRateGroup'),
    hoursGroup: document.getElementById('hoursGroup'),
    bidAmount: document.getElementById('bidAmount'),
    hourlyRate: document.getElementById('hourlyRate'),
    hours: document.getElementById('hours'),
    connectsUsed: document.getElementById('connectsUsed'),
    withdrawalMethod: document.getElementById('withdrawalMethod'),
    serviceFee: document.getElementById('serviceFee'),
    serviceFeeRate: document.getElementById('serviceFeeRate'),
    vatFee: document.getElementById('vatFee'),
    vatRate: document.getElementById('vatRate'),
    vatRow: document.getElementById('vatRow'),
    connectCost: document.getElementById('connectCost'),
    connectsUsedRow: document.getElementById('connectsUsed').closest('.form-group'),
    connectCostRow: document.getElementById('connectCost').closest('.fee-row'),
    withdrawalFee: document.getElementById('withdrawalFee'),
    providerFee: document.getElementById('providerFee'),
    fxCost: document.getElementById('fxCost'),
    fxMargin: document.getElementById('fxMargin'),
    fxRow: document.getElementById('fxRow'),
    totalFees: document.getElementById('totalFees'),
    netAmount: document.getElementById('netAmount'),
    takeHomePct: document.getElementById('takeHomePct'),
    netTarget: document.getElementById('netTarget'),
    detectBtn: document.getElementById('detectBtn'),
    optionsBtn: document.getElementById('optionsBtn'),
    userGuideBtn: document.getElementById('userGuideBtn'),
    totalFeesIdrRow: document.getElementById('totalFeesIdrRow'),
    totalFeesIdr: document.getElementById('totalFeesIdr'),
    totalFeesIdrCurrency: document.getElementById('totalFeesIdrCurrency'),
    resultLabel: document.getElementById('resultLabel'),
    resultDivider: document.getElementById('resultDivider'),
    resultMonthly: document.getElementById('resultMonthly'),
    monthlyAmount: document.getElementById('monthlyAmount'),
    monthlyTarget: document.getElementById('monthlyTarget')
  };

  async function init() {
    // 1. Auto-detect platform dari URL tab aktif sebelum load config
    const detectedPlatform = await detectPlatformFromTab();
    if (detectedPlatform) {
      els.platformSelect.value = detectedPlatform;
    }

    config = await Calc.loadConfig(els.platformSelect.value);
    populateMethods();
    applyConfigLabels();
    bindEvents();

    // 2. Auto-detect tipe proyek (fixed/hourly) dari DOM halaman — set radio button saja
    await autoDetectProjectType();

    toggleProjectInputs();
    recalculate();
  }

  // Deteksi platform dari URL tab aktif (tanpa membaca DOM halaman)
  async function detectPlatformFromTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = (tab && tab.url) || '';
      if (url.includes('upwork.com')) return 'upwork';
      if (url.includes('freelancer.com')) return 'freelancer';
    } catch (e) { /* ignore */ }
    return null;
  }

  // Deteksi tipe proyek (fixed/hourly) dari DOM via content.js — ringan, hanya set radio
  async function autoDetectProjectType() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = (tab && tab.url) || '';
      if (!url.includes('upwork.com') && !url.includes('freelancer.com')) return;

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectProjectType' });
      if (response && response.success && response.data) {
        const { projectType } = response.data;
        if (projectType === 'hourly') {
          els.projectTypeHourly.checked = true;
        } else {
          els.projectTypeFixed.checked = true;
        }
      }
    } catch (e) {
      // Silent fail — bukan fitur kritis, user tetap bisa pilih manual
    }
  }

  function toggleProjectInputs() {
    const isFixedPrice = els.projectTypeFixed.checked;
    els.bidAmountGroup.classList.toggle('hidden', !isFixedPrice);
    els.hourlyRateGroup.classList.toggle('hidden', isFixedPrice);
    els.hoursGroup.classList.toggle('hidden', isFixedPrice);
  }

  function populateMethods() {
    els.withdrawalMethod.innerHTML = '';
    for (const [key, method] of Object.entries(config.methods || {})) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = method.name;
      if (key === config.selectedMethod) opt.selected = true;
      els.withdrawalMethod.appendChild(opt);
    }
  }

  function applyConfigLabels() {
    els.serviceFeeRate.textContent = config.serviceFeeRate || 0;
    els.vatRate.textContent = config.vatRate || 0;
    const methodKey = els.withdrawalMethod.value || config.selectedMethod;
    const method = (config.methods && config.methods[methodKey]) || {};
    const fxMarginVal = method.fxMargin ?? config.fxMargin ?? 0;
    els.fxMargin.textContent = fxMarginVal;
    els.vatRow.classList.toggle('hidden', !config.vatRate || config.vatRate === 0);
    els.fxRow.classList.toggle('hidden', !fxMarginVal || fxMarginVal === 0);
  }

  function bindEvents() {
    els.platformSelect.addEventListener('change', recalculate);
    els.projectTypeFixed.addEventListener('change', () => { toggleProjectInputs(); recalculate(); });
    els.projectTypeHourly.addEventListener('change', () => { toggleProjectInputs(); recalculate(); });
    els.bidAmount.addEventListener('input', recalculate);
    els.hourlyRate.addEventListener('input', recalculate);
    els.hours.addEventListener('input', recalculate);
    els.connectsUsed.addEventListener('input', recalculate);
    els.withdrawalMethod.addEventListener('change', onMethodChange);
    els.detectBtn.addEventListener('click', detectFromPage);
    els.optionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    els.userGuideBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('User_Guide_FreeUp_Calc.pdf') });
    });
  }

  async function onMethodChange() {
    config.selectedMethod = els.withdrawalMethod.value;
    await Calc.saveConfig(config);
    applyConfigLabels();
    recalculate();
  }

  function recalculate() {
    const platform = els.platformSelect.value;
    const projectType = els.projectTypeFixed.checked ? 'fixed' : 'hourly';
    const isHourly = projectType === 'hourly';

    let bidAmountValue = parseFloat(els.bidAmount.value) || 0;
    if (isHourly) {
      const hourlyRateValue = parseFloat(els.hourlyRate.value) || 0;
      const hoursValue = parseFloat(els.hours.value) || 0;
      // Untuk hourly, `hours` dianggap sebagai jam/minggu → bidAmount = pendapatan mingguan
      bidAmountValue = hourlyRateValue * hoursValue;
    }

    const inputs = {
      bidAmount: bidAmountValue,
      connectsUsed: els.connectsUsed.value,
      method: els.withdrawalMethod.value,
      platform: platform,
      projectType: projectType
    };
    const r = Calc.calculate(inputs, config);

    const isUpwork = platform === 'upwork';
    els.connectsUsedRow.classList.toggle('hidden', !isUpwork);
    els.connectCostRow.classList.toggle('hidden', !isUpwork);

    els.serviceFee.textContent = '-' + Calc.formatCurrency(Math.abs(r.serviceFee));
    els.vatFee.textContent = '-' + Calc.formatCurrency(Math.abs(r.vatOnFee));
    els.connectCost.textContent = '-' + Calc.formatCurrency(Math.abs(r.connectCost));
    els.withdrawalFee.textContent = '-' + Calc.formatCurrency(Math.abs(r.withdrawalFlat));
    els.providerFee.textContent = '-' + Calc.formatCurrency(Math.abs(r.providerFee));
    els.fxCost.textContent = '-' + Calc.formatCurrency(Math.abs(r.fxCost));
    els.totalFees.textContent = '-' + Calc.formatCurrency(Math.abs(r.totalFees));

    // Label & nilai utama: untuk hourly tampilkan per minggu
    els.resultLabel.textContent = isHourly ? 'Penghasilan Bersih / Minggu' : 'Penghasilan Bersih';
    els.netAmount.textContent = Calc.formatCurrency(r.netUsd);
    els.takeHomePct.textContent = r.takeHomePct + '%';

    // Tampilkan konversi Total Potongan ke mata uang target (misal IDR)
    const hasCurrency = config.targetCurrency && config.targetCurrency !== 'USD'
      && config.exchangeRate && config.exchangeRate > 1;
    if (hasCurrency) {
      const totalFeesLocal = Calc.round2(r.totalFees * config.exchangeRate);
      els.totalFeesIdrCurrency.textContent = config.targetCurrency.toUpperCase();
      els.totalFeesIdr.textContent = '≈ ' + Calc.formatCurrency(totalFeesLocal, config.targetCurrency);
      els.totalFeesIdrRow.classList.remove('hidden');
    } else {
      els.totalFeesIdrRow.classList.add('hidden');
    }

    if (hasCurrency) {
      const rateStr = Calc.formatCurrency(config.exchangeRate, config.targetCurrency).replace(/\.00$/, '');
      els.netTarget.innerHTML = Calc.formatCurrency(r.netTarget, config.targetCurrency) +
        ' <span class="rate-info">@' + rateStr + '/USD</span>';
    } else {
      els.netTarget.textContent = r.methodName;
    }

    // ── Estimasi bulanan (hanya untuk hourly) ──
    if (isHourly) {
      // 1 bulan ≈ 4.33 minggu (rata-rata 52 minggu / 12 bulan)
      const WEEKS_PER_MONTH = 4.33;
      const monthlyUsd = Calc.round2(r.netUsd * WEEKS_PER_MONTH);
      els.monthlyAmount.textContent = Calc.formatCurrency(monthlyUsd);

      if (hasCurrency) {
        const monthlyTarget = Calc.round2(monthlyUsd * config.exchangeRate);
        els.monthlyTarget.textContent = '≈ ' + Calc.formatCurrency(monthlyTarget, config.targetCurrency);
      } else {
        els.monthlyTarget.textContent = r.methodName;
      }

      els.resultDivider.classList.remove('hidden');
      els.resultMonthly.classList.remove('hidden');
    } else {
      els.resultDivider.classList.add('hidden');
      els.resultMonthly.classList.add('hidden');
    }
  }

  // Terapkan data deteksi ke semua field UI
  async function applyDetectedData(d) {
    // Set platform
    if (d.platform === 'upwork' || d.platform === 'freelancer') {
      els.platformSelect.value = d.platform;
    }

    // Set tipe proyek & nilai field
    if (d.projectType === 'hourly') {
      els.projectTypeHourly.checked = true;
      toggleProjectInputs();
      if (d.hourlyRate != null) {
        // Konversi ke USD jika mata uang bukan USD
        const usdRate = await Calc.convertToUsd(d.hourlyRate, d.currency || 'USD');
        els.hourlyRate.value = usdRate;
      }
    } else {
      els.projectTypeFixed.checked = true;
      toggleProjectInputs();
      if (d.bidAmount != null) {
        // Konversi ke USD jika mata uang bukan USD
        const usdBid = await Calc.convertToUsd(d.bidAmount, d.currency || 'USD');
        els.bidAmount.value = usdBid;
      }
    }

    // Connects (Upwork only)
    if (d.connectsUsed != null) {
      els.connectsUsed.value = d.connectsUsed;
    }

    // Reload config sesuai platform & update UI
    config = await Calc.loadConfig(d.platform || els.platformSelect.value);
    populateMethods();
    applyConfigLabels();
    recalculate();

    // Tampilkan info konversi mata uang (jika bukan USD)
    if (d.currency && d.currency.toUpperCase() !== 'USD') {
      const original = d.projectType === 'hourly' ? d.hourlyRate : d.bidAmount;
      const converted = d.projectType === 'hourly' ? els.hourlyRate.value : els.bidAmount.value;
      console.log(`[FreeUp Calc] Konversi ${original} ${d.currency} → $${converted} USD`);
    }
  }

  async function detectFromPage() {
    els.detectBtn.style.opacity = '0.5';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = (tab && tab.url) || '';

      if (!url.includes('upwork.com') && !url.includes('freelancer.com')) {
        alert('Silakan buka halaman proyek/proposal di Upwork atau Freelancer.com terlebih dahulu.');
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractJobData' });

      if (response && response.success) {
        await applyDetectedData(response.data);

        // Informasi hasil deteksi
        const d = response.data;
        const items = [];
        if (d.platform) items.push(`Platform: ${d.platform}`);
        if (d.projectType === 'hourly' && d.hourlyRate) items.push(`Avg Rate: $${d.hourlyRate}/hr`);
        if (d.projectType !== 'hourly' && d.bidAmount) items.push(`Budget: $${d.bidAmount}`);
        if (d.connectsUsed) items.push(`Connects: ${d.connectsUsed}`);

        if (items.length === 0) {
          alert('Halaman terdeteksi namun tidak ada data numerik yang bisa dibaca. Isi manual ya.');
        }
      } else {
        alert('Tidak dapat membaca data dari halaman ini.\nCoba buka halaman detail proyek atau form Place a Bid.');
      }
    } catch (e) {
      console.error(e);
      alert('Gagal mendeteksi. Pastikan halaman sudah termuat penuh dan izin ekstensi telah diberikan.');
    } finally {
      els.detectBtn.style.opacity = '1';
    }
  }

  init();
})();
