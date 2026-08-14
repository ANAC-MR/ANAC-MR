/* ============================================================
 * ANAC SGV — Référentiel géographique partagé (source de vérité)
 * Chargé en <script src="anac-geo.js"> AVANT les scripts de page.
 * Expose window.ANAC_GEO. Objectif : éviter la duplication des
 * listes/aéroports mauritaniens et des tests MAI entre les pages.
 * ============================================================ */
(function (w) {
  'use strict';

  // Codes IATA des aéroports mauritaniens (leurs ICAO commencent par GQ).
  var MR_IATA = ['NKC','NDB','OUZ','ATR','KFA','SEY','TIY','AJJ','KED','EMN','AEO','LEG','BGH','MOM','THT','TMD','OTL'];

  // Variantes de nom de la compagnie nationale.
  var MA_NAMES = ['mauritania airlines','mauritanie airlines','l6','mauritania airlines international','mai','mauritania'];

  // Codes reconnus pour Nouakchott (base ANAC).
  var NKC_CODES = ['GQNO','GQNN','NKC','NOUAKCHOTT'];

  function isMauritanieAirport(code) {
    if (!code) return false;
    var c = String(code).toUpperCase().trim();
    if (c.indexOf('GQ') === 0) return true;   // ICAO mauritanien
    return MR_IATA.indexOf(c) !== -1;         // IATA mauritanien (ex: NDB)
  }

  function isMauritanieAirlines(company) {
    if (!company) return false;
    var c = String(company).toLowerCase().trim();
    return MA_NAMES.some(function (n) { return c === n || c.indexOf(n) !== -1; });
  }

  function isNKC(code) {
    if (!code) return false;
    return NKC_CODES.indexOf(String(code).toUpperCase().trim()) !== -1;
  }

  w.ANAC_GEO = {
    MR_IATA: MR_IATA,
    MA_NAMES: MA_NAMES,
    NKC_CODES: NKC_CODES,
    isMauritanieAirport: isMauritanieAirport,
    isMauritanieAirlines: isMauritanieAirlines,
    isNKC: isNKC
  };
})(window);
