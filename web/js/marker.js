// Pozíciójelölő rajza: egyszínű kör, a színe a pozíció állapota (a legelőrébb tartó kész lépés színe,
// lásd data.js → jelolo). Egy pillantásból látszik, mi nincs elkezdve / hol tart / mi van átadva.
// Minden lépés kész → fehér pipa; nyitott hiba → piros gyűrű és piros „!” jelvény.

const JO_SZIN = s => (/^#[0-9a-f]{6}$/i.test(s) ? s : '#9aa1aa');
/**
 * { szin, mind, hiba, fajta, szegmensek } → SVG szöveg. A szín a programból jön (#rrggbb), nem felhasználói szöveg.
 * szegmensek: ha a helyen több elem van, elemenként egy ív a kör körül (az elem lépésszínével) – a kör színe a legkevésbé kész elemé.
 */
export function markerSvg({ szin, mind, hiba, fajta, szegmensek }, size = 30) {
  // Terepi jelölések saját alakkal: felmérés = kék rombusz „?”-lel, hibajelzés = piros háromszög „!”-lel
  if (fajta === 'felmeres') return `<svg viewBox="0 0 30 30" width="${size}" height="${size}" aria-hidden="true">` +
    '<path d="M15 2 28 15 15 28 2 15z" fill="#1f6fb2" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>' +
    '<text x="15" y="19.5" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="Arial, sans-serif">?</text></svg>';
  if (fajta === 'hiba') return `<svg viewBox="0 0 30 30" width="${size}" height="${size}" aria-hidden="true">` +
    '<path d="M15 2.5 28.5 26.5H1.5z" fill="#d0192a" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M15 10v8M15 21.8v.2" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';
  const color = JO_SZIN(szin);
  // Több elem: ívek a kör körül (r = 13,2; a hibagyűrű helyén – hibánál a piros gyűrű az erősebb jelzés)
  let ivek = '';
  if (!hiba && Array.isArray(szegmensek) && szegmensek.length > 1) {
    const n = szegmensek.length, r = 13.2, kerulet = 2 * Math.PI * r, hossz = kerulet / n, res = Math.min(1.6, hossz * 0.25);
    ivek = szegmensek.map((s, i) => `<circle cx="15" cy="15" r="${r}" fill="none" stroke="${JO_SZIN(s)}" stroke-width="2.6" ` +
      `stroke-dasharray="${(hossz - res).toFixed(2)} ${(kerulet - hossz + res).toFixed(2)}" stroke-dashoffset="${(-i * hossz + kerulet / 4).toFixed(2)}"/>`).join('');
  }
  return `<svg viewBox="0 0 30 30" width="${size}" height="${size}" aria-hidden="true">` + ivek +
    (hiba ? '<circle cx="15" cy="15" r="13.2" fill="none" stroke="#d0192a" stroke-width="3"/>' : '') +
    `<circle cx="15" cy="15" r="${hiba ? 9.6 : 11}" fill="${color}" stroke="#fff" stroke-width="2"/>` +
    (mind ? '<path d="M10.6 15.2l3 3 5.8-6.1" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' : '') +
    (hiba ? '<circle cx="24" cy="6" r="5.6" fill="#d0192a" stroke="#fff" stroke-width="1.2"/>' +
      '<path d="M24 3.2v3.6M24 8.6v.2" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>' : '') +
    '</svg>';
}
