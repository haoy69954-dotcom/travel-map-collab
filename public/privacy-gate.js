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
  if (localStorage.getItem(PRIVACY_KEY) === PRIVACY_VERSION) loadTravelFonts();
  await loadScript('/qrcode.min.js');
  await loadScript('/app.js');
}

function loadTravelFonts() {
  if (document.getElementById('travelFonts')) return;
  const fonts = document.createElement('link');
  fonts.id = 'travelFonts';
  fonts.rel = 'stylesheet';
  fonts.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap';
  document.head.append(fonts);
}

const nativeApp = new URLSearchParams(location.search).get('nativeApp') === '1';
if (nativeApp) {
  document.documentElement.classList.add('native-app');
  document.body.classList.add('native-app');
}
if (nativeApp || localStorage.getItem(PRIVACY_KEY) === PRIVACY_VERSION) {
  startTravelMap();
} else {
  document.getElementById('acceptPrivacyButton').addEventListener('click', () => {
    localStorage.setItem(PRIVACY_KEY, PRIVACY_VERSION);
    startTravelMap();
  });
}
