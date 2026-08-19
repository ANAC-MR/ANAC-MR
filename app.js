// ============================================
// CONFIGURATION & CONSTANTS
// ============================================

// ── RACCOURCI CLAVIER GLOBAL (attaché en tout premier) ──────────
// Ctrl/Cmd + Entrée :
//   • formulaire fermé  → ouvre le formulaire d'ajout d'un vol
//   • formulaire ouvert → clique sur le bouton Enregistrer
// Autonome : ne dépend d'aucune autre fonction, donc fonctionne même si
// une étape d'initialisation échoue plus bas.
if (!window._kbShortcutsBound) {
    window._kbShortcutsBound = true;
    document.addEventListener('keydown', function(event) {
        try {
            const isEnter = event.key === 'Enter' || event.code === 'Enter' ||
                            event.code === 'NumpadEnter' || event.keyCode === 13;
            if (!((event.ctrlKey || event.metaKey) && isEnter)) return;
            const modal = document.getElementById('flightModal');
            const modalOpen = modal && modal.classList.contains('active');
            event.preventDefault();
            if (modalOpen) {
                // Enregistrer : soumettre le formulaire (même validation que le bouton)
                const form = document.getElementById('flightForm');
                if (form) {
                    if (typeof form.requestSubmit === 'function') form.requestSubmit();
                    else if (form.dispatchEvent) form.dispatchEvent(new Event('submit', {cancelable:true}));
                }
            } else {
                // Ouvrir : cliquer sur le bouton "Ajouter un vol"
                const addBtn = document.getElementById('addFlightBtn');
                if (addBtn) addBtn.click();
                else if (typeof openModal === 'function') openModal();
            }
        } catch (e) { console.warn('Raccourci Ctrl+Entrée:', e && e.message); }
    });
    console.log('Raccourci Ctrl+Entrée activé');
}

// ── Ctrl+M : modifier le vol survolé (ou le dernier cliqué) ──────
if (!window._ctrlMBound) {
    window._ctrlMBound = true;

    // Mémoriser la ligne sous le curseur, et la dernière ligne cliquée
    document.addEventListener('mouseover', function(e) {
        const tr = e.target && e.target.closest ? e.target.closest('tr[data-flight-id]') : null;
        window._hoverFlightId = tr ? tr.getAttribute('data-flight-id') : null;
    });
    document.addEventListener('click', function(e) {
        const tr = e.target && e.target.closest ? e.target.closest('tr[data-flight-id]') : null;
        if (tr) window._lastClickedFlightId = tr.getAttribute('data-flight-id');
    });

    document.addEventListener('keydown', function(event) {
        try {
            if (!(event.ctrlKey || event.metaKey)) return;
            if (event.key !== 'm' && event.key !== 'M' && event.keyCode !== 77) return;
            const modal = document.getElementById('flightModal');
            if (modal && modal.classList.contains('active')) return;   // déjà ouvert
            event.preventDefault();

            const id = window._hoverFlightId || window._lastClickedFlightId;
            if (!id) {
                if (typeof showNotification === 'function') showNotification('Placez le curseur sur un vol, puis Ctrl+M', 'warning');
                return;
            }
            if (window._hasPerm && !window._hasPerm('edit_flight')) {
                if (typeof showNotification === 'function') showNotification('Accès refusé — permission insuffisante pour modifier un vol', 'error');
                return;
            }
            if (window.app && window.app.editFlight) window.app.editFlight(id);
            else if (typeof openEditModal === 'function') openEditModal(id);
        } catch (e) { console.warn('Raccourci Ctrl+M:', e && e.message); }
    });
    console.log('Raccourci Ctrl+M activé (modifier le vol survolé)');
}

const MONTHS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

// ── Normalisation numéro de vol — utilisée partout ──────────────
// Retire tirets, espaces et points → "L6-301", "L6 301", "L6.301" → "L6301"
function normFN(s) {
    // Normalisation pour COMPARAISON : majuscules, sans tirets/espaces/points,
    // ET sans zéros de tête dans la partie numérique.
    // Ainsi KP14 = KP014 = KP0014 (toutes compagnies).
    let v = (s || '').toString().toUpperCase().replace(/[-\s.]/g, '');
    // Séparer préfixe lettres + chiffres : enlever les zéros de tête des chiffres
    v = v.replace(/^([A-Z]+)0*(\d.*)$/, '$1$2');
    return v;
}

// Forme canonique d'AFFICHAGE/STOCKAGE : préfixe lettres + numéro sur 4 chiffres.
// Ex : KP14 -> KP0014 ; AF598 -> AF0598 ; L6116 -> L6116 (déjà 4 si on compte L+6116).
function canonFN(s) {
    const raw = (s || '').toString().toUpperCase().replace(/[-\s.]/g, '');
    const m = raw.match(/^([A-Z]+)(\d+)([A-Z]*)$/);
    if (!m) return raw;
    const prefix = m[1];
    const digits = m[2].replace(/^0+/, '') || '0';
    const suffix = m[3] || '';
    return prefix + digits.padStart(4, '0') + suffix;
}

// ─────────────────────────────────────────────────────────────
//  LOGIQUE D'ESCALE (Mauritania Airlines / L6 uniquement)
//  Un vol = un seul document ; on GÉNÈRE les lignes à l'affichage.
//
//  Règles :
//   • Escale mauritanienne (ICAO commence par "GQ") → 3 lignes :
//       1) départ → escale          (PAX escale, depuis LDM)
//       2) escale → arrivée         (VIDE, saisie manuelle fin d'année)
//       3) départ → arrivée         (PAX arrivée, depuis LDM)
//   • Escale étrangère → 2 lignes :
//       1) départ → escale          (PAX escale)
//       2) départ → arrivée finale  (PAX arrivée)
//   • Toute autre compagnie, ou vol sans escale → 1 seule ligne (le vol tel quel).
// ─────────────────────────────────────────────────────────────
function isMauritanianAirport(code) {
    // ICAO mauritanien commence par GQ. On accepte aussi IATA connus si besoin.
    const c = (code || '').toUpperCase().trim();
    if (!c) return false;
    if (c.startsWith('GQ')) return true;
    // Si code IATA (ex NDB), convertir en ICAO via adminConfig.airports
    if (adminConfig && adminConfig.airports) {
        const ap = adminConfig.airports.find(a => a.iata === c || a.icao === c);
        if (ap && ap.icao) return ap.icao.toUpperCase().startsWith('GQ');
    }
    return false;
}
function isMAIcompany(company) {
    const c = (company || '').toUpperCase();
    return c.includes('MAURITANIA') || c === 'MAI' || c === 'L6';
}

// ── Normalisation du NOM de compagnie (fusion des variantes de casse) ──
// « MAURITANIA AIRLINES » (saisie manuelle), « Mauritania Airlines » (import) et
// « mauritania airlines » désignent la MÊME compagnie. On ramène chaque libellé à
// sa forme canonique : celle de la config admin (cfg-airlines), sinon la constante
// AIRLINES. Non destructif : n'affecte que l'affichage/agrégation en mémoire, pas
// Firestore (les vols existants sont nettoyés au fil des éditions/enregistrements).
function _coNormKey(s) {
    return (s == null ? '' : String(s)).trim().toUpperCase().replace(/\s+/g, ' ');
}
let _coCanonMap = null;
function canonCompany(raw) {
    const v = (raw == null ? '' : String(raw)).trim();
    if (!v) return v;
    const names = (adminConfig && adminConfig.airlines && adminConfig.airlines.length)
        ? adminConfig.airlines.map(function(a){ return a && a.name; })
        : AIRLINES;
    const wantLen = names.length;
    // Cache reconstruit si la config a changé (nb d'entrées différent)
    if (!_coCanonMap || _coCanonMap.__len !== wantLen) {
        const m = { __len: wantLen };
        names.forEach(function(n){ if (n) m[_coNormKey(n)] = String(n).trim(); });
        _coCanonMap = m;
    }
    const hit = _coCanonMap[_coNormKey(v)];
    return hit || v;
}

