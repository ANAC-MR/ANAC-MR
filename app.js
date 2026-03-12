// ============================================
// CONFIGURATION & CONSTANTS
// ============================================
const MONTHS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

// ── Normalisation numéro de vol — utilisée partout ──────────────
// Retire tirets, espaces et points → "L6-301", "L6 301", "L6.301" → "L6301"
function normFN(s) {
    return (s || '').toString().toUpperCase().replace(/[-\s.]/g, '');
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
    "ASKY":                "DBBP",  // Lomé
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
    { name: "Lome Gnassingbe",         code: "DBBP" },
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
const ADMIN_PASSWORD = "ANACdady";
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
    try {
        await loadAdminConfig();
        populateSelects();
        attachEventListeners();
        setupRealtimeListener();
        // Appliquer les restrictions UI selon permissions
        setTimeout(applyPermissionsUI, 300);
        isInitialized = true;
        showNotification('Application initialisée avec succès', 'success');
    } catch (error) {
        console.error('Error initializing app:', error);
        showNotification('Erreur lors de l\'initialisation', 'error');
    }
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
    } catch(e) {
        console.warn('Admin config not loaded:', e.message);
        adminConfig = null;
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
    
    // Use admin config airlines if available, else fallback to AIRLINES constant
    const airlinesList = (adminConfig && adminConfig.airlines && adminConfig.airlines.length)
        ? adminConfig.airlines.map(a => a.name)
        : AIRLINES;
    
    airlinesList.forEach(airline => {
        const filterOption = document.createElement('option');
        filterOption.value = airline;
        filterOption.textContent = airline;
        elements.companySelect.appendChild(filterOption);
        
        const formOption = document.createElement('option');
        formOption.value = airline;
        formOption.textContent = airline;
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
        elements.monthSelect, elements.companySelect, elements.fromSelect, elements.toSelect,
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
    elements.fCompany.addEventListener('change', updateFlightNumberPrefix);
    // Auto-fill N° autorisation quand date change
    if (elements.fDate) {
        elements.fDate.addEventListener('change', () => {
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
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Close actions menus when clicking outside
    document.addEventListener('click', (event) => {
        if (activeActionsMenu && !event.target.closest('.actions-wrapper')) {
            closeAllActionsMenus();
        }
    });
}

function handleKeyboardShortcuts(event) {
    // Escape to close modal
    if (event.key === 'Escape' && elements.flightModal.classList.contains('active')) {
        closeModal();
    }
    
    // Ctrl/Cmd + N to add new flight
    if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault();
        openModal();
    }
}

// ============================================
// MODAL FUNCTIONS
// ============================================
function openModal(flightId = null) {
    requireAuthentication(() => {
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
                if (window.selectType) window.selectType(flight.type || 'DEP'); else { const fi=document.getElementById('fType'); if(fi) fi.value=flight.type; }
                if (flight.from) elements.fFrom.value = flight.from;
                if (flight.to) elements.fTo.value = flight.to;
                elements.fPassengers.value = flight.passengers;
                elements.fBabies.value = flight.babies;
                const hasStop = !!(flight.stopover);
                if (elements.hasStopover) elements.hasStopover.checked = hasStop;
                if (elements.fStopover) elements.fStopover.value = flight.stopover || '';
                if (elements.fStopoverPax) elements.fStopoverPax.value = flight.stopoverPax || 0;
                if (elements.fStopoverBabies) elements.fStopoverBabies.value = flight.stopoverBabies || 0;
                const sg1 = document.getElementById('stopoverGroup');
                if (sg1) sg1.style.display = hasStop ? '' : 'none';
                
                elements.fAuthNumber.focus();
            }
        } else {
            // Add mode
            editingFlightId = null;
            resetForm();
            
            // Update modal title
            const modalTitle = elements.flightModal.querySelector('h2');
            modalTitle.textContent = 'Ajouter un vol';
            
            // Set default values
            elements.fCompany.value = AIRLINES[0];
            elements.fPassengers.value = '0';
            elements.fBabies.value = '0';
            elements.fImm.value = '';
            elements.fVol.value = '';
            if (elements.hasStopover) elements.hasStopover.checked = false;
            if (elements.fStopoverPax) elements.fStopoverPax.value = 0;
            if (elements.fStopoverBabies) elements.fStopoverBabies.value = 0;
            const sg0 = document.getElementById('stopoverGroup');
            if (sg0) sg0.style.display = 'none';
            
            elements.fDate.focus();
            // Active bouton DEP + met à jour tout selon la compagnie
            setTimeout(() => {
                if (window.selectType) window.selectType('DEP');
                updateFlightNumberPrefix();
            }, 60);
        }
    });
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
    
    const required = [
        { field: elements.fAuthNumber, message: 'Le numéro d\'autorisation est requis' },
        { field: elements.fDate, message: 'La date est requise' },
        { field: elements.fCompany, message: 'La compagnie est requise' },
        { field: elements.fImm, message: 'L\'immatriculation est requise' },
        { field: elements.fVol, message: 'Le numéro de vol est requis' },
        { field: elements.fFrom, message: 'L\'aéroport de départ est requis' },
        { field: elements.fTo, message: 'L\'aéroport d\'arrivée est requis' }
    ];
    
    required.forEach(({ field, message }) => {
        if (!field.value.trim()) {
            showFieldError(field, message);
            isValid = false;
        }
    });
    
    // Validate authorization number format
    if (elements.fAuthNumber.value.trim() && !validateAuthNumber(elements.fAuthNumber.value.trim())) {
        showFieldError(elements.fAuthNumber, 'Format invalide. Utilisez: SNA25-XXXX ou SNA26-XXXX (ex: SNA26-0001)');
        isValid = false;
    }
    
    // Validate authorization number uniqueness
    const authNumber = elements.fAuthNumber.value.trim();
    if (authNumber && !isAuthNumberUnique(authNumber, editingFlightId)) {
        showFieldError(elements.fAuthNumber, 'Ce numéro d\'autorisation existe déjà');
        isValid = false;
    }

    // Validate flight number + date uniqueness (éviter doublon de vol)
    const fNum = normFN(elements.fVol && elements.fVol.value ? elements.fVol.value : '');
    const fDate = elements.fDate ? elements.fDate.value.trim() : '';
    if (fNum && fDate && !editingFlightId) {
        const dupVol = flights.find(f =>
            normFN(f.flightNumber) === fNum && f.date === fDate
        );
        if (dupVol) {
            showFieldError(elements.fVol, 'Ce vol existe déjà pour cette date (doublon)');
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
    const stopPax     = hasStop ? (parseInt(elements.fStopoverPax   && elements.fStopoverPax.value)   || 0) : 0;
    const stopBabies  = hasStop ? (parseInt(elements.fStopoverBabies && elements.fStopoverBabies.value) || 0) : 0;
    const volPax      = parseInt(elements.fPassengers.value) || 0;
    const volBabies   = parseInt(elements.fBabies.value)     || 0;

    return {
        authorizationNumber: elements.fAuthNumber.value.trim().toUpperCase(),
        date:     elements.fDate.value,
        company:  elements.fCompany.value,
        registration: (document.getElementById('fImmSelect') && document.getElementById('fImmSelect').value
            ? document.getElementById('fImmSelect').value
            : elements.fImm.value.trim().toUpperCase()),
        flightNumber: normFN(document.getElementById('fVolSelect') && document.getElementById('fVolSelect').value
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
        // PAX TOTAL = vol + escale
        passengers: volPax + stopPax,
        babies:     volBabies + stopBabies,
        timestamp:  Date.now()
    };
}

// updateVolField — lit depuis Firebase collection flight_numbers
async function updateVolField(company) {
    const fVol   = elements.fVol;
    const parent = fVol.parentNode;
    const existingSelect = parent.querySelector('#fVolSelect');
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
                if (fVol.value === v.number) opt.selected = true;
                sel.appendChild(opt);
            });
            parent.insertBefore(sel, fVol.nextSibling);
            sel.addEventListener('change', () => {
                fVol.value = sel.value;
                autoFillFromFlightNumber(sel.value);
                setTimeout(autoFillAuth, 200);
            });
            if (fVol.value) sel.value = fVol.value;
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
    const date      = elements.fDate ? elements.fDate.value.trim() : '';
    if (!flightNum) return;
    if (!window.db) return;
    // Ne pas écraser un auth déjà saisi manuellement
    if (elements.fAuthNumber && elements.fAuthNumber.value.trim()) return;

    const fn  = normFN(flightNum); // ex: "AT962"
    const raw = flightNum.trim().toUpperCase(); // format original

    try {
        const { getDocs, collection, query, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Stratégie 1 : flight normalisé + date exacte
        let rec = null;
        if (date) {
            const q1 = query(collection(window.db, 'programme_vols'),
                             where('flight', '==', fn),
                             where('date',   '==', date));
            const s1 = await getDocs(q1);
            if (!s1.empty) rec = s1.docs[0].data();
        }

        // Stratégie 2 : flight original + date
        if (!rec && date) {
            const q2 = query(collection(window.db, 'programme_vols'),
                             where('flight', '==', raw),
                             where('date',   '==', date));
            const s2 = await getDocs(q2);
            if (!s2.empty) rec = s2.docs[0].data();
        }

        // Stratégie 3 : flight normalisé seul (prend le premier trouvé)
        if (!rec) {
            const q3 = query(collection(window.db, 'programme_vols'),
                             where('flight', '==', fn));
            const s3 = await getDocs(q3);
            if (!s3.empty) rec = s3.docs[0].data();
        }

        // Stratégie 4 : flight original seul
        if (!rec) {
            const q4 = query(collection(window.db, 'programme_vols'),
                             where('flight', '==', raw));
            const s4 = await getDocs(q4);
            if (!s4.empty) rec = s4.docs[0].data();
        }

        if (rec && rec.auth && elements.fAuthNumber) {
            elements.fAuthNumber.value = rec.auth.toUpperCase();
            elements.fAuthNumber.style.borderColor = '#34d399';
            setTimeout(() => { if (elements.fAuthNumber) elements.fAuthNumber.style.borderColor = ''; }, 2000);
        }
    } catch(e) { console.warn('autoFillAuth programme_vols:', e.message); }
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
                updateFlightNumberPrefix();
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
}

function updateFlightNumberPrefix() {
    const company = elements.fCompany.value;
    
    // Update flight number prefix
    const prefix = AIRLINE_PREFIXES[company] || 
        (adminConfig && adminConfig.airlines 
            ? (adminConfig.airlines.find(a => a.name === company) || {}).prefix 
            : null);
    const currentValue = elements.fVol.value.trim();
    if (prefix && (!currentValue || currentValue.match(/^[A-Z0-9]+-$/))) {
        elements.fVol.value = prefix + '-';
    }
    
    // Auto-fill From/To based on company + type
    updateRouteByType();
    
    // Update immatriculation field based on admin config
    updateImmField(company);
    // Update vol number field based on admin config
    updateVolField(company);
}

// Listener sur le champ fVol (input texte) pour auto-fill depuis flight_numbers
(function() {
    const fv = document.getElementById('fVol');
    if (fv) {
        let _autoFillTimer;
        fv.addEventListener('input', () => {
            clearTimeout(_autoFillTimer);
            _autoFillTimer = setTimeout(() => autoFillFromFlightNumber(fv.value.trim()), 600);
        });
    }
})();

// Auto-fill From/To + filtrer le select À selon compagnie + type
// NKC (GQNO) est toujours la BASE
function updateRouteByType() {
    const company  = elements.fCompany ? elements.fCompany.value : '';
    const type     = elements.fType    ? elements.fType.value    : 'DEP';
    const NKC_ICAO = 'GQNO';

    // Lire hub et destinations depuis adminConfig Firebase
    let homeCode = COMPANY_HOME_AIRPORT[company] || ''; // fallback hardcodé
    let multiDests = COMPANY_DESTINATIONS[company] || null; // fallback hardcodé
    if (adminConfig && adminConfig.airlines) {
        const al = adminConfig.airlines.find(a => a.name === company);
        if (al) {
            if (al.hub) homeCode = al.hub; // hub depuis Firebase
            if (al.destinations && al.destinations.length > 0) multiDests = al.destinations;
        }
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
            hintEl.textContent = `Préfixe attendu: ${airlineData.immPrefix} (ex: ${airlineData.immPrefix}CLX)`;
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

function isAuthNumberUnique(authNumber, excludeFlightId = null) {
    // Check if authorization number already exists
    const existingFlight = flights.find(flight => 
        flight.authorizationNumber === authNumber && flight.id !== excludeFlightId
    );
    return !existingFlight;
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
    } catch (error) {
        console.error('Error adding flight:', error);
        showNotification('Erreur lors de l\'ajout du vol', 'error');
    } finally {
        elements.flightForm.classList.remove('loading');
    }
}

async function updateFlight(flightId, flightData) {
    console.log('updateFlight called with:');
    console.log('- flightId:', flightId, 'Type:', typeof flightId);
    console.log('- flightData:', flightData);
    
    try {
        elements.flightForm.classList.add('loading');
        
        // Ensure flightId is a string
        const validFlightId = String(flightId);
        console.log('- validFlightId:', validFlightId);
        
        // Update in Firebase through firebase.js
        if (window.dbService && window.dbService.updateFlight) {
            await window.dbService.updateFlight(validFlightId, flightData);
        } else {
            throw new Error('Service de base de données non disponible');
        }
        
        closeModal();
        showNotification('Vol modifié avec succès', 'success');
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
    console.log('Delete flight called with ID:', flightId);
    
    const success = await requireAuthentication(async () => {
        console.log('Authentication passed, proceeding with delete');
        try {
            const flight = flights.find(f => f.id === flightId);
            if (!flight) {
                console.log('Flight not found:', flightId);
                return false;
            }
            
            console.log('Found flight to delete:', flight);
            
            // Store for undo
            lastDeletedFlight = { flight, id: flightId };
            
            // Delete from Firebase
            if (window.dbService && window.dbService.deleteFlight) {
                console.log('Calling dbService.deleteFlight');
                try {
                    const deleteResult = await window.dbService.deleteFlight(flightId);
                    console.log('Firebase delete result:', deleteResult);
                    
                    // Manual UI update as fallback
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
                console.error('dbService not available');
                showNotification('Service de base de données non disponible', 'error');
                return false;
            }
        } catch (error) {
            console.error('Error deleting flight:', error);
            showNotification('Erreur lors de la suppression du vol', 'error');
            return false;
        }
    });
    
    console.log('Delete operation result:', success);
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
    render();
}

function handleTypeFilter(button) {
    currentTypeFilter = button.dataset.type;
    
    // Update active state
    elements.typeButtons.forEach(btn => btn.classList.remove('btn-active'));
    button.classList.add('btn-active');
    
    render();
}

function resetFilters() {
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
    document.querySelector('[data-type="ALL"]').classList.add('btn-active');
    
    render();
    showNotification('Filtres réinitialisés', 'success');
}

function filterFlights() {
    const monthFilter = elements.monthSelect.value;
    const companyFilter = elements.companySelect.value;
    const fromFilter = elements.fromSelect.value;
    const toFilter = elements.toSelect.value;
    const dateFrom = elements.searchFrom.value;
    const dateTo = elements.searchTo.value;
    const immFilter = elements.searchImm.value.toUpperCase().trim();
    const volFilter = elements.searchVol.value.toUpperCase().trim();
    
    return flights.filter(flight => {
        const flightDate = new Date(flight.date);
        
        // Month filter
        if (monthFilter !== 'ALL' && flightDate.getMonth() !== parseInt(monthFilter)) {
            return false;
        }
        
        // Company filter
        if (companyFilter !== 'ALL' && flight.company !== companyFilter) {
            return false;
        }
        
        // From airport filter
        if (fromFilter !== 'ALL' && flight.from !== fromFilter) {
            return false;
        }
        
        // To airport filter
        if (toFilter !== 'ALL' && flight.to !== toFilter) {
            return false;
        }
        
        // Date range filter
        if (dateFrom && flight.date < dateFrom) {
            return false;
        }
        
        if (dateTo && flight.date > dateTo) {
            return false;
        }
        
        // Type filter
        if (currentTypeFilter !== 'ALL' && flight.type !== currentTypeFilter) {
            return false;
        }
        
        // Registration filter (case-insensitive)
        if (immFilter && !flight.registration.toUpperCase().includes(immFilter)) {
            return false;
        }
        
        // Flight number filter (case-insensitive)
        if (volFilter && !normFN(flight.flightNumber).includes(normFN(volFilter))) {
            return false;
        }
        
        return true;
    });
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function render() {
    const filteredFlights = filterFlights();
    
    // Sort by authorization number ascending (smallest to largest)
    filteredFlights.sort((a, b) => {
        const getAuthNum = (auth) => {
            if (!auth) return 0;
            const match = auth.match(/(\d+)$/);
            return match ? parseInt(match[1]) : 0;
        };
        return getAuthNum(a.authorizationNumber) - getAuthNum(b.authorizationNumber);
    });
    
    renderTable(filteredFlights);
    renderTotals(filteredFlights);
}

function renderTable(filteredFlights) {
    elements.flightTableBody.innerHTML = '';
    
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
    
    filteredFlights.forEach(flight => {
        const row = createFlightRow(flight);
        elements.flightTableBody.appendChild(row);
    });
}

function createFlightRow(flight) {
    const row = document.createElement('tr');
    
    const formattedDate = formatDateEU(flight.date);
    const typeText = flight.type === 'DEP' ? 'Départ' : 'Arrivée';
    const typeClass = flight.type === 'DEP' ? 'type-depart' : 'type-arrivee';
    const authNumber = flight.authorizationNumber || 'N/A';
    const fromCode = flight.from || '–';
    const toCode = flight.to || '–';
    
    row.innerHTML = `
        <td><strong>${escapeHtml(authNumber)}</strong></td>
        <td>${formattedDate}</td>
        <td>${escapeHtml(flight.company)}</td>
        <td><strong>${escapeHtml(flight.registration)}</strong></td>
        <td>${escapeHtml(flight.flightNumber)}</td>
        <td><strong>${escapeHtml(fromCode)}</strong></td>
        <td><strong>${escapeHtml(toCode)}</strong></td>
        <td><span class="type-badge ${typeClass}">${typeText}</span></td>
        <td>${flight.passengers}</td>
        <td>${flight.babies}</td>
        <td class="actions-cell">
            <div class="actions-wrapper">
                <button class="actions-btn" onclick="app.toggleActionsMenu(event, '${flight.id}')" aria-label="Actions">
                    ⋯
                </button>
                <div class="actions-menu" id="actions-${flight.id}">
                    <button onclick="event.stopPropagation(); app.editFlight('${flight.id}')" class="action-item">
                        <span class="action-icon">✏️</span>
                        <span>Modifier</span>
                    </button>
                    <button onclick="event.stopPropagation(); app.deleteFlight('${flight.id}')" class="action-item action-delete">
                        <span class="action-icon">🗑️</span>
                        <span>Supprimer</span>
                    </button>
                </div>
            </div>
        </td>
    `;
    
    return row;
}

function renderTotals(filteredFlights) {
    const totalPassengers = filteredFlights.reduce((sum, flight) => sum + flight.passengers, 0);
    const totalBabies = filteredFlights.reduce((sum, flight) => sum + flight.babies, 0);
    
    elements.totalPassengers.textContent = totalPassengers.toLocaleString();
    elements.totalBabies.textContent = totalBabies.toLocaleString();
}

// ============================================
// REAL-TIME UPDATES
// ============================================
function setupRealtimeListener() {
    // firebase.js gère le listener en temps réel via window.app.updateFlightsData
    // Rien à faire ici — firebase.js appellera updateFlightsData quand les données arrivent
}

function updateFlightsData(newFlights) {
    flights = newFlights;
    render();
    if (window.refreshChartsFromApp) window.refreshChartsFromApp(flights);
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

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
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

/**
 * Check if user is authenticated for this session
 * @returns {boolean} True if authenticated
 */
function checkAuthentication() {
    if (isAuthenticated) {
        return true;
    }
    
    // Check sessionStorage for existing authentication
    const sessionAuth = sessionStorage.getItem('isAuthenticated');
    if (sessionAuth === 'true') {
        isAuthenticated = true;
        return true;
    }
    
    return false;
}

/**
 * Prompt for password and authenticate
 * @returns {Promise<boolean>} True if authentication successful
 */
async function authenticate() {
    if (checkAuthentication()) {
        return true;
    }
    
    return new Promise((resolve) => {
        // Create modal for password input
        const modal = document.createElement('div');
        modal.className = 'modal active auth-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Authentification requise</h2>
                <p>Veuillez entrer le mot de passe pour continuer:</p>
                <form id="authForm">
                    <div class="form-group">
                        <label for="passwordInput">Mot de passe</label>
                        <input type="password" id="passwordInput" class="password-input" required autocomplete="current-password">
                    </div>
                    <div class="modal-buttons">
                        <button type="submit" class="btn-success">Valider</button>
                        <button type="button" class="btn-secondary" id="cancelAuth">Annuler</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const passwordInput = document.getElementById('passwordInput');
        const authForm = document.getElementById('authForm');
        const cancelBtn = document.getElementById('cancelAuth');
        
        const cleanup = () => {
            modal.remove();
            passwordInput.value = '';
        };
        
        const handleSubmit = (e) => {
            e.preventDefault();
            const password = passwordInput.value;
            
            if (password === ADMIN_PASSWORD) {
                isAuthenticated = true;
                sessionStorage.setItem('isAuthenticated', 'true');
                cleanup();
                resolve(true);
            } else {
                passwordInput.classList.add('error');
                showNotification('Mot de passe incorrect', 'error');
                passwordInput.value = '';
                passwordInput.focus();
            }
        };
        
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };
        
        authForm.addEventListener('submit', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        
        // Focus on password input
        setTimeout(() => passwordInput.focus(), 100);
        
        // Close on escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleEscape);
                handleCancel();
            }
        };
        document.addEventListener('keydown', handleEscape);
    });
}

/**
 * Require authentication before executing an action
 * @param {Function} action - Function to execute if authenticated
 * @returns {Promise<boolean>} True if action was executed
 */
async function requireAuthentication(action) {
    const auth = await authenticate();
    if (auth) {
        await action();
        return true;
    } else {
        showNotification('Action annulée', 'warning');
        return false;
    }
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
};

window.updateRouteByType = updateRouteByType;

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
    editFlight
};

// ── BroadcastChannel: écoute les commandes de inject_test_flights.html ──
// Les vols sont générés ICI dans app.js pour ne pas transférer de données lourdes
(function() {
  try {
    const NKC = 'GQNO';
    const CO = [
      { name:'Mauritania Airlines', prefix:'L6', immatPfx:'5T', dests:['DAAG','DTTA','GOBD','GABS','GCLP','GUCY','GMMN','GQPP','GQNI','GQPF','GQPZ','DIAP','DBBP'] },
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
