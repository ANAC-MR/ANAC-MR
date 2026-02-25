// ============================================
// SITA MESSAGE PARSER – ANAC Mauritanie
// Supporte: MVT (Movement), LDM (Load Distribution)
// ============================================

// ============================================
// MAPPING IATA → ICAO (aéroports fréquents)
// ============================================
const IATA_TO_ICAO = {
    // Mauritanie
    "NKC": "GQNO",  // Nouakchott Oumtounsy
    "NDB": "GQPP",  // Nouadhibou
    "OUZ": "GQPZ",  // Zoueratt
    "MOM": "GQNI",  // Néma
    "KFA": "GQPF",  // Kiffa
    // Maroc
    "CMN": "GMMN",  // Casablanca Mohammed V
    "RAK": "GMMX",  // Marrakech
    "TNG": "GMTT",  // Tanger
    "FEZ": "GMFF",  // Fès
    // Tunisie
    "TUN": "DTTA",  // Tunis Carthage
    // Sénégal
    "DSS": "GOBD",  // Dakar Blaise Diagne
    "DKR": "GOBD",  // Ancien code Dakar
    // Espagne
    "LPA": "GCLP",  // Las Palmas Gran Canaria
    "TFN": "GCXO",  // Tenerife Norte
    "TFS": "GCTS",  // Tenerife Sur
    // Mali
    "BKO": "GABS",  // Bamako
    // Guinée
    "CKY": "GUCY",  // Conakry
    // Côte d'Ivoire
    "ABJ": "DIAP",  // Abidjan
    // Turquie
    "IST": "LTFM",  // Istanbul
    // France
    "CDG": "LFPG",  // Paris CDG
    "ORY": "LFPO",  // Paris Orly
    // Algérie
    "ALG": "DAAG",  // Alger
    // Arabie Saoudite
    "MED": "OEMA",  // Médinah
    "JED": "OEJN",  // Djeddah
    "RUH": "OERK",  // Riyadh
};

