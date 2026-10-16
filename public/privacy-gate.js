const PRIVACY_VERSION = '2026-10-16';
const PRIVACY_KEY = 'travel-privacy-consent';

async function loadScript(src) {
  await new Promise(resolve => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = resolve;
    document.head.append(script);
  });
}

let started = false;
async function startTravelMap() {
  if (started) return;
  started = true;
  document.getElementById('privacyGate').hidden = true;
  document.getElementById('entryScreen').hidden = false;
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap';
  document.head.append(fonts);
  const leafletCss = document.createElement('link');
  leafletCss.rel = 'stylesheet';
  leafletCss.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.append(leafletCss);
  await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
  await loadScript('/qrcode.min.js');
  await loadScript('/app.js');
}

const nativeConsent = new URLSearchParams(location.search).get('nativeConsent') === '1';
if (nativeConsent) localStorage.setItem(PRIVACY_KEY, PRIVACY_VERSION);
if (localStorage.getItem(PRIVACY_KEY) === PRIVACY_VERSION) {
  startTravelMap();
} else {
  document.getElementById('acceptPrivacyButton').addEventListener('click', () => {
    localStorage.setItem(PRIVACY_KEY, PRIVACY_VERSION);
    startTravelMap();
  });
}