// ── Charter Flights (vols MAI hors programme régulier) ──
// Identification par CASE À COCHER manuelle (champ booléen isCharter sur le vol).
// L'auto-détection par n° de vol (L6300/L6301 + suffixes A/B) est SUPPRIMÉE.
// Migration douce : les anciens vols pèlerinage suffixés (L6300A, L6301B…) sont
// cochés « Charter » au chargement s'ils n'ont pas encore le champ isCharter.
function _charterBaseFN(fn){
    let s = (fn == null ? '' : String(fn)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    s = s.replace(/[A-Z]+$/, '');
    if (/^L60*300$/.test(s)) return 'L6300';
    if (/^L60*301$/.test(s)) return 'L6301';
    return null;
}
function _charterSuffix(fn){
    const s = (fn == null ? '' : String(fn)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = s.match(/[A-Z]+$/);
    return m ? m[0] : '';
}
// Ancien vol pèlerinage à migrer : MAI + base L6300/L6301 + suffixe lettre (A, B…)
function _isLegacyCharterFlight(f){
    if (!f || !isMAIcompany(f.company)) return false;
    return !!_charterBaseFN(f.flightNumber) && _charterSuffix(f.flightNumber) !== '';
}

// Renvoie un tableau de "lignes" à afficher pour un vol.
// Chaque ligne : { from, to, passengers, babies, isMidLeg, isVirtual, parent }
// isVirtual = true pour les lignes générées (autres que la ligne principale).
function generateFlightLines(flight) {
    // Escale du vol lui-même, sinon celle définie dans le numéro de vol (admin).
    let stopCode = flight.hasStopover ? flight.stopover : '';
    let fromCode = flight.from, toCode = flight.to;
    // On ne déduit l'escale depuis le numéro de vol QUE si le vol n'a pas de
    // décision explicite. Si hasStopover === false a été enregistré, l'utilisateur
    // a dit « pas d'escale » → on respecte ce choix (évite les escales fantômes
    // comme L6300 héritant de l'escale du numéro de vol).
    const escaleDecidee = (flight.hasStopover === true || flight.hasStopover === false);
    if (!stopCode && !escaleDecidee && window._flightNumCache) {
        const info = window._flightNumCache[normFN(flight.flightNumber||'')];
        if (info && info.stopover) {
            stopCode = info.stopover;
            if (info.from) fromCode = info.from;
            if (info.to)   toCode = info.to;
        }
    }
    const hasStop = !!stopCode;
    // Pas d'escale, ou pas MAI → une seule ligne (le vol tel quel)
    if (!hasStop || !isMAIcompany(flight.company)) {
        return [{
            from: flight.from, to: flight.to,
            passengers: flight.passengers, babies: flight.babies,
            isMidLeg: false, isVirtual: false, parent: flight
        }];
    }
    const dep = fromCode, stop = stopCode, arr = toCode;
    const paxStop = Number(flight.stopoverPax || 0);
    const babStop = Number(flight.stopoverBabies || 0);
    // PAX arrivée finale = total - escale (le total stocké inclut les deux)
    const paxArr = Math.max(0, Number(flight.passengers || 0) - paxStop);
    const babArr = Math.max(0, Number(flight.babies || 0) - babStop);
    const midPax = Number(flight.midLegPax || 0);
    const midBab = Number(flight.midLegBabies || 0);

    const domesticStop = isMauritanianAirport(stop);
    const isArr = (flight.type||'').toUpperCase() === 'ARR';

    if (domesticStop) {
        // Escale mauritanienne → 3 lignes (même logique quel que soit le sens) :
        //   1) principale : origine → destination
        //   2) origine → escale
        //   3) escale → destination
        return [
            { from: dep,  to: arr,  passengers: paxArr,  babies: babArr,  isMidLeg:false, isVirtual:false, isMain:true,  parent:flight },
            { from: dep,  to: stop, passengers: paxStop, babies: babStop, isMidLeg:false, isVirtual:true,  isMain:false, parent:flight },
            { from: stop, to: arr,  passengers: midPax,  babies: midBab,  isMidLeg:true,  isVirtual:true,  isMain:false, parent:flight }
        ];
    } else {
        // Escale étrangère → 2 lignes. Le sens de la 2e ligne dépend du type :
        //   • DÉPART : NKC → escale   (ex L6104 : NKC-CKY principale, NKC-DKR)
        //   • ARRIVÉE : escale → NKC  (ex L6213 : ABJ-NKC principale, DSS-NKC)
        const secLine = isArr
            ? { from: stop, to: arr,  passengers: paxStop, babies: babStop, isMidLeg:false, isVirtual:true, isMain:false, parent:flight }
            : { from: dep,  to: stop, passengers: paxStop, babies: babStop, isMidLeg:false, isVirtual:true, isMain:false, parent:flight };
        return [
            { from: dep, to: arr, passengers: paxArr, babies: babArr, isMidLeg:false, isVirtual:false, isMain:true, parent:flight },
            secLine
        ];
    }
}
if (typeof window !== 'undefined') {
    window.generateFlightLines = generateFlightLines;
    window.isMauritanianAirport = isMauritanianAirport;
    window.isMAIcompany = isMAIcompany;
}

const AIRLINES = [
    "Mauritania Airlines",
    "Air Sénégal", 
    "Turkish Airlines",
    "Binter",
    "Air Algérie",
    "ASKY",
    "Royal Air Maroc",
    "Tunisair",
    "Air France"
];

const AIRLINE_PREFIXES = {
    "Mauritania Airlines": "L6",
    "Air Sénégal": "HC",
    "Turkish Airlines": "TK",
    "Binter": "NT",
    "Air Algérie": "AH",
    "ASKY": "KP",
    "Royal Air Maroc": "AT",
    "Tunisair": "TU",
    "Air France": "AF"
};

// ===============================
// AÉROPORT D'ORIGINE PAR COMPAGNIE
// (Quand DEP: De=NKC, À=home; Quand ARR: De=home, À=NKC)
// ===============================
// Aéroport domicile par compagnie (ICAO)
// NKC = GQNO est toujours la BASE
const COMPANY_HOME_AIRPORT = {
    "Mauritania Airlines": "",      // Multi-destinations (voir COMPANY_DESTINATIONS)
    "Air Sénégal":         "GOBD",  // Dakar
    "Turkish Airlines":    "LTFM",  // Istanbul
    "Binter":              "GCLP",  // Las Palmas
    "Air Algérie":         "DAAG",  // Alger
    "ASKY":                "DXXX",  // Lomé (code ICAO correct: DXXX)
    "Royal Air Maroc":     "GMMN",  // Casablanca
    "Tunisair":            "DTTA",  // Tunis
    "Air France":          "LFPG"   // Paris CDG
};

// Destinations par compagnie — lu depuis Firebase (adminConfig)
// Ne plus hardcoder ici — tout est géré dans le panneau admin
const COMPANY_DESTINATIONS = {}; // gardé pour compatibilité, remplacé par adminConfig

// ===============================
// LISTE DES DESTINATIONS (ICAO)
// ===============================
const DESTINATIONS = [
    // ── Mauritanie ──
    { name: "Nouakchott Oumtounsy",    code: "GQNO" },
    { name: "Nouadhibou",              code: "GQPP" },
    { name: "Néma",                    code: "GQNI" },
    { name: "Kiffa",                   code: "GQPF" },
    { name: "Zoueratt",                code: "GQPZ" },
    // ── Afrique du Nord ──
    { name: "Alger Houari Boumediene", code: "DAAG" },
    { name: "Tunis Carthage",          code: "DTTA" },
    { name: "Casablanca Mohammed V",   code: "GMMN" },
    // ── Afrique de l'Ouest ──
    { name: "Dakar Blaise Diagne",     code: "GOBD" },
    { name: "Bamako Modibo Keita",     code: "GABS" },
    { name: "Conakry Gbessia",         code: "GUCY" },
    { name: "Abidjan Houphouet",       code: "DIAP" },
    { name: "Lomé Tokoin Airport",     code: "DXXX" },
    // ── Europe & Canaries ──
    { name: "Las Palmas Gran Canaria", code: "GCLP" },
    { name: "Paris Charles de Gaulle", code: "LFPG" },
    // ── Moyen-Orient ──
    { name: "Istanbul Airport",        code: "LTFM" },
    { name: "Madinah Mohammad Abdulaziz", code: "OEMA" },
];

// ============================================
// AUTHENTICATION
// ============================================
let isAuthenticated = false;

// ============================================
// APPLICATION STATE
// ============================================
let flights = [];
let currentTypeFilter = "ALL";
let lastDeletedFlight = null;
let undoTimeout = null;
let isInitialized = false;
let editingFlightId = null;
let adminConfig = null; // loaded from Firebase admin config
let activeActionsMenu = null;

// ============================================
// DOM ELEMENT REFERENCES
// ============================================
const elements = {
    // Table
    flightTableBody: document.getElementById('flightTableBody'),
    totalPassengers: document.getElementById('totalPassengers'),
    totalBabies: document.getElementById('totalBabies'),
    
    // Filters
    yearSelect: document.getElementById('yearSelect'),
    monthSelect: document.getElementById('monthSelect'),
    companySelect: document.getElementById('companySelect'),
    fromSelect: document.getElementById('fromSelect'),
    toSelect: document.getElementById('toSelect'),
    searchFrom: document.getElementById('searchFrom'),
    searchTo: document.getElementById('searchTo'),
    searchImm: document.getElementById('searchImm'),
    searchVol: document.getElementById('searchVol'),
    resetFilters: document.getElementById('resetFilters'),
    
    // Type filter buttons
    typeButtons: document.querySelectorAll('[data-type]'),
    
    // Actions
    addFlightBtn: document.getElementById('addFlightBtn'),
    undoBtn: document.getElementById('undoBtn'),
    
    // Modal
    flightModal: document.getElementById('flightModal'),
    flightForm: document.getElementById('flightForm'),
    cancelBtn: document.getElementById('cancelBtn'),
    
    // Form inputs
    fAuthNumber: document.getElementById('fAuthNumber'),
    fDate: document.getElementById('fDate'),
    fCompany: document.getElementById('fCompany'),
    fImm: document.getElementById('fImm'),
    fVol: document.getElementById('fVol'),
    fType: document.getElementById('fType'),
    fFrom: document.getElementById('fFrom'),
    fTo: document.getElementById('fTo'),
    fStopover: document.getElementById('fStopover'),
    fStopoverPax: document.getElementById('fStopoverPax'),
    fStopoverBabies: document.getElementById('fStopoverBabies'),
    hasStopover: document.getElementById('hasStopover'),
    fPassengers: document.getElementById('fPassengers'),
    fBabies: document.getElementById('fBabies'),
    
    // Notifications
    notificationContainer: document.getElementById('notificationContainer')
};

// ============================================
// INITIALIZATION
// ============================================
async function initializeApp() {
    if (isInitialized) return;
    // Chaque étape est isolée : l'échec de l'une n'empêche pas les autres.
    // En particulier, l'affichage des vols et les filtres doivent TOUJOURS
    // fonctionner, même si la config admin ne se charge pas.
    try { await loadAdminConfig(); } catch (e) { console.warn('loadAdminConfig:', e && e.message); }
    try { populateSelects(); }        catch (e) { console.warn('populateSelects:', e && e.message); }
    try { attachEventListeners(); }   catch (e) { console.warn('attachEventListeners:', e && e.message); }
    try { setupRealtimeListener(); }  catch (e) { console.error('setupRealtimeListener:', e && e.message); }
    try { setTimeout(applyPermissionsUI, 300); } catch (e) {}
    // Re-render une fois la config prête (au cas où le 1er affichage a précédé
    // le chargement des aéroports → codes IATA appliqués).
    try { setTimeout(function(){ if(typeof render==='function' && flights && flights.length) render(); }, 400); } catch(e) {}
    isInitialized = true;
}

function applyPermissionsUI() {
    if (!window._hasPerm) return; // pas de session secondaire = admin = tout OK
    // Masquer bouton Ajouter un vol
    if (!window._hasPerm('add_flight')) {
        document.querySelectorAll('[onclick*="showModal"], [onclick*="openFlightModal"], #addFlightBtn, .add-flight-btn').forEach(el => el.style.display='none');
    }
    // Masquer lien LDM/MVT
    if (!window._hasPerm('ldm')) {
        const ldmLink = document.querySelector('a[href="ldm.html"]');
        if (ldmLink) ldmLink.style.display = 'none';
    }
    // Masquer onglet Facturation
    if (!window._hasPerm('facturation')) {
        document.querySelectorAll('[onclick*=\'facturation\']').forEach(el => el.style.display='none');
    }
    // Masquer boutons edit/delete dans le tableau
    if (!window._hasPerm('edit_flight') && !window._hasPerm('delete_flight')) {
        document.querySelectorAll('.action-btn, .edit-btn, .delete-btn').forEach(el => el.style.display='none');
    }
}


async function loadAdminConfig() {
    try {
        const { initializeApp: fbInit, getApps } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { getFirestore, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const fbConfig = {
            apiKey: "AIzaSyCHzrNNRL1MrBCCqxc-1wso9gcBwBztO40",
            authDomain: "anacmr-67835.firebaseapp.com",
            projectId: "anacmr-67835",
            storageBucket: "anacmr-67835.firebasestorage.app",
            messagingSenderId: "906668222910",
            appId: "1:906668222910:web:19d92b627f155bd2dbb1ef"
        };
        const apps = getApps();
        const fbApp = apps.find(a => a.name === 'admin-reader') || fbInit(fbConfig, 'admin-reader');
        const db = getFirestore(fbApp);
        if (window.ANAC_AUTH && window.ANAC_AUTH.ensureAuthed) {
            try { await window.ANAC_AUTH.ensureAuthed(fbApp); } catch(e) {}
        }
        // ── Config essentielle (airlines + airports) : bloquante mais isolée ──
        const [airlinesSnap, airportsSnap] = await Promise.all([
            getDoc(doc(db, 'flights', 'cfg-airlines')),
            getDoc(doc(db, 'flights', 'cfg-airports'))
        ]);
        adminConfig = {};
        if (airlinesSnap.exists() && airlinesSnap.data().list) {
            adminConfig.airlines = airlinesSnap.data().list;
            console.log('Admin airlines loaded:', adminConfig.airlines.length);
        }
        if (airportsSnap.exists() && airportsSnap.data().list) {
            adminConfig.airports = airportsSnap.data().list;
            console.log('Admin airports loaded:', adminConfig.airports.length);
        }
        // ── Cache des numéros de vol : NON bloquant (best-effort, en arrière-plan) ──
        //    Sert seulement à décomposer les escales des anciens vols. Une erreur
        //    ici (auth pas prête, permissions) NE DOIT PAS bloquer la page.
        window._flightNumCache = window._flightNumCache || {};
        loadFlightNumCache(db).catch(e => console.warn('flight_numbers cache (non bloquant):', e && e.message));
    } catch(e) {
        console.warn('Admin config not loaded:', e.message);
        adminConfig = null;
        // ── Réessai en arrière-plan (mobile/connexion lente : l'auth peut ne
        //    pas être prête au 1er essai). Jusqu'à 3 tentatives espacées de 2 s,
        //    puis re-render + re-remplissage des filtres si succès. ──
        window._cfgRetries = (window._cfgRetries || 0) + 1;
        if (window._cfgRetries <= 3) {
            setTimeout(async function() {
                try {
                    await loadAdminConfig();
                    if (adminConfig) {
                        console.log('Config admin chargée au réessai', window._cfgRetries);
                        // NB : ne pas rappeler populateSelects() (dupliquerait les options).
                        if (typeof render === 'function' && flights && flights.length) render();
                    }
                } catch(e2) {}
            }, 2000);
        }
    }
}

// Charge le cache des numéros de vol en arrière-plan, avec réessais.
// N'interrompt jamais l'affichage de la page d'accueil.
async function loadFlightNumCache(db) {
    const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            const snap = await getDocs(collection(db, 'flight_numbers'));
            const cache = {};
            snap.forEach(d => {
                const x = d.data();
                const key = normFN(x.number || x.flightNumber || '');
                if (!key) return;
                cache[key] = {
                    from: (x.from||'').toUpperCase(),
                    to: (x.to||'').toUpperCase(),
                    stopover: (x.stopover||'').toUpperCase(),
                    type: (x.type||'').toUpperCase(),
                    company: x.company||''
                };
            });
            window._flightNumCache = cache;
            console.log('flight_numbers cache:', Object.keys(cache).length, '(tentative '+attempt+')');
            // Re-render pour décomposer les escales une fois le cache prêt
            if (typeof render === 'function' && flights && flights.length) render();
            return;
        } catch(e) {
            console.warn('flight_numbers cache tentative '+attempt+' :', e && e.message);
            await new Promise(r => setTimeout(r, 700));
        }
    }
}

function populateSelects() {
    // Populate month select
    MONTHS.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = month;
        elements.monthSelect.appendChild(option);
    });
    // ── Par défaut : la page d'accueil s'ouvre sur le MOIS COURANT ──
    elements.monthSelect.value = String(new Date().getMonth());
    if (elements.yearSelect) elements.yearSelect.value = String(new Date().getFullYear());
    
    // Use admin config airlines if available, else fallback to AIRLINES constant
    const airlinesList = (adminConfig && adminConfig.airlines && adminConfig.airlines.length)
        ? adminConfig.airlines.map(a => a.name)
        : AIRLINES;

    // Option vide par défaut dans le formulaire d'ajout (modal non pré-rempli)
    const emptyFormOpt = document.createElement('option');
    emptyFormOpt.value = '';
    emptyFormOpt.textContent = '— Choisir une compagnie —';
    emptyFormOpt.disabled = true;
    emptyFormOpt.selected = true;
    elements.fCompany.appendChild(emptyFormOpt);

    const _seenCo = {};
    airlinesList.forEach(airline => {
        // Libellé canonique + dédup : évite deux entrées « MAURITANIA AIRLINES »
        // et « Mauritania Airlines » dans le filtre d'accueil / le formulaire.
        const canon = canonCompany(airline);
        if (!canon || _seenCo[canon]) return;
        _seenCo[canon] = 1;

        const filterOption = document.createElement('option');
        filterOption.value = canon;
        filterOption.textContent = canon;
        elements.companySelect.appendChild(filterOption);
        
        const formOption = document.createElement('option');
        formOption.value = canon;
        formOption.textContent = canon;
        elements.fCompany.appendChild(formOption);
    });
    
    // Use admin config airports if available, else fallback to DESTINATIONS constant
    const destinationsList = (adminConfig && adminConfig.airports && adminConfig.airports.length)
        ? adminConfig.airports.map(a => ({ code: a.icao, iata: a.iata, name: a.city || a.name }))
        : DESTINATIONS;
    
    destinationsList.forEach(dest => {
        const label = dest.iata ? `${dest.iata} (${dest.code}) – ${dest.name}` : `${dest.code} – ${dest.name}`;
        [elements.fromSelect, elements.toSelect, elements.fFrom, elements.fTo, elements.fStopover].forEach(sel => {
            const opt = document.createElement('option');
            opt.value = dest.code;
            opt.textContent = label;
            sel.appendChild(opt);
        });
    });
}

// ============================================
// EVENT LISTENERS
// ============================================
function attachEventListeners() {
    // Filter changes
    const filterElements = [
        elements.yearSelect, elements.monthSelect, elements.companySelect, elements.fromSelect, elements.toSelect,
        elements.searchFrom, elements.searchTo
    ];
    
    filterElements.forEach(element => {
        element.addEventListener('change', handleFilterChange);
    });
    
    // Input filters (real-time)
    elements.searchImm.addEventListener('input', handleFilterChange);
    elements.searchVol.addEventListener('input', handleFilterChange);
    
    // Type filter buttons
    elements.typeButtons.forEach(button => {
        button.addEventListener('click', () => handleTypeFilter(button));
    });
    
    // Reset filters
    elements.resetFilters.addEventListener('click', resetFilters);
    
    // Actions
    elements.addFlightBtn.addEventListener('click', openModal);
    elements.undoBtn.addEventListener('click', undoDelete);
    
    // Modal
    elements.cancelBtn.addEventListener('click', closeModal);
    elements.flightModal.addEventListener('click', handleModalBackdropClick);
    elements.flightForm.addEventListener('submit', handleFormSubmit);
    
    // Form interactions
    elements.fCompany.addEventListener('change', () => {
        const addMode = !editingFlightId;
        // Supprimer l'ancien select pour forcer la recréation avec la nouvelle compagnie
        const oldSel = document.getElementById('fVolSelect');
        if (oldSel) oldSel.remove();
        if (elements.fVol) elements.fVol.value = '';
        if (elements.fAuthNumber) { elements.fAuthNumber.value = ''; elements.fAuthNumber.style.borderColor = ''; }
        updateFlightNumberPrefix(addMode);
        if (typeof updateMidLegRow === 'function') updateMidLegRow();
    });
    // Mettre à jour la ligne "segment milieu" quand la destination change
    if (elements.fTo) {
        elements.fTo.addEventListener('change', () => { if (typeof updateMidLegRow === 'function') updateMidLegRow(); });
    }
    // Auto-fill N° autorisation quand date change
    if (elements.fDate) {
        elements.fDate.addEventListener('change', () => {
            // Vider l'auth pour permettre le recalcul selon la nouvelle date
            if (elements.fAuthNumber) {
                elements.fAuthNumber.value = '';
                elements.fAuthNumber.style.borderColor = '';
            }
            setTimeout(autoFillAuth, 100);
        });
    }
    if (elements.fType) {
        elements.fType.addEventListener('change', updateRouteByType);
    }
    elements.fAuthNumber.addEventListener('input', handleAuthNumberInput);
    
    // Uppercase transformation for all text inputs
    const textInputs = [
        elements.fAuthNumber,
        elements.fImm,
        elements.fVol,
        elements.searchImm,
        elements.searchVol
    ];
    
    textInputs.forEach(input => {
        input.addEventListener('input', () => {
            input.value = input.value.toUpperCase();
        });
    });
    
    // Keyboard shortcuts : attachés globalement plus bas (window._kbShortcutsBound)
    
    // Close actions menus when clicking outside
    document.addEventListener('click', (event) => {
        if (activeActionsMenu && !event.target.closest('.actions-wrapper')) {
            closeAllActionsMenus();
        }
    });
}

// Échap : fermer la modale (attaché séparément)
if (!window._escBound) {
    window._escBound = true;
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const modal = document.getElementById('flightModal');
            if (modal && modal.classList.contains('active') && typeof closeModal === 'function') {
                closeModal();
            }
        }
    });
}

