// Termékfajták oldal (admin; helyi módban is): a cégszintű lista (árnyékoló, szúnyogháló, vezérlő…) – név, szín, alap műveletsor
// (sablon), elem-oszlopok, vezérlő-e. Új projektnél / új fajta felvételekor a műveletsor innen másolódik a projektbe, utána
// projektenként módosítható (a sablon módosítása a meglévő projekteket nem érinti). Törlés nincs: az „Aktív” kivétele.
import { html, raw, modal, toast, formValues, sec } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { pageHead } from './common.js';
import { lepesSzerkeszto } from './projekt.js';

/** Hány projekt használja (amelyben van ilyen elem vagy műveletsor). */
function hasznalat(k) {
  return D.projektek().filter(p => D.projektFajtak(p.id).some(x => x.id === k.id)).length;
}

function render(view, params, ctx) {
  const list = D.kategoriak();
  view.innerHTML = String(html`
    ${pageHead('Termékfajták', html`<button class="btn btn-primary" id="k-uj">${ICONS.plus}Új termékfajta</button>`)}
    <section class="card">
      <ul class="list">${list.map(k => html`<li class="list-item ${k.aktiv ? '' : 'off'}">
        <button type="button" class="list-main list-btn" data-id="${k.id}">
          <b><span class="dot" style="background:${k.szin}"></span>${k.nev}</b>
          ${k.vezerlo ? html` <span class="badge badge-info">vezérlő</span>` : ''}${k.aktiv ? '' : html` <span class="badge badge-muted">Inaktív</span>`}
          <span class="sub">${k.lepesek.map(l => l.nev).join(' → ') || 'nincs lépés'}${D.helyi || D.projektek().length ? ` · ${hasznalat(k)} projektben` : ''}</span>
        </button></li>`)}</ul>
    </section>
    <p class="small muted page-note">A műveletsor sablon: új projektnél és új termékfajta felvételekor innen másolódik a projektbe, ott külön módosítható
      (a sablon módosítása a meglévő projekteket nem érinti). A vezérlő fajta elemei (távirányító, fali kapcsoló…) csatornákat kaphatnak.
      Törlés helyett az „Aktív” kivétele: a meglévő elemek megmaradnak, újhoz nem választható.</p>`);
  view.querySelector('#k-uj').addEventListener('click', async () => { if (await editKategoria(null)) ctx.rerender(); });
  view.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', async () => { if (await editKategoria(D.getKategoria(b.dataset.id))) ctx.rerender(); }));
}

/** Termékfajta szerkesztése / új (k = null). Visszaad: true, ha mentett. */
export async function editKategoria(k) {
  const uj = !k;
  k = k || { nev: '', szin: '#2f7fd8', lepesek: [{ nev: 'Felszerelve', szin: '', suly: 0 }, { nev: 'Átadva', szin: '', suly: 0 }], oszlopok: [], vezerlo: false, aktiv: true,
    sorrend: D.kategoriak().length + 1 };
  const sz = lepesSzerkeszto(k.lepesek.map((l, i) => ({ id: '', nev: l.nev, szin: l.szin || D.alapSzin(i, k.lepesek.length), suly: l.suly || 0 })),
    D.kategoriak().filter(x => x.id !== k.id && x.lepesek.length));
  const res = await modal({
    title: uj ? 'Új termékfajta' : k.nev,
    wide: true,
    body: html`
      ${sec('Termékfajta', html`
        <label class="field"><span>Név *</span><input name="nev" value="${k.nev}" maxlength="60" autocomplete="off" placeholder="pl. Szúnyogháló"></label>
        <label class="field"><span>Szín (a listákban)</span><input type="color" name="kszin" value="${/^#[0-9a-f]{6}$/i.test(k.szin) ? k.szin : '#2f7fd8'}"></label>
        <label class="check"><input type="checkbox" name="vezerlo" ${k.vezerlo ? raw('checked') : ''}> Vezérlő (távirányító, fali kapcsoló – csatornái lehetnek)</label>
        <label class="check"><input type="checkbox" name="aktiv" ${k.aktiv ? raw('checked') : ''}> Aktív (új elemhez választható)</label>`, 'col')}
      ${sec('Alap műveletsor (sablon)', sz.body, 'col')}
      ${sec('Elem adatok (javasolt oszlopok)', html`<label class="field"><span>Vesszővel elválasztva</span>
        <input name="oszlopok" value="${k.oszlopok.join(', ')}" maxlength="500" autocomplete="off" placeholder="pl. Szín, Motor, Mozgatás"></label>`, 'col')}`,
    onMount: sz.mount,
    actions: [{ label: 'Mégse', value: null }, { label: 'Mentés', kind: 'primary', onClick: async el => {
      const v = formValues(el), lep = sz.ertek(el);
      if (!String(v.nev || '').trim()) { toast('Add meg a nevét', 'warn'); return false; }
      if (!lep.length) { toast('Legalább egy lépés kell', 'warn'); return false; }
      const masik = D.kategoriak().find(x => x.id !== k.id && D.kulcs(x.nev) === D.kulcs(v.nev));
      if (masik) { toast(`A(z) „${masik.nev}” már szerepel`, 'warn'); return false; }
      const r = await D.mentKategoria({ id: k.id, nev: v.nev.trim(), szin: v.kszin, sorrend: k.sorrend, vezerlo: !!v.vezerlo, aktiv: !!v.aktiv,
        lepesek: lep.map(l => ({ nev: l.nev, szin: l.szin, suly: l.suly })),
        oszlopok: String(v.oszlopok || '').split(',').map(s => s.trim()).filter(Boolean) });
      if (r.hiba) { toast(r.hiba, 'error', 6000); return false; }
      toast('Mentve', 'ok');
    } }],
  }).done;
  return !!res;
}

export default { render };