// Correspondance préfixe IATA compagnie → nom
const IATA_TO_AIRLINE = {
    "L6":  "Mauritania Airlines",
    "MR":  "Mauritania Airlines",
    "HC":  "Air Sénégal",
    "TK":  "Turkish Airlines",
    "NT":  "Binter",
    "AH":  "Air Algérie",
    "KP":  "ASKY",
    "AT":  "Royal Air Maroc",
    "TU":  "Tunisair",
    "AF":  "Air France",
    "RAM": "Royal Air Maroc",
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Convertit un code IATA en ICAO si possible
 */
function iataToIcao(code) {
    if (!code) return null;
    code = code.trim().toUpperCase();
    // Si déjà ICAO (4 lettres)
    if (/^[A-Z]{4}$/.test(code)) return code;
    // Sinon chercher dans le mapping
    return IATA_TO_ICAO[code] || null;
}

/**
 * Extrait le préfixe compagnie d'un numéro de vol
 * Ex: "L6-123" → "L6", "TK0789" → "TK"
 */
function getAirlineFromFlightNumber(flightNum) {
    if (!flightNum) return null;
    const match = flightNum.match(/^([A-Z]{1,3})-?\d/);
    if (!match) return null;
    const prefix = match[1];
    return IATA_TO_AIRLINE[prefix] || null;
}

/**
 * Formate une date DDMMM ou DDMMMYY en YYYY-MM-DD
 * Ex: "15JAN" → "2026-01-15", "15JAN26" → "2026-01-26"
 */
function parseSitaDate(dateStr, year = null) {
    if (!dateStr) return null;
    const MONTHS_EN = {
        JAN: '01', FEB: '02', MAR: '03', APR: '04',
        MAY: '05', JUN: '06', JUL: '07', AUG: '08',
        SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    const match = dateStr.trim().match(/^(\d{1,2})([A-Z]{3})(\d{2,4})?$/i);
    if (!match) return null;

    const day = match[1].padStart(2, '0');
    const mon = match[2].toUpperCase();
    const mm = MONTHS_EN[mon];
    if (!mm) return null;

    let yr;
    if (match[3]) {
        yr = match[3].length === 2 ? '20' + match[3] : match[3];
    } else {
        yr = year || new Date().getFullYear();
    }
    return `${yr}-${mm}-${day}`;
}

/**
 * Formate un numéro de vol en ajoutant un tiret si nécessaire
 * Ex: "L6123" → "L6-123"
 */
function normalizeFlightNumber(fn) {
    if (!fn) return fn;
    fn = fn.trim().toUpperCase();
    // Déjà formaté
    if (fn.includes('-')) return fn;
    // Sinon: lettres puis chiffres
    const m = fn.match(/^([A-Z]{1,3})(\d+)$/);
    if (m) return m[1] + '-' + m[2];
    return fn;
}

// ============================================
// PARSEUR MVT (Movement Message)
// ============================================
/**
 * Format MVT typique :
 * MVT
 * L6-101/15.A.GQNO.GQPP
 * AD1200/1340 EA1500
 * PX156/0
 *
 * Ou version étendue SITA :
 * .NKCMRXH 150126
 * MVT
 * MR101/15.A.NKC.NDB
 * AD1200/1340 EA1500
 * PX156/0
 */
function parseMVT(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const result = [];
    let i = 0;

    // Chercher la ligne MVT
    while (i < lines.length && !lines[i].startsWith('MVT')) i++;
    if (i >= lines.length) return result;
    i++;

    // Lire les blocs de vol
    while (i < lines.length) {
        const flightLine = lines[i]; // Ex: "L6-101/15.A.GQNO.GQPP" ou "L6101/15.A.NKC.NDB"
        
        // Regex: NúmVol / Jour . TypeMvt . Origine . Destination
        const flightMatch = flightLine.match(
            /^([A-Z0-9\-]+)\/(\d{1,2})\.([AD])\.([A-Z]{3,4})\.([A-Z]{3,4})/i
        );
        if (!flightMatch) { i++; continue; }

        const rawFlightNum = flightMatch[1];
        const day = flightMatch[2];
        const mvtType = flightMatch[3].toUpperCase(); // A=Arrival, D=Departure
        const fromCode = flightMatch[4].toUpperCase();
        const toCode = flightMatch[5].toUpperCase();

        // Convertir IATA→ICAO
        const from = iataToIcao(fromCode) || fromCode;
        const to = iataToIcao(toCode) || toCode;
        const flightNumber = normalizeFlightNumber(rawFlightNum);
        const company = getAirlineFromFlightNumber(flightNumber);

        // Lire les lignes suivantes pour PX (passagers)
        let passengers = 0, babies = 0;
        let dateStr = null;

        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const l = lines[j];
            // PX156/2 → 156 passagers, 2 bébés
            const pxMatch = l.match(/^PX(\d+)\/(\d+)/i);
            if (pxMatch) {
                passengers = parseInt(pxMatch[1]) || 0;
                babies = parseInt(pxMatch[2]) || 0;
            }
            // Chercher date dans l'en-tête (.NKCMRXH 150126)
            const dateHeaderMatch = l.match(/(\d{6})/);
            if (dateHeaderMatch && !dateStr) {
                const d = dateHeaderMatch[1];
                dateStr = `20${d.slice(4,6)}-${d.slice(2,4)}-${d.slice(0,2)}`;
            }
            // Si on tombe sur un autre bloc de vol, arrêter
            if (/^[A-Z0-9\-]+\/\d{1,2}\.[AD]\./i.test(l)) break;
        }

        // Construire la date depuis le jour extrait + mois courant si pas trouvé autrement
        if (!dateStr) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            dateStr = `${year}-${month}-${day.padStart(2, '0')}`;
        }

        result.push({
            flightNumber,
            company: company || '',
            registration: '',
            date: dateStr,
            from,
            to,
            type: mvtType === 'D' ? 'DEP' : 'ARR',
            passengers,
            babies,
            _source: 'MVT'
        });

        i++;
    }

    return result;
}