// ============================================
// MODAL FUNCTIONS
// ============================================
function openModal(flightId = null) {
    const _openModalAction = () => {
        elements.flightModal.classList.add('active');
        
        // Validate flightId - ensure it's a string, not an event object
        const validFlightId = (flightId && typeof flightId === 'string') ? flightId : null;
        
        if (validFlightId) {
            // Edit mode
            editingFlightId = validFlightId;
            const flight = flights.find(f => f.id === validFlightId);
            
            if (flight) {
                // Update modal title
                const modalTitle = elements.flightModal.querySelector('h2');
                modalTitle.textContent = 'Modifier un vol';
                
                // Pre-fill form with flight data
                elements.fAuthNumber.value = flight.authorizationNumber || '';
                elements.fDate.value = flight.date;
                elements.fCompany.value = flight.company;
                elements.fImm.value = flight.registration;
                elements.fVol.value = flight.flightNumber;

                // Synchroniser les selects dynamiques (immatriculation + n° vol)
                // avec la compagnie du vol — sinon ils gardent l'état précédent
                // et l'immatriculation paraît « réinitialisée ».
                updateFlightNumberPrefix(false);

                if (window.selectType) window.selectType(flight.type || 'DEP'); else { const fi=document.getElementById('fType'); if(fi) fi.value=flight.type; }
                // selectType/updateRouteByType reconstruisent De/À avec les
                //    valeurs par défaut : on repose ICI le trajet réel du vol.
                //    Assignation INCONDITIONNELLE : sinon les destinations du
                //    vol précédemment édité restaient affichées.
                elements.fFrom.value = flight.from || '';
                elements.fTo.value = flight.to || '';
                elements.fPassengers.value = flight.passengers;
                elements.fBabies.value = flight.babies;

                // ── Escale : celle du vol, sinon celle du numéro de vol (admin) ──
                let stopCode = flight.stopover || '';
                if (!stopCode && window._flightNumCache && isMAIcompany(flight.company)) {
                    const info = window._flightNumCache[normFN(flight.flightNumber || '')];
                    if (info && info.stopover) {
                        // flight_numbers stocke l'IATA (NDB) ; le select attend l'ICAO (GQPP)
                        let sc = info.stopover;
                        if (adminConfig && adminConfig.airports) {
                            const ap = adminConfig.airports.find(a => a.iata === sc || a.icao === sc);
                            if (ap && ap.icao) sc = ap.icao;
                        }
                        stopCode = sc;
                    }
                }
                const hasStop = !!stopCode;
                if (elements.hasStopover) elements.hasStopover.checked = hasStop;
                if (elements.fStopover) elements.fStopover.value = stopCode;
                if (elements.fStopoverPax) elements.fStopoverPax.value = flight.stopoverPax || 0;
                if (elements.fStopoverBabies) elements.fStopoverBabies.value = flight.stopoverBabies || 0;
                const _mlp = document.getElementById('fMidLegPax'); if (_mlp) _mlp.value = flight.midLegPax || 0;
                const _mlb = document.getElementById('fMidLegBabies'); if (_mlb) _mlb.value = flight.midLegBabies || 0;
                // PAX du vol principal (= total − escale) pour l'édition d'un vol MAI à escale
                const _mainP = document.getElementById('fMainPax');
                const _mainB = document.getElementById('fMainBabies');
                if (_mainP) _mainP.value = Math.max(0,(Number(flight.passengers)||0)-(Number(flight.stopoverPax)||0));
                if (_mainB) _mainB.value = Math.max(0,(Number(flight.babies)||0)-(Number(flight.stopoverBabies)||0));
                const sg1 = document.getElementById('stopoverGroup');
                if (sg1) sg1.style.display = hasStop ? '' : 'none';
                if (typeof updateMidLegRow === 'function') updateMidLegRow();
                if (typeof updateEscaleTotals === 'function') updateEscaleTotals();

                // Charter Flight : afficher la case (si MAI) et charger l'état
                toggleCharterField(flight.company);
                const _chkC = document.getElementById('fCharter');
                if (_chkC) _chkC.checked = !!flight.isCharter;

                // ── Anti-course : ré-affirmer le trajet et l'escale APRÈS la fin
                //    des opérations asynchrones (updateVolField, auto-remplissage…)
                //    qui pouvaient écraser les selects avec d'anciennes valeurs. ──
                setTimeout(function() {
                    if (editingFlightId !== flight.id) return;   // le modal a changé entre-temps
                    elements.fFrom.value = flight.from || '';
                    elements.fTo.value = flight.to || '';
                    if (elements.hasStopover) elements.hasStopover.checked = hasStop;
                    if (elements.fStopover) elements.fStopover.value = stopCode;
                    if (typeof updateMidLegRow === 'function') updateMidLegRow();
                    // Numéro de vol : le reposer AUSSI dans le select verrouillé,
                    // que updateVolField a pu reconstruire entre-temps.
                    elements.fVol.value = flight.flightNumber || '';
                    const _vsel = document.getElementById('fVolSelect');
                    if (_vsel && flight.flightNumber) {
                        let _ok = false;
                        for (let i = 0; i < _vsel.options.length; i++) {
                            if (_vsel.options[i].value === flight.flightNumber) { _ok = true; break; }
                        }
                        if (!_ok) {
                            const _o = document.createElement('option');
                            _o.value = flight.flightNumber; _o.textContent = flight.flightNumber;
                            _vsel.appendChild(_o);
                        }
                        _vsel.value = flight.flightNumber;
                    }
                    // Règle du numéro de vol : verrouille (ou interdit) l'escale
                    if (window.syncEscaleFromFlightNumber) syncEscaleFromFlightNumber();
                }, 450);

                elements.fAuthNumber.focus();
            }
        } else {
            // Add mode — vider tous les champs
            editingFlightId = null;
            resetForm();

            // Update modal title
            const modalTitle = elements.flightModal.querySelector('h2');
            modalTitle.textContent = 'Ajouter un vol';

            // Vider explicitement chaque champ
            if (elements.fAuthNumber) { elements.fAuthNumber.value = ''; elements.fAuthNumber.style.borderColor = ''; }
            if (elements.fDate)       elements.fDate.value = '';
            if (elements.fVol)        elements.fVol.value = '';
            if (elements.fImm)        elements.fImm.value = '';
            if (elements.fPassengers) elements.fPassengers.value = '0';
            if (elements.fBabies)     elements.fBabies.value = '0';
            if (elements.hasStopover) elements.hasStopover.checked = false;
            if (elements.fStopover)   elements.fStopover.value = '';
            if (elements.fStopoverPax)    elements.fStopoverPax.value = 0;
            if (elements.fStopoverBabies) elements.fStopoverBabies.value = 0;

            // Vider le select dynamique fVolSelect si présent
            const existSel = document.getElementById('fVolSelect');
            if (existSel) { existSel.value = ''; }

            const sg0 = document.getElementById('stopoverGroup');
            if (sg0) sg0.style.display = 'none';

            // Charter Flight : décocher + masquer tant qu'aucune compagnie MAI choisie
            const _chkC0 = document.getElementById('fCharter');
            if (_chkC0) _chkC0.checked = false;
            toggleCharterField('');

            // Modal vierge : aucune compagnie ni route pré-remplie.
            // L'utilisateur choisit lui-même la compagnie.
            elements.fCompany.value = '';

            elements.fDate.focus();
            setTimeout(() => {
                if (window.selectType) window.selectType('DEP');
                updateFlightNumberPrefix(true); // true = isAddMode → champs vides
            }, 60);
        }
    };
    _openModalAction();
}

function openEditModal(flightId) {
    openModal(flightId);
}

function closeModal() {
    elements.flightModal.classList.remove('active');
    editingFlightId = null;
    resetForm();
    
    // Reset modal title
    const modalTitle = elements.flightModal.querySelector('h2');
    modalTitle.textContent = 'Ajouter un vol';
}

function handleModalBackdropClick(event) {
    if (event.target === elements.flightModal) {
        closeModal();
    }
}

function resetForm() {
    elements.flightForm.reset();
    clearValidationErrors();
    // Ré-activer les contrôles d'escale (ils peuvent avoir été verrouillés
    // par la règle du numéro de vol) pour le prochain vol saisi.
    const hs = document.getElementById('hasStopover');
    if (hs) hs.disabled = false;
    if (elements.fStopover) elements.fStopover.disabled = false;
}

// ============================================
// FORM HANDLING
// ============================================
function handleFormSubmit(event) {
    event.preventDefault();
    // Vérifier permission
    const perm = editingFlightId ? 'edit_flight' : 'add_flight';
    if (window._hasPerm && !window._hasPerm(perm)) {
        showNotification('Accès refusé — permission insuffisante pour ' + (editingFlightId ? 'modifier' : 'ajouter') + ' un vol', 'error');
        return;
    }
    if (validateForm()) {
        const flightData = getFormData();
        if (editingFlightId) {
            updateFlight(editingFlightId, flightData);
        } else {
            addFlight(flightData);
        }
    }
}

function validateForm() {
    clearValidationErrors();
    let isValid = true;
    
    // Un Charter Flight n'a JAMAIS de n° d'autorisation : on ne l'exige pas.
    const _cbCharter = document.getElementById('fCharter');
    const _isCharter = !!(_cbCharter && _cbCharter.checked);

    const required = [
        { field: elements.fDate, message: 'La date est requise' },
        { field: elements.fCompany, message: 'La compagnie est requise' },
        { field: elements.fImm, message: 'L\'immatriculation est requise' },
        { field: elements.fVol, message: 'Le numéro de vol est requis' },
        { field: elements.fFrom, message: 'L\'aéroport de départ est requis' },
        { field: elements.fTo, message: 'L\'aéroport d\'arrivée est requis' }
    ];
    if (!_isCharter) {
        required.unshift({ field: elements.fAuthNumber, message: 'Le numéro d\'autorisation est requis' });
    }
    
    required.forEach(({ field, message }) => {
        if (!field.value.trim()) {
            showFieldError(field, message);
            isValid = false;
        }
    });
    
    // Validate authorization number format
    if (elements.fAuthNumber.value.trim() && !validateAuthNumber(elements.fAuthNumber.value.trim())) {
        showFieldError(elements.fAuthNumber, 'Format invalide. Utilisez SNA25-0001 ou SNA26-0001.');
        isValid = false;
    }
    
    // Validate authorization number uniqueness
    const authNumber = elements.fAuthNumber.value.trim();
    if (authNumber) {
        const conflict = flights.find(f =>
            f.authorizationNumber === authNumber && f.id !== editingFlightId
        );
        if (conflict) {
            showFieldError(elements.fAuthNumber,
                `Ce numéro d'autorisation existe déjà (vol ${conflict.flightNumber || '?'} du ${formatDateEU(conflict.date) || '?'})`);
            isValid = false;
        }
    }

    // Validate flight number + date uniqueness (interdiction stricte des doublons)
    // Bloque à l'ajout ET à la modification ; autorise si c'est le MÊME vol qu'on édite.
    // EXEMPTION Charter : plusieurs rotations d'un même n° de vol le même jour
    // sont légitimes pour un charter → pas de blocage doublon.
    const fNum = normFN(elements.fVol && elements.fVol.value ? elements.fVol.value : '');
    const fDate = elements.fDate ? elements.fDate.value.trim() : '';
    if (fNum && fDate && !_isCharter) {
        const dupVol = flights.find(f =>
            normFN(f.flightNumber) === fNum && f.date === fDate && f.id !== editingFlightId
        );
        if (dupVol) {
            showFieldError(elements.fVol, 'Un vol avec ce numéro existe déjà pour cette date. Doublon interdit.');
            isValid = false;
        }
    }

    // ── Garde-fou de conformité (vol ↔ numéro de vol) ──
    // Bloque les incohérences que l'on retrouve sinon dans l'Audit.
    const _NKC = ['GQNO','GQNN','NKC','NOUAKCHOTT'];
    const _isNkc = c => _NKC.includes((c||'').toUpperCase().trim());
    const _from = (elements.fFrom.value||'').toUpperCase().trim();
    const _to   = (elements.fTo.value||'').toUpperCase().trim();
    const _type = (elements.fType.value||'').toUpperCase();
    // 1) Départ = arrivée (NKC → NKC) : impossible.
    if (_from && _to && _isNkc(_from) && _isNkc(_to)) {
        showFieldError(elements.fTo, 'Départ et arrivée identiques (Nouakchott → Nouakchott) : impossible.');
        isValid = false;
    }
    // 2) Conformité au numéro de vol enregistré (le registre fait foi).
    const _reg = (window._flightNumCache||{})[fNum];
    if (_reg) {
        const _rType = (_reg.type||'').toUpperCase();
        if (_rType && _type && _rType !== _type) {
            showFieldError(elements.fType,
                `Ce numéro est enregistré comme ${_rType==='ARR'?'Arrivée':'Départ'} (Numéros de vol). Corrigez le type ou le numéro.`);
            isValid = false;
        }
        // Destination (ville hors NKC) : doit correspondre au numéro enregistré.
        // Le formulaire utilise l'ICAO (DXXX) et le registre l'IATA (LFW) :
        // on normalise les deux vers l'ICAO avant de comparer (évite les faux positifs).
        const _apList = (typeof adminConfig!=='undefined' && adminConfig && adminConfig.airports) ? adminConfig.airports : [];
        const _toIcaoCode = c => {
            c = (c||'').toUpperCase().trim(); if(!c) return c;
            const ap = _apList.find(a => (a.icao||'').toUpperCase()===c || (a.iata||'').toUpperCase()===c);
            return ap ? (ap.icao||c).toUpperCase() : c;
        };
        const _cityOf = (a,b) => _isNkc(a) ? b : (_isNkc(b) ? a : (b||a));
        const _rCity = _toIcaoCode(_cityOf(_reg.from, _reg.to));
        const _fCity = _toIcaoCode(_cityOf(_from, _to));
        if (_rCity && _fCity && !_isNkc(_rCity) && !_isNkc(_fCity) && _rCity !== _fCity) {
            const _attendu = _cityOf(_reg.from, _reg.to);   // code du registre (tel qu'enregistré)
            showFieldError(elements.fTo,
                `Destination incohérente avec le numéro de vol (attendu ${_attendu}). Corrigez le trajet ou le numéro.`);
            isValid = false;
        }
    }

    return isValid;
}

function showFieldError(field, message) {
    field.classList.add('error');
    
    let errorElement = field.parentNode.querySelector('.field-error');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'field-error';
        field.parentNode.appendChild(errorElement);
    }
    
    errorElement.textContent = message;
}

function clearValidationErrors() {
    document.querySelectorAll('.field-error').forEach(error => error.remove());
    document.querySelectorAll('.error').forEach(field => field.classList.remove('error'));
}

function getFormData() {
    const hasStop     = !!(elements.hasStopover && elements.hasStopover.checked);
    const comp        = elements.fCompany ? elements.fCompany.value : '';
    const isMaiStop   = hasStop && isMAIcompany(comp) && document.getElementById('fMainPax');
    const stopPax     = hasStop ? (parseInt(elements.fStopoverPax   && elements.fStopoverPax.value)   || 0) : 0;
    const stopBabies  = hasStop ? (parseInt(elements.fStopoverBabies && elements.fStopoverBabies.value) || 0) : 0;
    // Pour un vol MAI à escale, le PAX du vol principal vient de fMainPax.
    // Sinon (vol normal ou autre compagnie), on garde le champ PAX (VOL) du haut.
    const mainPax     = isMaiStop ? (parseInt(document.getElementById('fMainPax').value)||0) : (parseInt(elements.fPassengers.value) || 0);
    const mainBabies  = isMaiStop ? (parseInt(document.getElementById('fMainBabies').value)||0) : (parseInt(elements.fBabies.value) || 0);
    // Charter Flight (MAI uniquement) — case à cocher manuelle
    const _charterCb  = document.getElementById('fCharter');
    const isCharter   = !!(isMAIcompany(comp) && _charterCb && _charterCb.checked);

    return {
        authorizationNumber: elements.fAuthNumber.value.trim().toUpperCase(),
        date:     elements.fDate.value,
        company:  elements.fCompany.value,
        registration: (document.getElementById('fImmSelect') && document.getElementById('fImmSelect').value
            ? document.getElementById('fImmSelect').value
            : elements.fImm.value.trim().toUpperCase()),
        flightNumber: canonFN(document.getElementById('fVolSelect') && document.getElementById('fVolSelect').value
            ? document.getElementById('fVolSelect').value
            : elements.fVol.value.trim()),
        type:     elements.fType.value,
        from:     elements.fFrom.value,
        to:       elements.fTo.value,
        // Escale
        hasStopover:    hasStop,
        stopover:       hasStop && elements.fStopover ? elements.fStopover.value : '',
        stopoverPax:    stopPax,
        stopoverBabies: stopBabies,
        // Segment escale → arrivée (saisie manuelle fin d'année)
        midLegPax:      hasStop && document.getElementById('fMidLegPax') ? (parseInt(document.getElementById('fMidLegPax').value)||0) : 0,
        midLegBabies:   hasStop && document.getElementById('fMidLegBabies') ? (parseInt(document.getElementById('fMidLegBabies').value)||0) : 0,
        // PAX TOTAL du vol = vol principal + escale (le milieu est interne, non compté)
        passengers: mainPax + stopPax,
        babies:     mainBabies + stopBabies,
        isCharter:  isCharter,
        timestamp:  Date.now()
    };
}

