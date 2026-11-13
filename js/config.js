// Alkalmazás beállítások (a Raktár config.js mintájára).
// Ha az API_URL üres, az app HELYI módban fut: minden adat csak ezen a készüléken tárolódik, belépés nélkül
// (ugyanaz a logika fut, mint a szerveren – a TerepLogic –, csak a böngészőben).
//
// Helyi fejlesztés: localhost-on automatikusan helyi mód (az éles adatokhoz nem nyúl).
// Ha helyben is a szervert akarod: http://localhost:8081/?live
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname) && !new URLSearchParams(location.search).has('live');

export const CONFIG = {
  // Az Apps Script webalkalmazás URL-je (…/exec végződésű) – üzembe helyezéskor kell kitölteni (UZEMBE_HELYEZES.md)
  API_URL: LOCAL ? '' : 'https://script.google.com/macros/s/AKfycbyE0_ISMYmO5R9ZbTqTq9eVW10cZO06p90qGE4-_544No9HK0ImLhIAOQFiS_-piKw/exec',
  // Google OAuth kliens azonosító (ugyanaz, mint a Code.gs-ben; a Raktáréval közös)
  GOOGLE_CLIENT_ID: '352517479354-3r8c2oll23ko4afrj18onbjhc9tvevkv.apps.googleusercontent.com',
  // Automatikus szinkron gyakorisága (ms), ha az app nyitva van
  SYNC_INTERVAL: 3 * 60 * 1000,
};
