// ============================================
// AJOUTS À FAIRE DANS app.js
// Fonctionnalité : Import SITA (MVT / LDM)
// ============================================
// Ajouter ces lignes à la fin de app.js, AVANT la ligne :
//   document.addEventListener('DOMContentLoaded', initializeApp);
// ============================================

import { parseSitaMessage } from './sita-parser.js';

// ============================================
// SITA IMPORT – ÉTAT
// ============================================
let sitaParsedFlights = [];

// ============================================
// SITA IMPORT – INITIALISATION
// (Appeler cette fonction depuis initializeApp())
// ============================================
function initSitaImport() {
    const importSitaBtn = document.getElementById('importSitaBtn');
    const cancelSitaBtn = document.getElementById('cancelSitaBtn');
    const parseSitaBtn = document.getElementById('parseSitaBtn');
    const importAllSitaBtn = document.getElementById('importAllSitaBtn');
    const cancelSitaImportBtn = document.getElementById('cancelSitaImportBtn');
    const sitaModal = document.getElementById('sitaModal');

    if (!importSitaBtn) return;

    importSitaBtn.addEventListener('click', () => openSitaModal());
    cancelSitaBtn.addEventListener('click', () => closeSitaModal());
    cancelSitaImportBtn.addEventListener('click', () => closeSitaModal());
    parseSitaBtn.addEventListener('click', () => handleParseSita());
    importAllSitaBtn.addEventListener('click', () => handleImportAllSita());

    // Fermer en cliquant sur le fond
    sitaModal.addEventListener('click', (e) => {
        if (e.target === sitaModal) closeSitaModal();
    });
}

// ============================================
// SITA IMPORT – MODAL
// ============================================
function openSitaModal() {
    document.getElementById('sitaModal').classList.add('active');
    document.getElementById('sitaTextarea').value = '';
    document.getElementById('sitaResults').style.display = 'none';
    sitaParsedFlights = [];
    setTimeout(() => document.getElementById('sitaTextarea').focus(), 100);
}

function closeSitaModal() {
    document.getElementById('sitaModal').classList.remove('active');
    sitaParsedFlights = [];
}

// ============================================
// SITA IMPORT – PARSING
// ============================================
function handleParseSita() {
    const text = document.getElementById('sitaTextarea').value;

    if (!text.trim()) {
        showNotification('Veuillez coller un message SITA', 'warning');
        return;
    }

    const parsed = parseSitaMessage(text);

    if (!parsed || parsed.length === 0) {
        showNotification('Aucun vol détecté. Vérifiez le format MVT/LDM.', 'error');
        return;
    }

    sitaParsedFlights = parsed;
    renderSitaResults(parsed);
    document.getElementById('sitaResults').style.display = 'block';
    showNotification(`${parsed.length} vol(s) détecté(s)`, 'success');
}