// updateVolField — lit depuis Firebase collection flight_numbers
async function updateVolField(company, forceEmpty = false) {
    const fVol   = elements.fVol;
    const parent = fVol.parentNode;
    const existingSelect = parent.querySelector('#fVolSelect');

    // Si le select existe déjà pour la même compagnie, on ne le RECONSTRUIT pas
    // (ça effacerait la sélection), mais on ré-applique quand même le numéro du
    // vol en cours d'édition : sinon il reste vide, comme laissé par la
    // fermeture précédente — c'est ce qui donnait l'impression d'une remise à zéro.
    if (existingSelect && !forceEmpty && existingSelect.dataset.company === company) {
        if (editingFlightId && fVol.value) {
            const val = fVol.value;
            let found = false;
            for (let i = 0; i < existingSelect.options.length; i++) {
                if (existingSelect.options[i].value === val) { found = true; break; }
            }
            if (!found) {
                const opt = document.createElement('option');
                opt.value = val; opt.textContent = val;
                existingSelect.appendChild(opt);
            }
            existingSelect.value = val;
        }
        return;
    }
    if (existingSelect) existingSelect.remove();
    if (!company || !window.db) { fVol.style.display = ''; return; }

    try {
        const { getDocs, collection, query, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const q    = query(collection(window.db, 'flight_numbers'), where('company','==', company));
        const snap = await getDocs(q);
        const volList = snap.docs.map(d => ({ id:d.id, ...d.data() }));

        // Vérifier si verrouillé dans adminConfig
        const airlineData = adminConfig && adminConfig.airlines
            ? adminConfig.airlines.find(a => a.name === company)
            : null;
        const isLocked = airlineData && airlineData.volLocked;

        if (isLocked && volList.length > 0) {
            fVol.style.display = 'none';
            const sel = document.createElement('select');
            sel.id = 'fVolSelect';
            sel.dataset.company = company;
            sel.required = true;
            sel.className = fVol.className;
            sel.style.display = '';
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = '— Choisir un numéro de vol —';
            sel.appendChild(defaultOpt);
            volList.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.number;
                opt.textContent = v.number + (v.stopover ? ' (via ' + v.stopover + ')' : '');
                // Ne pré-sélectionner que si on est en mode édition (editingFlightId défini)
                if (editingFlightId && fVol.value === v.number) opt.selected = true;
                sel.appendChild(opt);
            });
            // Numéro du vol édité absent de la liste : l'ajouter pour qu'il
            // s'affiche et se sauvegarde tel quel.
            if (!forceEmpty && editingFlightId && fVol.value &&
                ![...sel.options].some(o => o.value === fVol.value)) {
                const opt = document.createElement('option');
                opt.value = fVol.value;
                opt.textContent = fVol.value;
                opt.selected = true;
                sel.appendChild(opt);
            }
            parent.insertBefore(sel, fVol.nextSibling);
            sel.addEventListener('change', () => {
                fVol.value = sel.value;
                // Vider auth pour recalcul
                if (elements.fAuthNumber) { elements.fAuthNumber.value = ''; elements.fAuthNumber.style.borderColor = ''; }
                syncEscaleFromFlightNumber();   // règle d'escale immédiate
                autoFillFromFlightNumber(sel.value);
                setTimeout(autoFillAuth, 200);
            });
            // Restaurer valeur seulement en mode édition ET si pas forceEmpty
            if (!forceEmpty && editingFlightId && fVol.value) sel.value = fVol.value;
            else sel.value = '';
        } else {
            fVol.style.display = '';
        }
    } catch(e) {
        console.warn('updateVolField Firebase:', e.message);
        fVol.style.display = '';
    }
}

// ── Auto-remplissage depuis flight_numbers + programme_vols ──

