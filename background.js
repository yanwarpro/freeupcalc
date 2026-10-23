chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'ping') {
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'fetchFreelancerProjectHtml') {
    let url;
    try {
      url = new URL(msg.url);
    } catch (e) {
      sendResponse({ ok: false, error: 'invalid_url' });
      return false;
    }

    // Batasi pengambilan halaman ke halaman detail Freelancer yang sama
    // dengan yang dipakai detector. Fetch dari service worker memakai izin
    // host ekstensi, tidak bergantung pada kebijakan CORS halaman.
    if (!['www.freelancer.com', 'freelancer.com'].includes(url.hostname) || !/^\/projects?\//i.test(url.pathname)) {
      sendResponse({ ok: false, error: 'url_not_allowed' });
      return false;
    }

    fetch(url.href, { credentials: 'include', redirect: 'follow' })
      .then(async (response) => {
        const finalUrl = new URL(response.url);
        if (!response.ok) return { ok: false, status: response.status };
        if (!['www.freelancer.com', 'freelancer.com'].includes(finalUrl.hostname)) {
          return { ok: false, error: 'redirect_not_allowed' };
        }
        return { ok: true, html: await response.text() };
      })
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: 'fetch_failed' }));
    return true;
  }
});
