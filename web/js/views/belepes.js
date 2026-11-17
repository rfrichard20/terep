// Belépés Google-fiókkal (a Raktár login.js mintájára). Csak szerveres módban; helyi módban nincs belépés.
// A szerver a Google-nál ellenőrzi a tokent, és csak a Felhasznalok lapon szereplő, aktív felhasználót engedi be.
import * as S from '../store.js';
import { backend } from '../backend.js';
import { html, toast } from '../ui.js';
import { CONFIG } from '../config.js';

let gisLoaded = false;

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('A Google-belépés nem tölthető be (nincs internet?).'));
    document.head.appendChild(s);
  });
}

export async function renderBelepes(root) {
  const err = S.state.authError;
  root.innerHTML = String(html`
    <div class="card login">
      <img src="icon.svg" alt="">
      <h1 style="margin-top:.75rem">Terep</h1>
      <p class="muted">Jelentkezz be a Google-fiókoddal.</p>
      ${err ? html`<div class="notice notice-err small">${err}</div>` : ''}
      ${S.state.outbox.length ? html`<div class="notice notice-warn small">${S.state.outbox.length} rögzítés vár feltöltésre ezen a készüléken – a rögzítő belépése után feltöltődik.</div>` : ''}
      <div id="gbtn" style="display:flex;justify-content:center;margin-top:1rem"></div>
      <p id="gmsg" class="small muted" style="margin-top:1rem"></p>
    </div>`);
  if (!CONFIG.GOOGLE_CLIENT_ID) { root.querySelector('#gmsg').textContent = 'Nincs beállítva a Google kliens azonosító (config.js → GOOGLE_CLIENT_ID).'; return; }
  try {
    await loadGis();
    if (!gisLoaded) {
      window.google.accounts.id.initialize({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        auto_select: true,
        callback: async resp => {
          const msg = document.getElementById('gmsg');
          if (msg) msg.textContent = 'Ellenőrzés…';
          try {
            const r = await backend.login(resp.credential);
            await S.setSession(r.token, r.user);
          } catch (x) {
            if (msg) msg.textContent = '';
            toast(x.message, 'error', 8000);
          }
        },
      });
      gisLoaded = true;
    }
    const btn = document.getElementById('gbtn');
    if (btn) window.google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'hu' });
  } catch (x) {
    const msg = document.getElementById('gmsg');
    if (msg) msg.textContent = x.message;
  }
}