// ============================================
// PARSEUR LDM (Load Distribution Message)
// ============================================
/**
 * Format LDM typique :
 * LDM
 * L6-101/15.A.319.GQNO-GQPP
 * -GQPP.156.0.M1F2/TL156
 * PAD/A1.0B1.0C1.0
 * SI NOM COMPLET DU VOL
 */
function parseLDM(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const result = [];
    let i = 0;

    // Chercher la ligne LDM
    while (i < lines.length && !lines[i].startsWith('LDM')) i++;
    if (i >= lines.length) return result;
    i++;

    while (i < lines.length) {
        const flightLine = lines[i];

        // Format: "L6-101/15.A.319.GQNO-GQPP" ou "L6101/15.D.B738.NKC-NDB"
        const flightMatch = flightLine.match(
            /^([A-Z0-9\-]+)\/(\d{1,2})\.([AD])\.([A-Z0-9\-]+)\.([A-Z]{3,4})[-\/]([A-Z]{3,4})/i
        );
        if (!flightMatch) { i++; continue; }

        const rawFlightNum = flightMatch[1];
        const day = flightMatch[2];
        const mvtType = flightMatch[3].toUpperCase();
        // flightMatch[4] = type avion (ex: 319, B738) — ignoré pour l'instant
        const fromCode = flightMatch[5].toUpperCase();
        const toCode = flightMatch[6].toUpperCase();

        const from = iataToIcao(fromCode) || fromCode;
        const to = iataToIcao(toCode) || toCode;
        const flightNumber = normalizeFlightNumber(rawFlightNum);
        const company = getAirlineFromFlightNumber(flightNumber);

        let passengers = 0, babies = 0, registration = '';

        // Lire les lignes suivantes
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            const l = lines[j];

            // Ligne destination: "-GQPP.156.0.M1F2/TL156"
            // Format: -CODE.PAX.BAGAGE_LEST.CLASS/TLPAX
            const destLine = l.match(/^-[A-Z]{3,4}\.(\d+)\.[\d\.]+/i);
            if (destLine) {
                passengers = parseInt(destLine[1]) || 0;
            }

            // Ligne TL (Total Load): "TL 156/0" ou dans le segment dest "/TL156"
            const tlMatch = l.match(/TL(\d+)\/(\d+)/i);
            if (tlMatch) {
                passengers = parseInt(tlMatch[1]) || passengers;
                babies = parseInt(tlMatch[2]) || 0;
            }

            // Immatriculation dans SI ou ailleurs
            const regMatch = l.match(/\b([A-Z]{1,2}-[A-Z]{3,4})\b/);
            if (regMatch && !registration) {
                registration = regMatch[1];
            }

            // Arrêt sur nouveau bloc de vol
            if (/^[A-Z0-9\-]+\/\d{1,2}\.[AD]\./i.test(l)) break;
        }

        // Date
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const dateStr = `${year}-${month}-${day.padStart(2, '0')}`;

        result.push({
            flightNumber,
            company: company || '',
            registration,
            date: dateStr,
            from,
            to,
            type: mvtType === 'D' ? 'DEP' : 'ARR',
            passengers,
            babies,
            _source: 'LDM'
        });

        i++;
    }

    return result;
}

// ============================================
// POINT D'ENTRÉE PRINCIPAL
// ============================================
/**
 * Détecte le type de message SITA et parse en conséquence
 * @param {string} text - Texte brut du message SITA
 * @returns {Array} - Tableau de vols extraits
 */
function parseSitaMessage(text) {
    if (!text || !text.trim()) return [];

    const upper = text.toUpperCase();

    if (upper.includes('MVT')) {
        return parseMVT(text.toUpperCase());
    }
    if (upper.includes('LDM')) {
        return parseLDM(text.toUpperCase());
    }

    // Essayer les deux
    const mvtResult = parseMVT(text.toUpperCase());
    if (mvtResult.length > 0) return mvtResult;

    const ldmResult = parseLDM(text.toUpperCase());
    if (ldmResult.length > 0) return ldmResult;

    return [];
}

// Export
export { parseSitaMessage, iataToIcao, normalizeFlightNumber };
