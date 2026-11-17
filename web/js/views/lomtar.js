// Lomtár (#/p/<projekt>/lomtar, iroda): a projekt törölt pozíciói – a rendszer máshol sehol nem ajánlja fel őket (lerakás,
// listák, beillesztés). Visszaállítás: az elemeivel, a közös elem kapcsolataival; a rajzon a helyére, ha a rajz megvan.
// Ha a jelet közben más pozíció kapta meg, új jelet kér. Végleges törlés nincs (a napló és az elszámolás miatt).
import { html, modal, toast, formValues, fmtDate, matcher } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { pageHead } from './common.js';

const st = { q: '' };

const elemSzoveg = p => p.elemek.map(e => [e.tipus, (D.getKategoria(e.kategoriaId) || {}).nev?.toLowerCase()].filter(Boolean).join(' ')
  + (e.db > 1 ? ` (${e.db} db)` : '')).join(', ');
const helySzoveg = p => {
  const r = p.rajzId && D.getRajz(p.rajzId);
  return [D.helySzoveg(p.epulet, p.szint), p.helyiseg, r ? `rajz: ${r.nev}` : ''].filter(Boolean).join(' · ');
};

function render(view, params, ctx) {
  const all = D.lomtar(), ok = matcher(st.q);
  const list = all.filter(p => ok([p.jel, elemSzoveg(p), helySzoveg(p)].join(' ')));
  view.innerHTML = String(html`
    ${pageHead('Lomtár')}
    <p class="small muted page-note" style="margin-top:0">A törölt pozíciók. Máshol sehol nem jelennek meg (a lerakáskor és a listákban sem);
      innen visszaállíthatók az elemeikkel együtt, a rajzon a helyükre. A naplójuk megmaradt.</p>
    ${all.length ? html`<div class="toolbar"><div class="search-wrap"><span class="search-ico">${ICONS.search}</span>
      <input type="search" id="lt-q" value="${st.q}" placeholder="Keresés: jel, elem, hely…" aria-label="Keresés a Lomtárban" autocomplete="off"></div></div>` : ''}
    <section class="card">
      ${!all.length ? html`<p class="empty">A Lomtár üres.</p>`
        : !list.length ? html`<p class="empty">Nincs találat.</p>`
        : html`<ul class="list">${list.map(p => html`<li class="list-item">
          <div class="list-main"><b>${p.jel || '–'}</b>
            <span class="sub">${[elemSzoveg(p) || 'nincs eleme', helySzoveg(p)].filter(Boolean).join(' · ')}</span>
            <span class="sub">Törölve: ${fmtDate(p.torolve, true)}</span></div>
          <button type="button" class="btn btn-sm" data-vissza="${p.id}">Visszaállítás</button></li>`)}</ul>`}
    </section>`);
  const q = view.querySelector('#lt-q');
  q?.addEventListener('input', () => { st.q = q.value; render(view, params, ctx); const n = view.querySelector('#lt-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
  view.querySelectorAll('[data-vissza]').forEach(b => b.addEventListener('click', async () => {
    if (await visszaallitas(all.find(p => p.id === b.dataset.vissza))) ctx.rerender();
  }));
}

/** Visszaállítás; foglalt jelnél új jelet kér. Visszaad: true, ha visszaállt. */
async function visszaallitas(p) {
  const foglalt = !!D.pozJel(p.jel);
  if (!foglalt) {
    const r = await D.visszaallit(p.id);
    if (r.hiba) { toast(r.hiba, 'error', 6000); return false; }
    toast(`„${p.jel}” visszaállítva${r.poz && r.poz.rajzId ? ' (a rajzon a helyén)' : ''}`, 'ok');
    return true;
  }
  return !!await modal({
    title: 'Visszaállítás új jellel',
    body: html`<p class="small" style="margin-top:0">A(z) „${p.jel}” jelet közben egy másik pozíció kapta meg. Add meg, milyen jellel kerüljön vissza.</p>
      <label class="field"><span>Új jel</span><input name="jel" value="${p.jel}-2" maxlength="60" autocomplete="off"></label>`,
    actions: [{ label: 'Mégse', value: null }, { label: 'Visszaállítás', kind: 'primary', onClick: async el => {
      const jel = String(formValues(el).jel || '').trim();
      if (!jel) { toast('Add meg a jelet', 'warn'); return false; }
      const r = await D.visszaallit(p.id, jel);
      if (r.hiba) { toast(r.hiba, 'error', 6000); return false; }
      toast(`Visszaállítva „${jel}” jellel`, 'ok');
      return true;
    } }],
  }).done;
}

export default { render };