// ============================================
// SITA IMPORT – AFFICHAGE DES RÉSULTATS
// ============================================
function renderSitaResults(parsedFlights) {
    const container = document.getElementById('sitaResultsTable');

    const rows = parsedFlights.map((f, idx) => `
        <tr>
            <td><input type="checkbox" class="sita-check" data-idx="${idx}" checked></td>
            <td>${f.date}</td>
            <td>
                <input type="text" class="sita-field sita-company" data-idx="${idx}" 
                    value="${escapeHtml(f.company)}" placeholder="Compagnie" list="sita-airlines-list">
            </td>
            <td>
                <input type="text" class="sita-field sita-reg" data-idx="${idx}" 
                    value="${escapeHtml(f.registration)}" placeholder="Immat.">
            </td>
            <td>
                <input type="text" class="sita-field sita-vol" data-idx="${idx}" 
                    value="${escapeHtml(f.flightNumber)}" placeholder="N° Vol">
            </td>
            <td><strong>${f.from || '–'}</strong></td>
            <td><strong>${f.to || '–'}</strong></td>
            <td>
                <span class="type-badge ${f.type === 'DEP' ? 'type-depart' : 'type-arrivee'}">
                    ${f.type === 'DEP' ? 'Départ' : 'Arrivée'}
                </span>
            </td>
            <td>
                <input type="number" class="sita-field sita-pax" data-idx="${idx}" 
                    value="${f.passengers}" min="0" style="width:60px">
            </td>
            <td>
                <input type="number" class="sita-field sita-babies" data-idx="${idx}" 
                    value="${f.babies}" min="0" style="width:50px">
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <datalist id="sita-airlines-list">
            ${AIRLINES.map(a => `<option value="${a}">`).join('')}
        </datalist>
        <div class="table-wrapper" style="margin-top:12px">
            <table>
                <thead>
                    <tr>
                        <th>✓</th>
                        <th>Date</th>
                        <th>Compagnie</th>
                        <th>Immat.</th>
                        <th>N° Vol</th>
                        <th>De</th>
                        <th>Vers</th>
                        <th>Type</th>
                        <th>PAX</th>
                        <th>Bébés</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p class="sita-note">
            ⚠️ Vérifiez et complétez les champs manquants avant d'importer.<br>
            Décochez les vols que vous ne souhaitez pas importer.<br>
            Le <strong>N° d'autorisation</strong> sera assigné automatiquement.
        </p>
    `;
}

// ============================================
// SITA IMPORT – IMPORT VERS FIREBASE
// ============================================
async function handleImportAllSita() {
    requireAuthentication(async () => {
        // Collecter les données des champs modifiables
        const checks = document.querySelectorAll('.sita-check');
        const toImport = [];

        checks.forEach((cb) => {
            if (!cb.checked) return;
            const idx = parseInt(cb.dataset.idx);
            const base = sitaParsedFlights[idx];

            // Récupérer les valeurs éditées dans le tableau
            const companyInput = document.querySelector(`.sita-company[data-idx="${idx}"]`);
            const regInput = document.querySelector(`.sita-reg[data-idx="${idx}"]`);
            const volInput = document.querySelector(`.sita-vol[data-idx="${idx}"]`);
            const paxInput = document.querySelector(`.sita-pax[data-idx="${idx}"]`);
            const babiesInput = document.querySelector(`.sita-babies[data-idx="${idx}"]`);

            toImport.push({
                ...base,
                company: companyInput ? companyInput.value.trim() : base.company,
                registration: regInput ? regInput.value.trim().toUpperCase() : base.registration,
                flightNumber: volInput ? volInput.value.trim().toUpperCase() : base.flightNumber,
                passengers: paxInput ? parseInt(paxInput.value) || 0 : base.passengers,
                babies: babiesInput ? parseInt(babiesInput.value) || 0 : base.babies,
                timestamp: Date.now()
            });
        });

        if (toImport.length === 0) {
            showNotification('Aucun vol sélectionné', 'warning');
            return;
        }

        // Validation minimale
        const invalid = toImport.filter(f => !f.flightNumber || !f.date || !f.from || !f.to);
        if (invalid.length > 0) {
            showNotification(`${invalid.length} vol(s) avec données manquantes (N° vol, date, aéroports requis)`, 'error');
            return;
        }

        // Générer les numéros d'autorisation automatiquement
        const nextAuthNum = getNextAuthNumber();

        let added = 0;
        for (let i = 0; i < toImport.length; i++) {
            const f = toImport[i];
            // Assigner un N° d'auth auto incrémenté
            const authNum = `SNA26-${String(nextAuthNum + i).padStart(4, '0')}`;
            f.authorizationNumber = authNum;

            try {
                if (window.dbService && window.dbService.addFlight) {
                    await window.dbService.addFlight(f);
                    added++;
                }
            } catch (err) {
                console.error('Erreur import vol SITA:', err);
            }
        }

        closeSitaModal();
        showNotification(`✅ ${added} vol(s) importé(s) avec succès`, 'success');
    });
}

// ============================================
// UTILITAIRE : prochain N° d'autorisation
// ============================================
function getNextAuthNumber() {
    if (!flights || flights.length === 0) return 1;

    const maxNum = flights.reduce((max, f) => {
        if (!f.authorizationNumber) return max;
        const m = f.authorizationNumber.match(/(\d+)$/);
        return m ? Math.max(max, parseInt(m[1])) : max;
    }, 0);

    return maxNum + 1;
}

// ============================================
// IMPORTANT : Dans la fonction initializeApp(),
// AJOUTER l'appel suivant :
//
//   function initializeApp() {
//     if (isInitialized) return;
//     try {
//       populateSelects();
//       attachEventListeners();
//       setupRealtimeListener();
//       initSitaImport();   // ← AJOUTER CETTE LIGNE
//       isInitialized = true;
//       ...
//
// ============================================