// Appelé dès que vol, date ou compagnie change
async function autoFillAuth() {
    const flightNum = (elements.fVol && elements.fVol.value.trim()) ||
                      (document.getElementById('fVolSelect') && document.getElementById('fVolSelect').value.trim()) || '';
    const date = elements.fDate ? elements.fDate.value.trim() : '';
    if (!flightNum) return;
    if (!window.db) return;

    const fn = normFN(flightNum);

    // Si pas de date encore saisie, ne rien faire — attendre les 2 champs
    if (!date) return;

    try {
        const { getDocs, collection, query, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        let rec = null;

        // Stratégie 1 : flightNorm + date exacte
        const q1 = query(collection(window.db, 'programme_vols'),
                         where('flightNorm', '==', fn),
                         where('date', '==', date));
        const s1 = await getDocs(q1);
        if (!s1.empty) rec = s1.docs[0].data();

        // Stratégie 2 : anciens docs sans flightNorm — scan par flight brut normalisé + date
        if (!rec) {
            const snap = await getDocs(collection(window.db, 'programme_vols'));
            const all  = snap.docs.map(d => d.data());
            // Chercher uniquement ceux dont la date correspond ET le vol correspond
            rec = all.find(d => normFN(d.flight||'') === fn && d.date === date) || null;
        }

        // Remplir seulement si trouvé avec vol+date — sinon laisser vide
        if (rec && rec.auth && elements.fAuthNumber) {
            elements.fAuthNumber.value = rec.auth.toUpperCase();
            elements.fAuthNumber.style.borderColor = '#34d399';
            setTimeout(() => { if (elements.fAuthNumber) elements.fAuthNumber.style.borderColor = ''; }, 2000);
        }
        // Si pas trouvé → le champ reste blanc (déjà vidé avant l'appel)
    } catch(e) { console.warn('autoFillAuth:', e.message); }
}

async function autoFillFromFlightNumber(flightNum) {
    if (!flightNum || flightNum.length < 3) return;
    if (!window.db) return;
    try {
        const { getDocs, collection, query, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const fnNorm = normFN(flightNum);
        // Chercher les 2 formes (avec/sans tirets) pour compatibilité
        const [snapNorm, snapRaw] = await Promise.all([
            getDocs(query(collection(window.db, 'flight_numbers'), where('number','==', fnNorm))),
            getDocs(query(collection(window.db, 'flight_numbers'), where('number','==', flightNum.toUpperCase().trim())))
        ]);
        const snap = !snapNorm.empty ? snapNorm : snapRaw;
        if (!snap.empty) {
            const rec = snap.docs[0].data();
            // Remplir compagnie
            if (rec.company && elements.fCompany) {
                elements.fCompany.value = rec.company;
                // Ne pas reconstruire le select si on est en train de saisir (mode ADD)
                if (!editingFlightId) updateImmField(rec.company);
                else updateFlightNumberPrefix();
            }
            // Remplir type
            if (rec.type) {
                if (window.selectType) window.selectType(rec.type);
                else {
                    const typeEl = document.getElementById('fType');
                    if (typeEl) { typeEl.value = rec.type; updateRouteByType(); }
                }
            }
            // Convertir IATA → ICAO si nécessaire (flight_numbers stocke IATA)
            function _iataToIcao(code) {
                if (!code) return '';
                if (!adminConfig || !adminConfig.airports) return code;
                const ap = adminConfig.airports.find(a => a.iata === code);
                return ap ? ap.icao : code;
            }
            // Remplir De / Vers
            const fromCode = _iataToIcao(rec.from);
            const toCode   = _iataToIcao(rec.to);
            if (fromCode && elements.fFrom) elements.fFrom.value = fromCode;
            if (toCode   && elements.fTo)   elements.fTo.value   = toCode;
            // Remplir Escale si définie
            if (rec.stopover) {
                const hasStopEl = document.getElementById('hasStopover');
                const stopGroup = document.getElementById('stopoverGroup');
                if (hasStopEl) hasStopEl.checked = true;
                const stopCode = _iataToIcao(rec.stopover);
                if (elements.fStopover) elements.fStopover.value = stopCode;
                if (stopGroup) stopGroup.style.display = '';
            }
        }
        // Toujours tenter l'auto-fill du numéro d'autorisation
        await autoFillAuth();
    } catch(e) { console.warn('autoFill flight_numbers:', e.message); }
    // Appliquer la règle d'escale du numéro de vol (verrouillage)
    syncEscaleFromFlightNumber();
}

// ── Règle métier : l'escale est déterminée par le NUMÉRO DE VOL (admin) ──
//   • Numéro avec escale   → case cochée + aéroport imposé, les deux VERROUILLÉS.
//   • Numéro sans escale   → escale impossible (case décochée et verrouillée).
//   • Numéro inconnu admin → mode manuel (liberté, comportement historique).
function syncEscaleFromFlightNumber() {
    const hasStopEl = document.getElementById('hasStopover');
    const stopSel   = elements.fStopover;
    const stopGroup = document.getElementById('stopoverGroup');
    if (!hasStopEl || !stopSel) return;
    const fnRaw = (document.getElementById('fVolSelect') && document.getElementById('fVolSelect').value) ||
                  (elements.fVol && elements.fVol.value) || '';
    const fn = normFN(fnRaw);
    const info = (fn && window._flightNumCache) ? window._flightNumCache[fn] : null;
    if (!info) {
        // Numéro absent de l'admin → l'utilisateur garde la main
        hasStopEl.disabled = false;
        stopSel.disabled = false;
        return;
    }
    if (info.stopover) {
        // Escale définie par le numéro → imposée et verrouillée
        let sc = info.stopover;
        if (adminConfig && adminConfig.airports) {
            const ap = adminConfig.airports.find(a => a.iata === sc || a.icao === sc);
            if (ap && ap.icao) sc = ap.icao;
        }
        hasStopEl.checked = true;
        hasStopEl.disabled = true;
        stopSel.value = sc;
        stopSel.disabled = true;
        if (stopGroup) stopGroup.style.display = '';
    } else {
        // Numéro sans escale → ajout d'escale impossible
        hasStopEl.checked = false;
        hasStopEl.disabled = true;
        stopSel.value = '';
        stopSel.disabled = true;
        if (stopGroup) stopGroup.style.display = 'none';
    }
    if (typeof updateMidLegRow === 'function') updateMidLegRow();
    if (typeof updateEscaleTotals === 'function') updateEscaleTotals();
};

window.syncEscaleFromFlightNumber = syncEscaleFromFlightNumber;

function updateFlightNumberPrefix(isAddMode = false) {
    const company = elements.fCompany.value;
    
    // Mettre le préfixe seulement si on est en édition ou si le champ est déjà pré-rempli avec un préfixe
    if (!isAddMode) {
        const prefix = AIRLINE_PREFIXES[company] ||
            (adminConfig && adminConfig.airlines
                ? (adminConfig.airlines.find(a => a.name === company) || {}).prefix
                : null);
        const currentValue = elements.fVol.value.trim();
        if (prefix && (!currentValue || currentValue.match(/^[A-Z0-9]+-$/))) {
            elements.fVol.value = prefix + '-';
        }
    }
    
    // Auto-fill From/To based on company + type
    updateRouteByType();
    
    // Update immatriculation field based on admin config
    updateImmField(company);
    // Update vol number field based on admin config — forceEmpty en mode ADD
    updateVolField(company, isAddMode);
    // Charter Flight : la case ne s'affiche que pour MAI
    toggleCharterField(company);
}

// Affiche/masque la case « Charter » selon la compagnie (MAI uniquement).
// ── Règle Charter : un charter n'a JAMAIS de n° d'autorisation ──
// Case cochée -> champ N° auth vidé, désactivé, non obligatoire.
// Case décochée -> champ réactivé et obligatoire (vol régulier).
window.applyCharterAuthRule = function(){
    const cb   = document.getElementById('fCharter');
    const auth = document.getElementById('fAuthNumber');
    if (!auth) return;
    const isCharter = !!(cb && cb.checked);
    if (isCharter){
        auth.value = '';
        auth.disabled = true;
        auth.required = false;
        auth.placeholder = 'Non requis (charter)';
    } else {
        auth.disabled = false;
        auth.required = true;
        auth.placeholder = '';
    }
};

function toggleCharterField(company){
    const wrap = document.getElementById('charterToggle');
    if (!wrap) return;
    const show = isMAIcompany(company);
    wrap.style.display = show ? '' : 'none';
    if (!show){ const cb = document.getElementById('fCharter'); if (cb) cb.checked = false; }
    if (window.applyCharterAuthRule) window.applyCharterAuthRule();
}

// Listener sur le champ fVol (input texte) pour auto-fill depuis flight_numbers ET programme_vols
(function() {
    const fv = document.getElementById('fVol');
    if (fv) {
        let _autoFillTimer;
        fv.addEventListener('input', () => {
            clearTimeout(_autoFillTimer);
            // Vider auth immédiatement
            if (elements.fAuthNumber) { elements.fAuthNumber.value = ''; elements.fAuthNumber.style.borderColor = ''; }
            _autoFillTimer = setTimeout(async () => {
                syncEscaleFromFlightNumber();   // règle d'escale (même si numéro court)
                await autoFillFromFlightNumber(fv.value.trim());
                await autoFillAuth();
            }, 600);
        });
    }
})();

// Auto-fill From/To + filtrer le select À selon compagnie + type
// NKC (GQNO) est toujours la BASE
function updateRouteByType() {
    const company  = elements.fCompany ? elements.fCompany.value : '';
    const type     = elements.fType    ? elements.fType.value    : 'DEP';
    const NKC_ICAO = 'GQNO';

    // Aucune compagnie choisie → ne rien pré-remplir (modal vierge)
    if (!company) {
        if (elements.fFrom) elements.fFrom.value = '';
        if (elements.fTo)   elements.fTo.value   = '';
        return;
    }

    // Lire hub depuis adminConfig Firebase (pour pré-sélection du trajet).
    // NOTE : plus aucun filtrage des destinations par compagnie — toutes
    // les destinations sont disponibles pour toutes les compagnies.
    let homeCode = COMPANY_HOME_AIRPORT[company] || ''; // fallback hardcodé
    let multiDests = null; // <- plus de restriction par compagnie
    if (adminConfig && adminConfig.airlines) {
        const al = adminConfig.airlines.find(a => a.name === company);
        if (al && al.hub) homeCode = al.hub; // hub depuis Firebase (pré-sélection)
    }

    // Rebuild the fTo select options filtered for this company
    const rebuildToSelect = (allowedCodes) => {
        if (!elements.fTo) return;
        const currentVal = elements.fTo.value;
        // Clear and repopulate
        elements.fTo.innerHTML = '';
        const allDests = (adminConfig && adminConfig.airports && adminConfig.airports.length)
            ? adminConfig.airports.map(a => ({ code: a.icao, name: a.name }))
            : DESTINATIONS;
        allDests.forEach(dest => {
            if (allowedCodes && !allowedCodes.includes(dest.code)) return;
            const opt = document.createElement('option');
            opt.value = dest.code;
            opt.textContent = dest.code + ' – ' + dest.name;
            elements.fTo.appendChild(opt);
        });
        // Restore selection if still valid, else pick first
        if (currentVal && [...elements.fTo.options].some(o => o.value === currentVal)) {
            elements.fTo.value = currentVal;
        } else if (elements.fTo.options.length > 0) {
            elements.fTo.value = elements.fTo.options[0].value;
        }
    };

    // Rebuild the fFrom select options filtered for this company
    const rebuildFromSelect = (allowedCodes) => {
        if (!elements.fFrom) return;
        const currentVal = elements.fFrom.value;
        elements.fFrom.innerHTML = '';
        const allDests = (adminConfig && adminConfig.airports && adminConfig.airports.length)
            ? adminConfig.airports.map(a => ({ code: a.icao, name: a.name }))
            : DESTINATIONS;
        allDests.forEach(dest => {
            if (allowedCodes && !allowedCodes.includes(dest.code)) return;
            const opt = document.createElement('option');
            opt.value = dest.code;
            opt.textContent = dest.code + ' – ' + dest.name;
            elements.fFrom.appendChild(opt);
        });
        if (currentVal && [...elements.fFrom.options].some(o => o.value === currentVal)) {
            elements.fFrom.value = currentVal;
        } else if (elements.fFrom.options.length > 0) {
            elements.fFrom.value = elements.fFrom.options[0].value;
        }
    };

    if (type === 'DEP') {
        // De = NKC (fixe), À = destinations de la compagnie
        if (elements.fFrom) {
            // fFrom = toutes destinations (NKC sera sélectionné)
            rebuildFromSelect(null);
            elements.fFrom.value = NKC_ICAO;
        }
        if (multiDests) {
            // Mauritania Airlines: À = ses destinations uniquement
            rebuildToSelect(multiDests);
        } else {
            rebuildToSelect(null);
            if (elements.fTo && homeCode) elements.fTo.value = homeCode;
        }
    } else if (type === 'ARR') {
        // À = NKC (fixe), De = aéroport d'origine de la compagnie
        if (elements.fTo) {
            rebuildToSelect(null);
            elements.fTo.value = NKC_ICAO;
        }
        if (multiDests) {
            // Mauritania Airlines: De = ses destinations uniquement
            rebuildFromSelect(multiDests);
        } else {
            rebuildFromSelect(null);
            if (elements.fFrom && homeCode) elements.fFrom.value = homeCode;
        }
    }
}

function updateImmField(company) {
    if (!adminConfig || !adminConfig.airlines) return;
    
    const airlineData = adminConfig.airlines.find(a => a.name === company);
    if (!airlineData) return;
    
    const fImm = elements.fImm;
    const parent = fImm.parentNode;
    
    // Remove existing select if any
    const existingSelect = parent.querySelector('#fImmSelect');
    if (existingSelect) existingSelect.remove();
    
    const immatList = airlineData.immatriculations || [];
    const isLocked  = airlineData.immLocked;
    
    if (isLocked && immatList.length > 0) {
        // Replace text input with select
        fImm.style.display = 'none';
        
        const sel = document.createElement('select');
        sel.id = 'fImmSelect';
        sel.required = true;
        sel.className = fImm.className;
        sel.style.cssText = fImm.style.cssText;
        sel.style.display = '';
        
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '— Choisir une immatriculation —';
        sel.appendChild(defaultOpt);
        
        immatList.forEach(imm => {
            const opt = document.createElement('option');
            opt.value = imm;
            opt.textContent = imm;
            if (fImm.value === imm) opt.selected = true;
            sel.appendChild(opt);
        });
        // Immatriculation actuelle absente de la liste (ex: variante avec tiret
        // 5T-CLJ vs 5TCLJ) : l'ajouter pour qu'elle s'affiche et se sauvegarde.
        if (fImm.value && ![...sel.options].some(o => o.value === fImm.value)) {
            const opt = document.createElement('option');
            opt.value = fImm.value;
            opt.textContent = fImm.value;
            opt.selected = true;
            sel.appendChild(opt);
        }
        
        parent.insertBefore(sel, fImm.nextSibling);
        
        // Sync select value back to hidden input on change
        sel.addEventListener('change', () => { fImm.value = sel.value; });
        if (fImm.value) sel.value = fImm.value;
        
    } else {
        // Show text input (free mode)
        fImm.style.display = '';
        const hint = parent.querySelector('.imm-hint');
        if (hint) hint.remove();
        
        // Add prefix hint if available
        if (airlineData.immPrefix) {
            let hintEl = parent.querySelector('.imm-hint');
            if (!hintEl) {
                hintEl = document.createElement('small');
                hintEl.className = 'field-hint imm-hint';
                parent.appendChild(hintEl);
            }
            hintEl.textContent = '';
        }
    }
}

function handleAuthNumberInput(event) {
    let value = event.target.value.toUpperCase();
    // Garder uniquement majuscules, chiffres et tiret
    value = value.replace(/[^A-Z0-9-]/g, '');
    // Auto-insérer tiret après SNA+2chiffres si absent
    if (/^SNA\d{2}$/.test(value)) {
        value = value + '-';
    }
    event.target.value = value;
}

function validateAuthNumber(authNumber) {
    // Format: SNA + 2 chiffres (année) + séparateur + numéro
    // Accepte: SNA25-0001, SNA26-0042, SNA27-0001 etc.
    const pattern = /^SNA\d{2}[-/]\d{1,4}$/;
    return pattern.test(authNumber);
}



// ============================================
// FLIGHT OPERATIONS
// ============================================
async function addFlight(flightData) {
    try {
        elements.flightForm.classList.add('loading');
        
        // Add to Firebase through firebase.js
        if (window.dbService && window.dbService.addFlight) {
            await window.dbService.addFlight(flightData);
        } else {
            throw new Error('Service de base de données non disponible');
        }
        
        closeModal();
        showNotification('Vol ajouté avec succès', 'success');
        // Journal d'activité
        if (window.ANAC_AUTH) {
          window.ANAC_AUTH.logActivity('add_flight', flightData.authorizationNumber || flightData.flightNumber || '',
            'Vol ' + (flightData.flightNumber||'') + ' · ' + (flightData.company||'') + ' · ' + (flightData.date||''));
        }
    } catch (error) {
        console.error('Error adding flight:', error);
        showNotification('Erreur lors de l\'ajout du vol', 'error');
    } finally {
        elements.flightForm.classList.remove('loading');
    }
}

async function updateFlight(flightId, flightData) {
    
    try {
        elements.flightForm.classList.add('loading');
        
        // Ensure flightId is a string
        const validFlightId = String(flightId);
        
        // Update in Firebase through firebase.js
        if (window.dbService && window.dbService.updateFlight) {
            await window.dbService.updateFlight(validFlightId, flightData);
        } else {
            throw new Error('Service de base de données non disponible');
        }

        // ── Synchroniser l'archive LDM/MVT correspondante ──
        _syncArchiveFromFlight(flightData).catch(e => console.warn('Archive sync:', e));

        closeModal();
        showNotification('Vol modifié avec succès', 'success');
        // Journal d'activité
        if (window.ANAC_AUTH) {
          window.ANAC_AUTH.logActivity('edit_flight', flightData.authorizationNumber || flightData.flightNumber || '',
            'Vol ' + (flightData.flightNumber||'') + ' · ' + (flightData.company||'') + ' · ' + (flightData.date||''));
        }
    } catch (error) {
        console.error('Error updating flight:', error);
        showNotification('Erreur lors de la modification du vol', 'error');
    } finally {
        elements.flightForm.classList.remove('loading');
    }
}

async function deleteFlight(flightId) {
    if (window._hasPerm && !window._hasPerm('delete_flight')) {
        showNotification('Accès refusé — permission insuffisante pour supprimer un vol', 'error');
        return false;
    }
    
    // Si _hasPerm est actif, l'authentification est déjà validée — pas besoin du mot de passe
    const doDelete = async () => {
        try {
            const flight = flights.find(f => f.id === flightId);
            if (!flight) {
                return false;
            }

            // Store for undo
            lastDeletedFlight = { flight, id: flightId };
            // Journal d'activité
            if (window.ANAC_AUTH) {
              window.ANAC_AUTH.logActivity('delete_flight', flight.authorizationNumber || flight.flightNumber || '',
                'Vol ' + (flight.flightNumber||'') + ' · ' + (flight.company||'') + ' · ' + (flight.date||''));
            }

            if (window.dbService && window.dbService.deleteFlight) {
                try {
                    await window.dbService.deleteFlight(flightId);

                    flights = flights.filter(f => f.id !== flightId);
                    render();
                    showUndoButton();
                    showNotification('Vol supprimé', 'warning');
                    return true;
                } catch (firebaseError) {
                    console.error('Firebase delete error:', firebaseError);
                    showNotification('Erreur Firebase: ' + firebaseError.message, 'error');
                    return false;
                }
            } else {
                showNotification('Service de base de données non disponible', 'error');
                return false;
            }
        } catch (error) {
            console.error('Error deleting flight:', error);
            showNotification('Erreur lors de la suppression du vol', 'error');
            return false;
        }
    };

    let success;
    success = await doDelete();

    return success;
}

async function undoDelete() {
    if (!lastDeletedFlight) return;
    
    try {
        // Restore to Firebase
        if (window.dbService && window.dbService.addFlight) {
            await window.dbService.addFlight(lastDeletedFlight.flight);
        }
        
        hideUndoButton();
        lastDeletedFlight = null;
        showNotification('Suppression annulée', 'success');
    } catch (error) {
        console.error('Error undoing delete:', error);
        showNotification('Erreur lors de l\'annulation de la suppression', 'error');
    }
}

function showUndoButton() {
    elements.undoBtn.style.display = 'inline-block';
    
    if (undoTimeout) {
        clearTimeout(undoTimeout);
    }
    
    undoTimeout = setTimeout(() => {
        hideUndoButton();
        lastDeletedFlight = null;
    }, 10000); // 10 seconds
}

function hideUndoButton() {
    elements.undoBtn.style.display = 'none';
    
    if (undoTimeout) {
        clearTimeout(undoTimeout);
        undoTimeout = null;
    }
}

// ============================================
// FILTER FUNCTIONS
// ============================================
function handleFilterChange() {
    if (window._resetPage) window._resetPage();
    render();
}

function handleTypeFilter(button) {
    currentTypeFilter = button.dataset.type;

    elements.typeButtons.forEach(btn => btn.classList.remove('btn-active'));
    button.classList.add('btn-active');

    if (window._resetPage) window._resetPage();
    render();
}

function resetFilters() {
    if (elements.yearSelect) elements.yearSelect.value = String(new Date().getFullYear());
    elements.monthSelect.value = 'ALL';
    elements.companySelect.value = 'ALL';
    elements.fromSelect.value = 'ALL';
    elements.toSelect.value = 'ALL';
    elements.searchFrom.value = '';
    elements.searchTo.value = '';
    elements.searchImm.value = '';
    elements.searchVol.value = '';
    currentTypeFilter = 'ALL';

    // Reset active button
    elements.typeButtons.forEach(btn => btn.classList.remove('btn-active'));
    document.querySelectorAll('[data-type="ALL"]').forEach(b => b.classList.add('btn-active'));

    if (window._resetPage) window._resetPage();
    render();
    if (window._renderChips) window._renderChips();
    showNotification('Filtres réinitialisés', 'success');
}

function filterFlights(dateOverride) {
    const monthFilter = elements.monthSelect.value;
    const companyFilter = elements.companySelect.value;
    const fromFilter = elements.fromSelect.value;
    const toFilter = elements.toSelect.value;
    const dateFrom = elements.searchFrom.value;
    const dateTo = elements.searchTo.value;
    // Normalisation : 5TCLC == 5T-CLC == 5T CLC (tirets/espaces/points ignorés).
    const immFilter = elements.searchImm.value.toUpperCase().replace(/[\s.\-]/g,'').trim();
    const volFilter = elements.searchVol.value.toUpperCase().trim();
    
    const yearFilter = (elements.yearSelect && elements.yearSelect.value) || 'ALL';

    const _filtered = flights.filter(flight => {
        const flightDate = new Date(flight.date);

        // Fenêtre de dates : soit une plage explicite (dateOverride, utilisée pour
        // apparier les rotations à cheval sur deux mois), soit les filtres année/mois.
        if (dateOverride) {
            if (flight.date < dateOverride.from || flight.date > dateOverride.to) return false;
        } else {
            // Year filter
            if (yearFilter !== 'ALL' && flightDate.getFullYear() !== parseInt(yearFilter)) {
                return false;
            }
            // Month filter
            if (monthFilter !== 'ALL' && flightDate.getMonth() !== parseInt(monthFilter)) {
                return false;
            }
        }

        // Company filter
        if (companyFilter !== 'ALL' && flight.company !== companyFilter) {
            return false;
        }
        
        // Filtre De / Vers — par TRONÇON (segment), escales incluses.
        // Un vol NKC→NDB→OUZ contient les tronçons NKC→NDB et NDB→OUZ :
        // il est trouvé aussi bien par "De: NDB / Vers: OUZ" que par la route complète.
        if (fromFilter !== 'ALL' || toFilter !== 'ALL') {
            const _st = (flight.hasStopover || flight.stopover) ? flight.stopover : '';
            // Route complète + sous-segments (si escale).
            const legs = _st
                ? [[flight.from, flight.to], [flight.from, _st], [_st, flight.to]]
                : [[flight.from, flight.to]];
            let _ok;
            if (fromFilter !== 'ALL' && toFilter !== 'ALL') {
                _ok = legs.some(l => l[0] === fromFilter && l[1] === toFilter);   // tronçon exact
            } else if (fromFilter !== 'ALL') {
                _ok = legs.some(l => l[0] === fromFilter);                        // départ d'un tronçon
            } else {
                _ok = legs.some(l => l[1] === toFilter);                         // arrivée d'un tronçon
            }
            if (!_ok) return false;
        }
        
        // Date range filter (ignoré si une fenêtre explicite est fournie)
        if (!dateOverride) {
            if (dateFrom && flight.date < dateFrom) return false;
            if (dateTo && flight.date > dateTo) return false;
        }

        // Type filter
        if (currentTypeFilter !== 'ALL' && flight.type !== currentTypeFilter) {
            return false;
        }
        
        // Registration filter (case-insensitive)
        if (immFilter && !(flight.registration||'').toUpperCase().replace(/[\s.\-]/g,'').includes(immFilter)) {
            return false;
        }
        
        // Flight number filter (case-insensitive)
        if (volFilter && !normFN(flight.flightNumber).includes(normFN(volFilter))) {
            return false;
        }

        return true;
    });

    // Fenêtre explicite (appariement rotations) → vols bruts, sans découpage tronçon.
    if (dateOverride) return _filtered;

    // ── Mode TRONÇON : dès qu'un aéroport (De et/ou Vers) est précisé, on n'affiche
    // que le(s) segment(s) demandé(s), avec LEURS propres PAX/bébés (pas ceux du vol
    // complet). generateFlightLines fournit le découpage par segment (vols MAI à
    // escale) ; pour un vol direct, le segment = le vol lui-même.
    // EXCEPTION : une recherche par NUMÉRO DE VOL montre toujours le vol COMPLET
    // (le total), même si un filtre De/Vers est encore actif → pas de découpage.
    if (!volFilter && (fromFilter !== 'ALL' || toFilter !== 'ALL') && typeof generateFlightLines === 'function') {
        const _seg = (l) =>
            (fromFilter === 'ALL' || l.from === fromFilter) &&
            (toFilter   === 'ALL' || l.to   === toFilter);
        const _mk = (from, to, pax, bab, f) => Object.assign({}, f, {
            from, to,
            passengers: Number(pax) || 0,
            babies: Number(bab) || 0,
            // Le segment s'affiche comme un trajet simple (pas de re-découpage).
            hasStopover: false, stopover: '',
            stopoverPax: 0, stopoverBabies: 0, midLegPax: 0, midLegBabies: 0,
            _troncon: true
        });
        const segs = [];
        _filtered.forEach(f => {
            let lines;
            try { lines = generateFlightLines(f); } catch(e) { lines = null; }
            let matched = false;
            (lines || []).forEach(l => {
                if (_seg(l)) { matched = true; segs.push(_mk(l.from, l.to, l.passengers, l.babies, f)); }
            });
            // Repli : le vol correspond au filtre mais n'est pas décomposé
            // (vol direct, ou compagnie non-MAI) → afficher le tronçon avec les PAX du vol.
            if (!matched) {
                segs.push(_mk(
                    fromFilter !== 'ALL' ? fromFilter : f.from,
                    toFilter   !== 'ALL' ? toFilter   : f.to,
                    f.passengers, f.babies, f
                ));
            }
        });
        return segs;
    }

    return _filtered;
}

// ============================================
// MOTEUR DE ROTATIONS (accueil) — identique au suivi.
// Une rotation = départ + arrivée appariés par (compagnie, destination) et même
// immatriculation. Ancre : DÉPART pour Mauritania Airlines, ARRIVÉE pour les
// autres compagnies. Tri : par DATE puis N° de vol (pas de priorité MAI).
// ============================================
function _hIsNKC(c){ const u=(c||'').toUpperCase().trim(); return u==='NKC'||u==='GQNO'||u==='GQNN'||icaoToIATA(c)==='NKC'; }
function _hNormReg(r){ return (r||'').toUpperCase().replace(/[\s.\-]/g,''); }
function _hFnCode(f){ return String((f&&f.flightNumber)||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function _hIsFN(f,code){ return _hFnCode(f)===code; }
// Ville de destination (IATA) servant à apparier. Règle exceptionnelle Las Palmas :
// L6014/L6220/L6221 rattachés à LPA (comme le suivi).
function _hDestCity(f){
  if(_hIsFN(f,'L6014')||_hIsFN(f,'L6220')||_hIsFN(f,'L6221')) return 'LPA';
  const fr=f.from, to=f.to;
  if(_hIsNKC(fr)) return icaoToIATA(to);
  if(_hIsNKC(to)) return icaoToIATA(fr);
  return icaoToIATA(to)||icaoToIATA(fr);
}
function _hDayDiff(a,b){ const da=new Date((a||'')+'T00:00:00'), db=new Date((b||'')+'T00:00:00'); if(isNaN(da)||isNaN(db)) return 999; return Math.round((db-da)/86400000); }

// Rotation exceptionnelle Las Palmas : L6014 (NKC-NDB) + L6220 (NDB-LPA) au départ,
// L6221 (LPA-NDB-NKC) à l'arrivée.
function _hBuildLPARotations(flights, coU, byDate){
  const co=f=> !coU || (f.company||'').toUpperCase()===coU;
  const f20=flights.filter(f=>co(f)&&_hIsFN(f,'L6220')).sort(byDate);
  const f14=flights.filter(f=>co(f)&&_hIsFN(f,'L6014')).sort(byDate);
  const f21=flights.filter(f=>co(f)&&_hIsFN(f,'L6221')).sort(byDate);
  const u14=new Set(), u21=new Set(), out=[];
  const take=(arr,used,reg,fromDate,maxDiff)=>{ let best=-1;
    arr.forEach((c,i)=>{ if(used.has(i)||_hNormReg(c.registration)!==reg) return; const dd=_hDayDiff(fromDate,c.date); if(dd<0||dd>maxDiff) return; if(best<0||c.date<arr[best].date) best=i; });
    return best; };
  f20.forEach(f=>{
    const reg=_hNormReg(f.registration);
    const i14=take(f14,u14,reg,f.date,0); let feeder=null; if(i14>=0){feeder=f14[i14];u14.add(i14);}
    const i21=take(f21,u21,reg,f.date,1); let arr=null; if(i21>=0){arr=f21[i21];u21.add(i21);}
    const legs=[], roles=[];
    if(feeder){ legs.push(feeder); roles.push('dep'); }
    legs.push(f); roles.push('dep');
    if(arr){ legs.push(arr); roles.push('arr'); }
    const anchor=feeder?feeder.date:f.date;
    out.push({ legs, roles, anchor, jLeg:(arr&&arr.date>anchor)?'arr':null });
  });
  f21.forEach((a,i)=>{ if(u21.has(i)) return; out.push({ legs:[a], roles:['arr'], anchor:a.date, jLeg:null }); });
  return out;
}

function _hBuildRotations(flights, companyName, destIATA){
  const coU=(companyName||'').toUpperCase();
  const rel=flights.filter(f=> (!coU || (f.company||'').toUpperCase()===coU) && _hDestCity(f)===destIATA);
  const byDate=(a,b)=> String(a.date).localeCompare(String(b.date));
  const mai=isMAIcompany(companyName);
  const rotations=[], consumed=new Set();
  if(destIATA==='LPA'){
    _hBuildLPARotations(flights, coU, byDate).forEach(r=>{ rotations.push(r); r.legs.forEach(f=>consumed.add(f)); });
  }
  const deps=rel.filter(f=>!consumed.has(f) && _hIsNKC(f.from)).sort(byDate);
  const arrs=rel.filter(f=>!consumed.has(f) && _hIsNKC(f.to)).sort(byDate);
  const usedD=new Set(), usedA=new Set();
  const match=(cands,used,reg,fromDate)=>{ let best=-1;
    cands.forEach((c,i)=>{ if(used.has(i)||_hNormReg(c.registration)!==reg) return; const dd=_hDayDiff(fromDate,c.date); if(dd<0||dd>1) return; if(best<0||c.date<cands[best].date) best=i; });
    return best; };
  if(mai){
    deps.forEach(d=>{ const mi=match(arrs,usedA,_hNormReg(d.registration),d.date); let a=null; if(mi>=0){a=arrs[mi];usedA.add(mi);}
      rotations.push({dep:d,arr:a,order:['dep','arr'],jLeg:(a&&a.date>d.date)?'arr':null,anchor:d.date}); });
    arrs.forEach((a,i)=>{ if(!usedA.has(i)) rotations.push({dep:null,arr:a,order:['dep','arr'],jLeg:null,anchor:a.date}); });
  } else {
    arrs.forEach(a=>{ const mi=match(deps,usedD,_hNormReg(a.registration),a.date); let d=null; if(mi>=0){d=deps[mi];usedD.add(mi);}
      rotations.push({dep:d,arr:a,order:['arr','dep'],jLeg:(d&&d.date>a.date)?'dep':null,anchor:a.date}); });
    deps.forEach((d,i)=>{ if(!usedD.has(i)) rotations.push({dep:d,arr:null,order:['arr','dep'],jLeg:null,anchor:d.date}); });
  }
  return rotations;
}

function _hRotLegs(r){
  if(r.legs) return r.legs.map((f,i)=>({f, role:(r.roles&&r.roles[i])||'dep'})).filter(x=>x.f);
  return r.order.map(k=>({f:(k==='dep'?r.dep:r.arr), role:k})).filter(x=>x.f);
}
function _hRotFirstFlight(r){ const l=_hRotLegs(r)[0]; return l?l.f:null; }

// Toutes les rotations d'un lot de vols. Regroupe par (compagnie, destination),
// apparie, puis rattache les vols orphelins en rotation solo (rien n'est caché).
function _hBuildAllRotations(flights){
  const groups=new Map();
  flights.forEach(f=>{
    const c=_hDestCity(f); if(!c||c==='NKC') return;
    const key=(f.company||'')+'||'+c;
    let g=groups.get(key); if(!g){ g={company:f.company||'',dest:c,flights:[]}; groups.set(key,g); }
    g.flights.push(f);
  });
  let rotations=[];
  groups.forEach(g=>{ rotations=rotations.concat(_hBuildRotations(g.flights, g.company, g.dest)); });
  const used=new Set();
  rotations.forEach(r=>_hRotLegs(r).forEach(x=>used.add(x.f)));
  flights.forEach(f=>{ if(!used.has(f)) rotations.push({ legs:[f], roles:[_hIsNKC(f.from)?'dep':'arr'], anchor:f.date||'', jLeg:null }); });
  rotations.sort((a,b)=>{
    const d=String(a.anchor).localeCompare(String(b.anchor)); if(d) return d;
    const fa=_hRotFirstFlight(a), fb=_hRotFirstFlight(b);
    return String((fa&&fa.flightNumber)||'').localeCompare(String((fb&&fb.flightNumber)||''));
  });
  return rotations;
}

// Rendu du tableau d'accueil en ROTATIONS. Cellules fusionnées par rotation :
// N° · Date (si toutes les jambes le même jour) · Compagnie · Immatriculation.
// Par vol : N° d'autorisation · N° de vol · Type · Actions. Par tronçon : Trajet,
// PAX, Bébés (sous-tronçons d'escale en jaune foncé).
function renderRotationTable(rotations, rotOffset){
  const body = elements.flightTableBody;
  body.innerHTML='';
  if(!rotations.length){
    body.innerHTML = `<tr><td colspan="11" class="empty-state"><p>Aucun vol trouvé</p><small>Ajoutez un vol ou modifiez vos filtres</small></td></tr>`;
    return;
  }
  rotations.forEach((rot, ri)=>{
    const parity = ri % 2;
    const rotNum = rotOffset + ri + 1;
    const legs = _hRotLegs(rot);
    const legLines = legs.map(({f})=> (typeof generateFlightLines==='function' ? generateFlightLines(f) : [{from:f.from,to:f.to,passengers:f.passengers,babies:f.babies}]));
    const rotRows = legLines.reduce((s,ls)=>s+ls.length,0);
    const dates = legs.map(({f})=>f.date);
    const sameDate = dates.every(d=>d===dates[0]);
    let physIdx = 0;
    legs.forEach(({f}, li)=>{
      const lines = legLines[li];
      const flCount = lines.length;
      const totals = flCount>1 ? {
        totalPax: lines.reduce((s,l)=>s+(Number(l.passengers)||0),0),
        totalBab: lines.reduce((s,l)=>s+(Number(l.babies)||0),0)
      } : null;
      lines.forEach((line, lj)=>{
        const isFlightMain = (lj===0);
        const isRotFirst = (physIdx===0);
        const merge = {
          num:  isRotFirst ? {show:true, span:rotRows, value:rotNum} : {show:false},
          co:   isRotFirst ? {show:true, span:rotRows} : {show:false},
          imm:  isRotFirst ? {show:true, span:rotRows} : {show:false},
          date: sameDate
                ? (isRotFirst ? {show:true, span:rotRows} : {show:false})
                : (isFlightMain ? {show:true, span:flCount} : {show:false}),
          rotStart: isRotFirst
        };
        body.appendChild(createRotationRow(f, line, lj, flCount, merge, (isFlightMain?totals:null), parity));
        physIdx++;
      });
    });
  });
}

// Une ligne physique d'une rotation. merge = {num,date,co,imm,rotStart} contrôle
// les cellules fusionnées ; les cellules par vol (Auth, N° vol, Type, Actions)
// portent rowspan = nombre de tronçons du vol, émises sur sa ligne principale.
function createRotationRow(f, line, lj, flightLines, merge, escaleTotals, parity){
  const row=document.createElement('tr');
  if(f && f.id) row.setAttribute('data-flight-id', f.id);
  row.style.background = parity===1 ? '#edf3fb' : '#ffffff';
  if(f && f.isCharter) row.style.background='#fce4ec';
  const isFlightMain = (lj===0);
  if(merge.rotStart && isFlightMain) row.style.borderTop='2px solid #b9c9de';
  else if(isFlightMain) row.style.borderTop='1px solid #e5edf6';

  const isSub = lj>0;
  const typeText = f.type==='DEP' ? 'Départ' : 'Arrivée';
  const typeClass = f.type==='DEP' ? 'type-depart':'type-arrivee';
  const fromCode = icaoToIATA(line?line.from:f.from) || '–';
  const toCode   = icaoToIATA(line?line.to:f.to)     || '–';
  const pax = line ? line.passengers : f.passengers;
  const bab = line ? line.babies     : f.babies;
  const vmid = 'vertical-align:middle;';

  let html='';
  if(merge.num.show)  html += `<td rowspan="${merge.num.span}" style="color:#94a3b8;font-weight:700;text-align:center;width:44px;${vmid}">${merge.num.value}</td>`;
  if(isFlightMain)    html += `<td rowspan="${flightLines}" style="${vmid}"><strong>${escapeHtml(f.authorizationNumber||'N/A')}</strong></td>`;
  if(merge.date.show) html += `<td rowspan="${merge.date.span}" style="${vmid}">${formatDateEU(f.date)}</td>`;
  if(merge.co.show)   html += `<td rowspan="${merge.co.span}" style="${vmid}">${escapeHtml(f.company)}</td>`;
  if(merge.imm.show)  html += `<td rowspan="${merge.imm.span}" style="${vmid}"><strong>${escapeHtml(f.registration)}</strong></td>`;
  if(isFlightMain)    html += `<td rowspan="${flightLines}" style="${vmid}">${escapeHtml(f.flightNumber)}</td>`;
  const yellow = isSub ? 'background:#f4c430;' : '';
  const rColor = isSub ? '#3a2c00' : '#0f1e3d';
  const aColor = isSub ? '#7a4f01' : '#D4AF37';
  html += `<td style="text-align:center;white-space:nowrap;${yellow}"><strong style="color:${rColor};">${escapeHtml(fromCode)}</strong> <span style="color:${aColor};font-weight:700;margin:0 4px;">→</span> <strong style="color:${rColor};">${escapeHtml(toCode)}</strong></td>`;
  if(isFlightMain)    html += `<td rowspan="${flightLines}" style="${vmid}"><span class="type-badge ${typeClass}">${typeText}</span></td>`;
  html += `<td style="${isSub?'font-weight:700;color:#3a2c00;'+yellow:''}">${pax}</td>`;
  html += `<td style="${isSub?'font-weight:700;color:#3a2c00;':''}">${bab}</td>`;
  if(isFlightMain){
    const totBox = escaleTotals ? `<div style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;background:#0f1e3d;color:#D4AF37;border-radius:8px;padding:4px 10px;font-weight:700;"><span style="font-size:9px;letter-spacing:.04em;opacity:.85;">TOTAL PAX</span><span style="font-size:15px;" id="tot-${f.id}">${escaleTotals.totalPax}</span></div>` : '';
    html += `<td class="actions-cell" rowspan="${flightLines}" style="${vmid}">${totBox}<div class="actions-wrapper" style="${escaleTotals?'margin-left:6px;':''}"><button class="actions-btn" onclick="app.toggleActionsMenu(event, '${f.id}')" aria-label="Actions">⋯</button><div class="actions-menu" id="actions-${f.id}"><button data-perm="edit_flight" onclick="event.stopPropagation(); app.editFlight('${f.id}')" class="action-item"><span class="action-icon">✎</span><span>Modifier</span></button><button data-perm="delete_flight" onclick="event.stopPropagation(); app.deleteFlight('${f.id}')" class="action-item action-delete"><span class="action-icon">✕</span><span>Supprimer</span></button></div></div></td>`;
  }
  row.innerHTML = html;
  return row;
}

// Plage de dates active (YYYY-MM-DD) déduite des filtres, ou null si aucun.
function _hFmtYMD(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0'); return y+'-'+m+'-'+da; }
function _hAddDays(ymd, n){ const d=new Date(ymd+'T00:00:00'); if(isNaN(d)) return ymd; d.setDate(d.getDate()+n); return _hFmtYMD(d); }
function _homeDateRange(){
  const df=elements.searchFrom.value, dt=elements.searchTo.value;
  if(df && dt) return {from:df, to:dt};
  const y=(elements.yearSelect && elements.yearSelect.value) || 'ALL';
  const m=elements.monthSelect.value;
  if(m!=='ALL' && y!=='ALL'){ const yr=parseInt(y),mo=parseInt(m); return {from:_hFmtYMD(new Date(yr,mo,1)), to:_hFmtYMD(new Date(yr,mo+1,0))}; }
  if(m==='ALL' && y!=='ALL'){ return {from:y+'-01-01', to:y+'-12-31'}; }
  return null;
}

// ============================================
// RENDER FUNCTIONS
// ============================================
// Variables globales pour la pagination (PAR ROTATION)
window._currentPage = window._currentPage || 'LAST';   // ouvrir sur la dernière page par défaut
window._pageSize    = 40;

function render() {
    const filteredFlights = filterFlights();

    const getAuthNum = (auth) => {
        if (!auth) return 0;
        const m = auth.match(/(\d+)$/);
        return m ? parseInt(m[1]) : 0;
    };

    // Tri TOUJOURS identique (avec ou sans filtre, toutes pages) :
    //   1) date croissante  2) compagnie  3) N° d'autorisation croissant
    filteredFlights.sort((a, b) => {
        const dA = a.date || '';
        const dB = b.date || '';
        if (dA !== dB) return dA < dB ? -1 : 1;
        const cA = (a.company || '').toLowerCase();
        const cB = (b.company || '').toLowerCase();
        if (cA !== cB) return cA < cB ? -1 : 1;
        return getAuthNum(a.authorizationNumber) - getAuthNum(b.authorizationNumber);
    });

    // ── Mode d'affichage des Charter Flights (Séparés / Mélangés / Charters seuls) ──
    const modeEl = document.getElementById('charterViewMode');
    const mode = modeEl ? modeEl.value : 'sep';
    const charterF = filteredFlights.filter(f => f && f.isCharter);
    const normalF  = filteredFlights.filter(f => !(f && f.isCharter));
    let mainSet;
    if (mode === 'mix') mainSet = filteredFlights;      // tout ensemble
    else if (mode === 'only') mainSet = charterF;       // charters seuls
    else mainSet = normalF;                             // 'sep' (défaut) : charters à part

    // Mémoriser la liste des vols affichés (export Excel de l'accueil).
    window._filteredSorted = mainSet;

    // ── Regroupement en ROTATIONS + pagination PAR ROTATION ──
    // Les vols sont appariés (départ + arrivée) comme dans le suivi ; on ne coupe
    // jamais une paire entre deux pages. Pour ne pas séparer une rotation à cheval
    // sur deux mois (arrivée un mois, départ le mois suivant, compagnies étrangères),
    // on apparie sur une fenêtre élargie de ±2 jours puis on n'affiche que les
    // rotations ANCRÉES dans la plage (arrivée pour les étrangères, départ pour MAI).
    const _range = _homeDateRange();
    const _tronc = (elements.fromSelect.value!=='ALL' || elements.toSelect.value!=='ALL') && !elements.searchVol.value.trim();
    let rotations;
    if (_range && !_tronc) {
        const buffered = filterFlights({ from: _hAddDays(_range.from,-2), to: _hAddDays(_range.to,2) });
        rotations = _hBuildAllRotations(buffered)
            .filter(r => String(r.anchor) >= _range.from && String(r.anchor) <= _range.to);
    } else {
        rotations = _hBuildAllRotations(mainSet);
    }
    window._rotationsSorted = rotations;

    const totalPages = Math.max(1, Math.ceil(rotations.length / window._pageSize));
    // 'LAST' = ouvrir sur la dernière page (les rotations les plus récentes).
    if (window._currentPage === 'LAST') window._currentPage = totalPages;
    if (window._currentPage > totalPages) window._currentPage = totalPages;
    if (!(window._currentPage >= 1)) window._currentPage = 1;

    const rotStart = (window._currentPage - 1) * window._pageSize;
    renderRotationTable(rotations.slice(rotStart, rotStart + window._pageSize), rotStart);
    renderTotals(mainSet);
    renderPaginationControls(rotations.length);

    // Section séparée des Charter Flights (uniquement en mode « Séparés »)
    renderCharterSection(mode === 'sep' ? charterF : []);
}

// Rendu de la section séparée « Charter Flights » (non paginée).
function renderCharterSection(list){
    const sec  = document.getElementById('charterSection');
    const body = document.getElementById('charterTableBody');
    if (!sec || !body) return;
    if (!list || !list.length){ sec.style.display = 'none'; body.innerHTML = ''; return; }
    sec.style.display = '';
    const cnt = document.getElementById('charterCount');
    if (cnt) cnt.textContent = list.length + ' vol' + (list.length > 1 ? 's' : '');
    body.innerHTML = '';
    list.forEach((flight, idx) => {
        const lines = (typeof generateFlightLines === 'function') ? generateFlightLines(flight) : [null];
        const parity = idx % 2;
        if (lines.length <= 1) {
            body.appendChild(createFlightRow(flight, idx + 1, null, 0, 1, null, parity, true));
        } else {
            const totalPax = lines.reduce((s,l)=> s + (Number(l.passengers)||0), 0);
            const totalBab = lines.reduce((s,l)=> s + (Number(l.babies)||0), 0);
            lines.forEach((line, li) => {
                body.appendChild(createFlightRow(flight, li === 0 ? (idx + 1) : null, line, li, lines.length, {totalPax, totalBab}, parity, li === 0));
            });
        }
    });
}

function renderTableWithPagination(filteredFlights) {
    const start = (window._currentPage - 1) * window._pageSize;
    const end   = start + window._pageSize;
    const pageFlights = filteredFlights.slice(start, end);
    renderTable(pageFlights, start); // passer l'offset pour la numérotation
}

function renderPaginationControls(total) {
    let ctr = document.getElementById('flightPagination');
    if (!ctr) {
        // Créer le conteneur sous le tableau s'il n'existe pas
        const table = document.querySelector('.flights-table, .main-container .table-wrapper, #flightTableBody');
        if (!table) return;
        ctr = document.createElement('div');
        ctr.id = 'flightPagination';
        ctr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 18px;margin-top:10px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;font-size:13px;color:#475569;flex-wrap:wrap;box-shadow:0 1px 3px rgba(0,0,0,0.02);';
        // Insérer après le tableau
        const parent = document.getElementById('flightTableBody');
        if (parent && parent.closest('table')) {
            parent.closest('table').parentNode.appendChild(ctr);
        }
    }

    const totalPages = Math.max(1, Math.ceil(total / window._pageSize));
    const cur = window._currentPage;
    const start = total === 0 ? 0 : (cur - 1) * window._pageSize + 1;
    const end   = Math.min(cur * window._pageSize, total);

    const btn = (label, disabled, action) => {
        const bg = disabled ? '#f1f5f9' : 'linear-gradient(135deg,#0f1e3d,#1a3a6b)';
        const col = disabled ? '#94a3b8' : '#D4AF37';
        const bd = disabled ? '#e2e8f0' : 'rgba(212,175,55,0.4)';
        const cursor = disabled ? 'not-allowed' : 'pointer';
        return `<button ${disabled?'disabled':''} onclick="${action}" style="background:${bg};color:${col};border:1px solid ${bd};border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:${cursor};transition:all 0.15s;letter-spacing:0.3px;">${label}</button>`;
    };

    const inner = `
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
            <span style="font-weight:700;color:#0f1e3d;font-size:13px;">
                ${total.toLocaleString()} rotation${total>1?'s':''}
            </span>
            ${total > 0 ? `<span style="color:#64748b;font-size:12px;">Affichage ${start.toLocaleString()}–${end.toLocaleString()}</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
            ${btn('← Précédent', cur<=1, '_goPrevPage()')}
            <span style="padding:7px 16px;background:linear-gradient(135deg,#0f1e3d,#1a3a6b);color:#D4AF37;border:1px solid rgba(212,175,55,0.4);border-radius:8px;font-weight:700;min-width:100px;text-align:center;letter-spacing:0.3px;font-size:12px;">
                Page ${cur} / ${totalPages}
            </span>
            ${btn('Suivant →', cur>=totalPages, '_goNextPage()')}
        </div>
    `;
    ctr.innerHTML = inner;
    // Miroir en haut de page (mêmes boutons, même état).
    const topCtr = document.getElementById('flightPaginationTop');
    if (topCtr) topCtr.innerHTML = inner;
}

window._goPrevPage = function() {
    if (window._currentPage > 1) {
        window._currentPage--;
        render();
        var _ft=document.querySelector('.flights-table'); window.scrollTo({top: _ft ? (_ft.getBoundingClientRect().top + window.scrollY - 80) : 0, behavior:'smooth'});
    }
};
window._goNextPage = function() {
    const total = (window._rotationsSorted || []).length;
    const totalPages = Math.max(1, Math.ceil(total / window._pageSize));
    if (window._currentPage < totalPages) {
        window._currentPage++;
        render();
        var _ft=document.querySelector('.flights-table'); window.scrollTo({top: _ft ? (_ft.getBoundingClientRect().top + window.scrollY - 80) : 0, behavior:'smooth'});
    }
};

// Reset à la page 1 quand un filtre change
window._resetPage = function() { window._currentPage = 'LAST'; };   // filtre → revenir à la dernière page

function renderTable(filteredFlights, offset) {
    elements.flightTableBody.innerHTML = '';
    offset = offset || 0;

    if (filteredFlights.length === 0) {
        elements.flightTableBody.innerHTML = `
            <tr>
                <td colspan="11" class="empty-state">
                    <p>Aucun vol trouvé</p>
                    <small>Ajoutez un vol ou modifiez vos filtres</small>
                </td>
            </tr>
        `;
        return;
    }

    filteredFlights.forEach((flight, idx) => {
        const lines = (typeof generateFlightLines === 'function') ? generateFlightLines(flight) : [null];
        // Couleur alternée PAR VOL : le vol et ses lignes d'escale partagent la même teinte.
        const parity = idx % 2;   // 0 = blanc, 1 = bleu très clair
        if (lines.length <= 1) {
            const row = createFlightRow(flight, offset + idx + 1, null, 0, 1, null, parity, true);
            elements.flightTableBody.appendChild(row);
        } else {
            const totalPax = lines.reduce((s,l)=> s + (Number(l.passengers)||0), 0);
            const totalBab = lines.reduce((s,l)=> s + (Number(l.babies)||0), 0);
            lines.forEach((line, li) => {
                const row = createFlightRow(flight, li === 0 ? (offset + idx + 1) : null, line, li, lines.length, {totalPax, totalBab}, parity, li === 0);
                elements.flightTableBody.appendChild(row);
            });
        }
    });
}

// createFlightRow(flight, rowNum, line, lineIdx, lineCount, totals, parity, isGroupStart)
//  - Sans 'line' : rendu normal du vol.
//  - Avec 'line' : rendu d'une ligne d'un vol à escale.
//  - parity : 0/1 → couleur alternée par vol (groupe entier).
//  - isGroupStart : 1ère ligne du vol → trait de séparation supérieur.
function createFlightRow(flight, rowNum, line, lineIdx, lineCount, totals, parity, isGroupStart) {
    const row = document.createElement('tr');
    // Identifiant du vol porté par la ligne (utilisé par le raccourci Ctrl+M)
    if (flight && flight.id) row.setAttribute('data-flight-id', flight.id);

    // ── Couleur alternée par vol (X, Y, X, Y…) ──
    const groupBg = parity === 1 ? '#edf3fb' : '#ffffff';
    row.style.background = groupBg;
    // Vol Charter (MAI hors programme régulier) : ligne rose pâle
    if (flight && flight.isCharter) row.style.background = '#fce4ec';
    if (isGroupStart) row.style.borderTop = '2px solid #d7e2f0';

    const formattedDate = formatDateEU(flight.date);
    const typeText = flight.type === 'DEP' ? 'Départ' : 'Arrivée';
    const typeClass = flight.type === 'DEP' ? 'type-depart' : 'type-arrivee';
    const authNumber = flight.authorizationNumber || 'N/A';

    const isSub = !!line;                    // c'est une ligne d'un vol à escale ?
    const isMain = !isSub || line.isMain;    // ligne principale (vol direct) ?
    // Affichage du trajet en codes IATA (NKC, OUZ…) au lieu d'ICAO (GQNO…).
    // Le stockage reste en ICAO ; seule la présentation change.
    const _rawFrom = line ? (line.from || '') : (flight.from || '');
    const _rawTo   = line ? (line.to   || '') : (flight.to   || '');
    const fromCode = icaoToIATA(_rawFrom) || '–';
    const toCode   = icaoToIATA(_rawTo)   || '–';
    const pax      = line ? line.passengers : flight.passengers;
    const bab      = line ? line.babies     : flight.babies;
    const numCell  = rowNum != null ? `<td style="color:#94a3b8;font-weight:700;text-align:center;width:44px;">${rowNum}</td>` : '<td></td>';

    const routeCell = `<td style="text-align:center;white-space:nowrap;"><strong style="color:#0f1e3d;">${escapeHtml(fromCode)}</strong> <span style="color:#D4AF37;font-weight:700;margin:0 4px;">→</span> <strong style="color:#0f1e3d;">${escapeHtml(toCode)}</strong></td>`;

    // ── Sous-ligne d'escale (pas la ligne principale) ──
    // On n'affiche QUE Trajet + PAX + Bébés. Les autres colonnes sont vides.
    // Fond jaune foncé UNIQUEMENT sur les cellules Trajet et PAX.
    if (isSub && !isMain) {
        const yellow = 'background:#f4c430;';
        const routeCellY = `<td style="text-align:center;white-space:nowrap;${yellow}"><strong style="color:#3a2c00;">${escapeHtml(fromCode)}</strong> <span style="color:#7a4f01;font-weight:700;margin:0 4px;">→</span> <strong style="color:#3a2c00;">${escapeHtml(toCode)}</strong></td>`;
        row.innerHTML = `
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td>${escapeHtml(flight.flightNumber)}</td>
            ${routeCellY}
            <td><span class="type-badge ${typeClass}">${typeText}</span></td>
            <td style="font-weight:700;color:#3a2c00;${yellow}">${pax}</td>
            <td style="font-weight:700;color:#3a2c00;">${bab}</td>
            <td class="actions-cell"></td>
        `;
        return row;
    }

    // ── Ligne principale (vol normal OU 1ère ligne d'un vol à escale) ──
    // Si c'est un vol à escale, on ajoute une case "TOTAL PAX" à droite.
    let actionsCell;
    if (isSub && totals) {
        // Ligne principale d'un vol à escale : case Total au lieu du menu
        actionsCell = `
        <td class="actions-cell">
            <div style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;background:#0f1e3d;color:#D4AF37;border-radius:8px;padding:4px 10px;font-weight:700;">
                <span style="font-size:9px;letter-spacing:.04em;opacity:.85;">TOTAL PAX</span>
                <span style="font-size:15px;" id="tot-${flight.id}">${totals.totalPax}</span>
            </div>
            <div class="actions-wrapper" style="margin-left:6px;">
                <button class="actions-btn" onclick="app.toggleActionsMenu(event, '${flight.id}')" aria-label="Actions">⋯</button>
                <div class="actions-menu" id="actions-${flight.id}">
                    <button data-perm="edit_flight" onclick="event.stopPropagation(); app.editFlight('${flight.id}')" class="action-item"><span class="action-icon">✎</span><span>Modifier</span></button>
                    <button data-perm="delete_flight" onclick="event.stopPropagation(); app.deleteFlight('${flight.id}')" class="action-item action-delete"><span class="action-icon">✕</span><span>Supprimer</span></button>
                </div>
            </div>
        </td>`;
    } else {
        actionsCell = `
        <td class="actions-cell">
            <div class="actions-wrapper">
                <button class="actions-btn" onclick="app.toggleActionsMenu(event, '${flight.id}')" aria-label="Actions">⋯</button>
                <div class="actions-menu" id="actions-${flight.id}">
                    <button data-perm="edit_flight" onclick="event.stopPropagation(); app.editFlight('${flight.id}')" class="action-item"><span class="action-icon">✎</span><span>Modifier</span></button>
                    <button data-perm="delete_flight" onclick="event.stopPropagation(); app.deleteFlight('${flight.id}')" class="action-item action-delete"><span class="action-icon">✕</span><span>Supprimer</span></button>
                </div>
            </div>
        </td>`;
    }

    row.innerHTML = `
        ${numCell}
        <td><strong>${escapeHtml(authNumber)}</strong></td>
        <td>${formattedDate}</td>
        <td>${escapeHtml(flight.company)}</td>
        <td><strong>${escapeHtml(flight.registration)}</strong></td>
        <td>${escapeHtml(flight.flightNumber)}</td>
        ${routeCell}
        <td><span class="type-badge ${typeClass}">${typeText}</span></td>
        <td>${pax}</td>
        <td>${bab}</td>
        ${actionsCell}
    `;

    return row;
}

function renderTotals(filteredFlights) {
    const totalPassengers = filteredFlights.reduce((sum, flight) => sum + flight.passengers, 0);
    const totalBabies = filteredFlights.reduce((sum, flight) => sum + flight.babies, 0);
    
    elements.totalPassengers.textContent = totalPassengers.toLocaleString();
    elements.totalBabies.textContent = totalBabies.toLocaleString();
    // Miroir en haut de page.
    const pTop = document.getElementById('totalPassengersTop');
    if (pTop) pTop.textContent = totalPassengers.toLocaleString();
    const bTop = document.getElementById('totalBabiesTop');
    if (bTop) bTop.textContent = totalBabies.toLocaleString();

    // Mettre à jour le compteur total des vols filtrés
    const lbl = document.getElementById('totalVolsLabel');
    if (lbl) {
        const n = filteredFlights.length;
        lbl.textContent = n.toLocaleString('fr-FR') + ' vol' + (n > 1 ? 's' : '');
    }
}

// ============================================
// REAL-TIME UPDATES
// ============================================
function setupRealtimeListener() {
    // firebase.js gère le listener en temps réel via window.app.updateFlightsData
    // Rien à faire ici — firebase.js appellera updateFlightsData quand les données arrivent
}

function updateFlightsData(newFlights) {
    // ── Normalisation préalable (AVANT la dédup) ──
    // 1. Fusion des variantes de casse du nom de compagnie (non destructif).
    //    Ex. « MAURITANIA AIRLINES » ≡ « Mauritania Airlines ». Corrige d'un coup le
    //    filtre d'accueil (comparaison exacte) ET les agrégations des graphes/rapports.
    // 2. Champ isCharter : migration douce des anciens vols suffixés (L6300A/B).
    for (let _i = 0; _i < newFlights.length; _i++) {
        const _f = newFlights[_i];
        if (!_f) continue;
        if (_f.company) _f.company = canonCompany(_f.company);
        if (_f.isCharter === undefined || _f.isCharter === null) {
            _f.isCharter = _isLegacyCharterFlight(_f);
        } else {
            _f.isCharter = !!_f.isCharter;
        }
    }

    // ── Masquage LÉGER des doublons (sans suppression Firestore) ──
    // On masque les copies exactes à l'affichage, mais on NE SUPPRIME PLUS
    // automatiquement en base : les suppressions re-déclenchaient le listener
    // temps réel → boucle de re-renders → lenteur et scintillement.
    // Les Charter Flights sont EXEMPTÉS : plusieurs rotations d'un même n° de vol
    // le même jour (même trajet, sans n° auth) sont légitimes et doivent rester visibles.
    try {
        const seen = new Set();
        const filtered = [];
        for (const f of newFlights) {
            if (f && f.isCharter) { filtered.push(f); continue; }
            const key = [
                (f.authorizationNumber || '').trim().toUpperCase(),
                (f.date || '').trim(),
                (f.flightNumber || '').trim().toUpperCase(),
                (f.from || '').trim().toUpperCase(),
                (f.to || '').trim().toUpperCase()
            ].join('|');
            if (key === '||||') { filtered.push(f); continue; }
            if (seen.has(key)) continue;   // doublon exact → masqué de l'affichage
            seen.add(key);
            filtered.push(f);
        }
        newFlights = filtered;
    } catch (e) { console.warn('Dédup légère:', e && e.message); }

    flights = newFlights;
    // Peupler le select année avec les années disponibles
    if (elements.yearSelect) {
        const curYear = new Date().getFullYear();
        const years = [...new Set(flights.map(f => f.date ? new Date(f.date).getFullYear() : null).filter(Boolean))].sort((a,b) => b-a);
        const curVal = elements.yearSelect.value || String(curYear);
        elements.yearSelect.innerHTML = '<option value="ALL">Toutes les années</option>';
        years.forEach(y => {
            const o = document.createElement('option');
            o.value = y; o.textContent = y;
            if (String(y) === curVal) o.selected = true;
            elements.yearSelect.appendChild(o);
        });
        // Par défaut : année courante si elle existe dans les données
        if (!elements.yearSelect.dataset.userSet) {
            const opt = [...elements.yearSelect.options].find(o => o.value === String(curYear));
            if (opt) { opt.selected = true; elements.yearSelect.dataset.userSet = '0'; }
        }
        // Marquer la sélection utilisateur
        elements.yearSelect.onchange = function() {
            elements.yearSelect.dataset.userSet = '1';
            handleFilterChange();
        };
    }
    render();
    if (window.refreshChartsFromApp) window.refreshChartsFromApp(flights);

    // ── Pré-remplissage du modal depuis URL (ex: bouton "Saisir" du programme) ──
    if (!window._urlPrefillDone) {
        window._urlPrefillDone = true;
        const p = new URLSearchParams(location.search);
        const vol = p.get('vol');
        const auth = p.get('auth');
        const date = p.get('date');
        const company = p.get('company');
        if (vol || auth || date || company) {
            setTimeout(() => {
                openModal();
                setTimeout(() => {
                    if (auth && elements.fAuthNumber) elements.fAuthNumber.value = auth;
                    if (vol && elements.fVol) elements.fVol.value = vol;
                    if (date && elements.fDate) elements.fDate.value = date;
                    if (company && elements.fCompany) {
                        // Tenter la correspondance exacte ou partielle
                        const opts = [...elements.fCompany.options];
                        const match = opts.find(o => o.value === company || o.textContent.trim() === company);
                        if (match) {
                            elements.fCompany.value = match.value;
                            elements.fCompany.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                    // Nettoyer l'URL pour que le modal ne se ré-ouvre pas au rechargement
                    const cleanUrl = location.pathname + (p.get('tab') ? '?tab=' + p.get('tab') : '');
                    history.replaceState(null, '', cleanUrl);
                }, 200);
            }, 300);
        }
    }
}

// ============================================
// NOTIFICATION SYSTEM
// ============================================
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    elements.notificationContainer.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-out forwards';
            setTimeout(() => notification.remove(), 300);
        }
    }, 3000);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}



/**
 * Format date to EU standard (dd/mm/yyyy)
 * @param {string} dateString - Date in ISO format (yyyy-mm-dd)
 * @returns {string} Formatted date in dd/mm/yyyy format
 */
function formatDateEU(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
}







// ============================================
// ACTIONS MENU FUNCTIONS
// ============================================
function toggleActionsMenu(event, flightId) {
    event.stopPropagation();
    
    const menuId = `actions-${flightId}`;
    const menu = document.getElementById(menuId);
    if (!menu) return;
    
    const isOpen = menu.classList.contains('active');
    closeAllActionsMenus();
    
    if (!isOpen) {
        menu.classList.add('active');
        activeActionsMenu = menu;
    }
}

function closeAllActionsMenus() {
    if (activeActionsMenu) {
        activeActionsMenu.classList.remove('active');
        activeActionsMenu = null;
    }
}

function editFlight(flightId) {
    closeAllActionsMenus();
    openEditModal(flightId);
}

// ============================================
// PUBLIC API
// ============================================
window.toggleStopoverField = function() {
    const cb  = document.getElementById('hasStopover');
    const grp = document.getElementById('stopoverGroup');
    if (grp) grp.style.display = (cb && cb.checked) ? '' : 'none';
    updateMidLegRow();
};

// ICAO → IATA (via adminConfig.airports). Renvoie le code IATA ou le code tel quel.
let _iataWarned = false;
function icaoToIATA(code){
    const c=(code||'').toUpperCase().trim();
    if(!c) return '';
    if(adminConfig && adminConfig.airports && adminConfig.airports.length){
        const ap=adminConfig.airports.find(a=>
            (a.icao||'').toUpperCase().trim()===c ||
            (a.iata||'').toUpperCase().trim()===c
        );
        if(ap && ap.iata) return ap.iata.toUpperCase().trim();
        if(ap) return c;
    } else if(!_iataWarned){
        _iataWarned = true;
        console.warn('icaoToIATA: table aeroports non chargee au moment de l affichage');
    }
    // Repli : codes mauritaniens courants, au cas ou l'admin est incomplet
    var FALLBACK = {GQNO:'NKC',GQNN:'NKC',GQPP:'NDB',GQPZ:'OUZ',GQPA:'ATR',GQNF:'KFA'};
    return FALLBACK[c] || c;
}
window.icaoToIATA = icaoToIATA;

// Met à jour l'affichage des tronçons d'escale (labels IATA) + visibilité.
window.updateMidLegRow = function updateMidLegRow() {
    const escaleLines = document.getElementById('escaleLines');
    const midRow = document.getElementById('midLegRow');
    if (!escaleLines) return;
    const cb = document.getElementById('hasStopover');
    const stopSel = document.getElementById('fStopover');
    const compEl = document.getElementById('fCompany');
    const fromEl = document.getElementById('fFrom');
    const toEl = document.getElementById('fTo');
    const comp = compEl ? compEl.value : '';
    const stopCode = stopSel ? stopSel.value : '';
    const checked = cb && cb.checked;
    const mai = isMAIcompany(comp);
    const mauri = isMauritanianAirport(stopCode);

    // La décomposition en tronçons ne concerne QUE MAI avec une escale choisie.
    const showLines = checked && mai && stopCode;
    escaleLines.style.display = showLines ? '' : 'none';
    // Masquer la saisie PAX du haut quand la décomposition est affichée (évite doublon)
    const topGrid = document.getElementById('topPaxGrid');
    const topLbl = document.getElementById('topPaxLabel');
    if (topGrid) topGrid.style.display = showLines ? 'none' : '';
    if (topLbl) topLbl.style.display = showLines ? 'none' : '';
    if (!showLines) { if(midRow) midRow.style.display='none'; return; }

    const dep = icaoToIATA(fromEl ? fromEl.value : '');
    const stop = icaoToIATA(stopCode);
    const arr = icaoToIATA(toEl ? toEl.value : '');

    const segMain = document.getElementById('segMainLabel');
    const segStop = document.getElementById('segStopLabel');
    const segMid  = document.getElementById('segMidLabel');
    const _typeVal = (document.getElementById('fType')||{}).value || '';
    const isArr = _typeVal.toUpperCase() === 'ARR';
    if (segMain) segMain.textContent = `${dep||'?'} → ${arr||'?'}`;
    if (mauri) {
        // Escale domestique (mauritanienne) → 3 tronçons : départ→escale et escale→arrivée.
        if (segStop) segStop.textContent = `${dep||'?'} → ${stop||'?'}`;
        if (segMid)  segMid.textContent  = `${stop||'?'} → ${arr||'?'}`;
    } else {
        // Escale étrangère → 1 seul tronçon d'escale, dont le sens suit le vol :
        //   ARRIVÉE : escale → arrivée (ex L6213 : DSS → NKC) ;
        //   DÉPART  : départ → escale (ex L6104 : NKC → DKR).
        if (segStop) segStop.textContent = isArr ? `${stop||'?'} → ${arr||'?'}` : `${dep||'?'} → ${stop||'?'}`;
    }

    // Ligne du milieu (escale→arrivée) seulement si escale mauritanienne
    if (midRow) midRow.style.display = mauri ? 'flex' : 'none';

    updateEscaleTotals();
};

// Recalcule le total PAX/bébés (somme des tronçons visibles).
window.updateEscaleTotals = function updateEscaleTotals() {
    const g = id => { const el=document.getElementById(id); return el?(parseInt(el.value)||0):0; };
    const midVisible = document.getElementById('midLegRow') && document.getElementById('midLegRow').style.display !== 'none';
    const totPax = g('fMainPax') + g('fStopoverPax') + (midVisible ? g('fMidLegPax') : 0);
    const totBab = g('fMainBabies') + g('fStopoverBabies') + (midVisible ? g('fMidLegBabies') : 0);
    const tp=document.getElementById('escTotalPax'); if(tp) tp.textContent=totPax;
    const tb=document.getElementById('escTotalBab'); if(tb) tb.textContent=totBab;
};

window.updateRouteByType = updateRouteByType;

// Exposer closeModal pour les onclick HTML (hors module)
window.closeModal = closeModal;

// stepCount : incrémenter/décrémenter un champ numérique
window.stepCount = function(fieldId, delta) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const val = parseInt(el.value) || 0;
    el.value = Math.max(0, val + delta);
};

// Sélection type DEP/ARR via boutons visuels
window.selectType = function(type) {
    const hiddenInput = document.getElementById('fType');
    if (hiddenInput) hiddenInput.value = type;
    const btnDEP = document.getElementById('btnDEP');
    const btnARR = document.getElementById('btnARR');
    if (btnDEP && btnARR) {
        if (type === 'DEP') {
            btnDEP.style.cssText += ';background:#2B5A8E!important;color:#fff!important;border-color:#2B5A8E!important;';
            btnARR.style.cssText += ';background:#f7fafc!important;color:#718096!important;border-color:#e2e8f0!important;';
        } else {
            btnARR.style.cssText += ';background:#2B5A8E!important;color:#fff!important;border-color:#2B5A8E!important;';
            btnDEP.style.cssText += ';background:#f7fafc!important;color:#718096!important;border-color:#e2e8f0!important;';
        }
    }
    updateRouteByType();
};

window.app = {
    deleteFlight,
    updateFlightsData,
    showNotification,
    toggleActionsMenu,
    editFlight,
    render
};

// ── BroadcastChannel: écoute les commandes de inject_test_flights.html ──
// Les vols sont générés ICI dans app.js pour ne pas transférer de données lourdes
(function() {
  try {
    const NKC = 'GQNO';
    const CO = [
      { name:'Mauritania Airlines', prefix:'L6', immatPfx:'5T', dests:['DAAG','DTTA','GOBD','GABS','GCLP','GUCY','GMMN','GQPP','GQNI','GQPF','GQPZ','DIAP','DXXX'] },
      { name:'Air Senegal',         prefix:'HC', immatPfx:'6V', home:'GOBD' },
      { name:'Turkish Airlines',    prefix:'TK', immatPfx:'TC', home:'LTFM' },
      { name:'Binter',              prefix:'NT', immatPfx:'EC', home:'GCLP' },
      { name:'Air Algerie',         prefix:'AH', immatPfx:'7T', home:'DAAG' },
      { name:'ASKY',                prefix:'KP', immatPfx:'TU', home:'GUCY' },
      { name:'Royal Air Maroc',     prefix:'AT', immatPfx:'CN', home:'GMMN' },
      { name:'Tunisair',            prefix:'TU', immatPfx:'TS', home:'DTTA' },
      { name:'Air France',          prefix:'AF', immatPfx:'FH', home:'LFPG' },
    ];
    const PAIRS = [];
    CO.forEach(co => {
      if (co.dests) {
        co.dests.forEach(d => {
          PAIRS.push({co,type:'DEP',from:NKC,to:d});
          PAIRS.push({co,type:'ARR',from:d,to:NKC});
        });
      } else {
        PAIRS.push({co,type:'DEP',from:NKC,to:co.home});
        PAIRS.push({co,type:'ARR',from:co.home,to:NKC});
      }
    });

    function ri(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
    function pad(n,l){return String(n).padStart(l||2,'0');}
    function rndDate(){const y=new Date().getFullYear(),m=ri(1,12),d=ri(1,new Date(y,m,0).getDate());return y+'-'+pad(m)+'-'+pad(d);}
    function rndImmat(p){const L='ABCDEFGHJKLMNPQRSTUVWXYZ',r=()=>L[ri(0,L.length-1)];return p+r()+r()+r();}
    function rndAuth(){const y=String(new Date().getFullYear()).slice(2);return 'SNA'+y+'-'+pad(ri(1,9999),4);}
    function uid(){return 'T'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase();}

    function makeBatch(n) {
      const batch=[];
      for(let i=0;i<n;i++){
        const p=PAIRS[ri(0,PAIRS.length-1)];
        batch.push({
          id:uid(), flightNumber:p.co.prefix+ri(100,999), company:p.co.name,
          date:rndDate(), type:p.type, from:p.from, to:p.to,
          registration:rndImmat(p.co.immatPfx), passengers:ri(30,220), babies:ri(0,8),
          hasStopover:false, stopover:'', stopoverPax:0, stopoverBabies:0,
          authorizationNumber:rndAuth(), source:'TEST',
          timestamp:Date.now(), createdAt:new Date().toISOString()
        });
      }
      return batch;
    }

    const ch = new BroadcastChannel('anac_test_flights');
    ch.addEventListener('message', (evt) => {
      const { cmd, n } = evt.data || {};
      if (cmd === 'ping') {
        ch.postMessage({ cmd:'pong' });
      } else if (cmd === 'inject_add') {
        // Générer n vols côté site et ajouter
        if (!window._realFlights) window._realFlights = flights.filter(f=>f.source!=='TEST');
        const batch  = makeBatch(n || 500);
        const merged = [...flights, ...batch];
        updateFlightsData(merged);
        if (window.refreshChartsFromApp) window.refreshChartsFromApp(merged);
        const testCount = merged.filter(f=>f.source==='TEST').length;
        const tDep = merged.filter(f=>f.source==='TEST'&&f.type==='DEP').length;
        const tArr = merged.filter(f=>f.source==='TEST'&&f.type==='ARR').length;
        ch.postMessage({ cmd:'ack', total:merged.length, test:testCount, dep:tDep, arr:tArr });
      } else if (cmd === 'remove') {
        const real = window._realFlights || flights.filter(f=>f.source!=='TEST');
        window._realFlights = null;
        updateFlightsData(real);
        if (window.refreshChartsFromApp) window.refreshChartsFromApp(real);
        ch.postMessage({ cmd:'ack_remove', total:real.length });
      }
    });
    window._testChannel = ch;
  } catch(e) { console.warn('BroadcastChannel non supporté:', e); }
})();

// ============================================
// INITIALIZATION
// ============================================
// ── Synchroniser archive LDM/MVT quand un vol est modifié ──
async function _syncArchiveFromFlight(flightData) {
    if (!flightData || !flightData.flightNumber || !flightData.date) return;
    try {
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { getFirestore, collection, query, where, getDocs, doc, updateDoc } =
            await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const FB = { apiKey:"AIzaSyCHzrNNRL1MrBCCqxc-1wso9gcBwBztO40",
            authDomain:"anacmr-67835.firebaseapp.com", projectId:"anacmr-67835",
            storageBucket:"anacmr-67835.firebasestorage.app",
            messagingSenderId:"906668222910",
            appId:"1:906668222910:web:19d92b627f155bd2dbb1ef" };
        const app = getApps().find(a=>a.name==='app-arch') || initializeApp(FB,'app-arch');
        const db  = getFirestore(app);
        if (window.ANAC_AUTH && window.ANAC_AUTH.ensureAuthed) {
            try { await window.ANAC_AUTH.ensureAuthed(app); } catch(e) {}
        }

        const fn  = (flightData.flightNumber||'').toUpperCase().replace(/[-\s.]/g,'');
        const dt  = flightData.date;
        const co  = flightData.company || fn.slice(0,2);

        // Trouver l'archive correspondante (même vol + même date)
        const q    = query(collection(db,'ldm_archive'),
            where('flightNumber','==', fn),
            where('date','==', dt));
        const snap = await getDocs(q);

        if (snap.empty) return; // pas d'archive à mettre à jour

        // Mettre à jour les champs modifiés dans chaque doc trouvé
        const updates = {
            from:              flightData.from || '',
            to:                flightData.to   || '',
            passengers:        parseInt(flightData.passengers)||0,
            babies:            parseInt(flightData.babies)||0,
            registration:      flightData.registration || '',
            company:           co,
            authorizationNumber: (flightData.authorizationNumber||'').toUpperCase(),
            updatedAt:         new Date().toISOString()
        };

        await Promise.all(snap.docs.map(d => updateDoc(doc(db,'ldm_archive',d.id), updates)));
    } catch(e) {
        console.warn('_syncArchiveFromFlight error:', e.message);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
});

// Quand Firebase est prêt (signal de firebase.js), re-setup si besoin
window.addEventListener('firebaseReady', () => {
    // Si dbService est maintenant disponible, mettre à jour les données initiales
    if (window.dbService) {
        console.log('Firebase ready — dbService connecté');
    }
});

// Add CSS for additional styling
const additionalStyles = `
    .field-error {
        color: #e53e3e;
        font-size: 12px;
        margin-top: 4px;
    }
    
    .error {
        border-color: #e53e3e !important;
        box-shadow: 0 0 0 3px rgba(229, 62, 62, 0.1) !important;
    }
    
    .type-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
    }
    
    .type-depart {
        background: #e6fffa;
        color: #047481;
    }
    
    .type-arrivee {
        background: #f0fdf4;
        color: #166534;
    }
    
    @keyframes slideOutRight {
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);
