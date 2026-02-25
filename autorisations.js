// ============================================
// DESTINATIONS (same as main app)
// ============================================
const DESTINATIONS = [
    { name: "Nouakchott Oumtounsy", code: "GQNN" },
    { name: "Nouadhibou International", code: "GQPP" },
    { name: "Zoueratt International", code: "GQPF" },
    { name: "Néma Airport", code: "GQNE" },
    { name: "Kiffa Airport", code: "GQNK" },
    { name: "Casablanca Mohammed V", code: "GMMN" },
    { name: "Tunis Carthage", code: "DTTA" },
    { name: "Dakar Blaise Diagne", code: "GOOY" },
    { name: "Las Palmas Gran Canaria", code: "GCLP" },
    { name: "Bamako Modibo Keita", code: "GABS" },
    { name: "Conakry Gbessia", code: "GUCY" },
    { name: "Abidjan Félix Houphouët-Boigny", code: "DIAP" },
    { name: "Istanbul Airport", code: "LTFM" },
    { name: "Paris Charles de Gaulle", code: "LFPG" },
    { name: "Alger Houari Boumediene", code: "DAAG" },
    { name: "Madinah Prince Mohammad Bin Abdulaziz", code: "OEMA" }
];

// ============================================
// STATE
// ============================================
let currentTransportUser = null;
let currentDirectionUser = null;
let transportUnsubscribe = null;
let directionUnsubscribe = null;
let pendingRejectId = null;
let pendingRejectRole = null;
let allTransportRequests = [];
let allDirectionRequests = [];

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    populateAirports();
    setupTabs();
    setupForms();
    waitForAuthService();
});

function waitForAuthService(attempts = 0) {
    if (window.authService) {
        setupAuthListeners();
    } else if (attempts < 20) {
        setTimeout(() => waitForAuthService(attempts + 1), 200);
    }
}

function populateAirports() {
    const selects = ['departure', 'arrival'];
    selects.forEach(id => {
        const sel = document.getElementById(id);
        DESTINATIONS.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.code;
            opt.textContent = `${d.code} – ${d.name}`;
            sel.appendChild(opt);
        });
    });
}

// ============================================
// TABS
// ============================================
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });
}

// ============================================
// FORMS
// ============================================
function setupForms() {
    // Client form
    document.getElementById('clientForm').addEventListener('submit', handleClientSubmit);

    // Transport login
    document.getElementById('transportLoginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin('transport');
    });

    // Direction login
    document.getElementById('directionLoginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin('direction');
    });
}

// ============================================
// CLIENT FORM SUBMIT
// ============================================
async function handleClientSubmit(e) {
    e.preventDefault();

    const requestData = {
        clientName: document.getElementById('clientName').value.trim(),
        clientEmail: document.getElementById('clientEmail').value.trim(),
        clientPhone: document.getElementById('clientPhone').value.trim(),
        clientCompany: document.getElementById('clientCompany').value.trim(),
        requestType: document.getElementById('requestType').value,
        flightDate: document.getElementById('flightDate').value,
        flightNumber: document.getElementById('flightNumber').value.trim().toUpperCase(),
        registration: document.getElementById('registration').value.trim().toUpperCase(),
        aircraftType: document.getElementById('aircraftType').value.trim(),
        departure: document.getElementById('departure').value,
        arrival: document.getElementById('arrival').value,
        pax: parseInt(document.getElementById('pax').value) || 0,
        remarks: document.getElementById('remarks').value.trim(),
        requestNumber: generateRequestNumber()
    };

    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Envoi en cours...';

        const id = await window.authService.addRequest(requestData);

        document.getElementById('clientForm').style.display = 'none';
        document.getElementById('confirmationBox').style.display = 'block';
        document.getElementById('requestNumber').textContent = requestData.requestNumber;

        showNotification('Demande soumise avec succès !', 'success');

        // Send confirmation email via EmailJS (optional - configure below)
        sendConfirmationEmail(requestData);

    } catch (error) {
        console.error('Error submitting request:', error);
        showNotification('Erreur lors de la soumission. Réessayez.', 'error');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = '📤 Soumettre la demande';
    }
}

function generateRequestNumber() {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 9000) + 1000;
    return `ANAC-${year}-${random}`;
}

function sendConfirmationEmail(data) {
    // EmailJS integration (free tier: 200 emails/month)
    // To activate:
    // 1. Create account at emailjs.com
    // 2. Replace SERVICE_ID, TEMPLATE_ID, PUBLIC_KEY below
    // 3. Uncomment the code

    /*
    emailjs.send('SERVICE_ID', 'TEMPLATE_ID', {
        to_email: data.clientEmail,
        to_name: data.clientName,
        request_number: data.requestNumber,
        flight_date: data.flightDate,
        flight_number: data.flightNumber,
    }, 'PUBLIC_KEY');
    */
    console.log('Email confirmation would be sent to:', data.clientEmail);
}

window.resetClientForm = function() {
    document.getElementById('clientForm').reset();
    document.getElementById('clientForm').style.display = 'block';
    document.getElementById('confirmationBox').style.display = 'none';
};

// ============================================
// AUTH
// ============================================
function setupAuthListeners() {
    window.authService.onAuthChange((user, role) => {
        if (user && role === 'transport') {
            currentTransportUser = user;
            showTransportDashboard();
        } else if (user && role === 'direction') {
            currentDirectionUser = user;
            showDirectionDashboard();
        }
    });
}

async function handleLogin(role) {
    const email = document.getElementById(`${role}Email`).value;
    const password = document.getElementById(`${role}Password`).value;

    try {
        const btn = document.querySelector(`#${role}LoginForm button`);
        btn.disabled = true;
        btn.textContent = 'Connexion...';

        const { user } = await window.authService.login(email, password);

        if (role === 'transport') {
            currentTransportUser = user;
            showTransportDashboard();
        } else {
            currentDirectionUser = user;
            showDirectionDashboard();
        }

        showNotification('Connexion réussie', 'success');
    } catch (error) {
        showNotification(error.message || 'Email ou mot de passe incorrect', 'error');
        const btn = document.querySelector(`#${role}LoginForm button`);
        btn.disabled = false;
        btn.textContent = 'Se connecter';
    }
}

window.logoutTransport = async function() {
    await window.authService.logout();
    currentTransportUser = null;
    if (transportUnsubscribe) { transportUnsubscribe(); transportUnsubscribe = null; }
    document.getElementById('transportDashboard').style.display = 'none';
    document.getElementById('transportLogin').style.display = 'flex';
    document.getElementById('transportEmail').value = '';
    document.getElementById('transportPassword').value = '';
    showNotification('Déconnecté', 'success');
};

window.logoutDirection = async function() {
    await window.authService.logout();
    currentDirectionUser = null;
    if (directionUnsubscribe) { directionUnsubscribe(); directionUnsubscribe = null; }
    document.getElementById('directionDashboard').style.display = 'none';
    document.getElementById('directionLogin').style.display = 'flex';
    document.getElementById('directionEmail').value = '';
    document.getElementById('directionPassword').value = '';
    showNotification('Déconnecté', 'success');
};

// ============================================
// TRANSPORT DASHBOARD
// ============================================
function showTransportDashboard() {
    document.getElementById('transportLogin').style.display = 'none';
    document.getElementById('transportDashboard').style.display = 'block';

    if (transportUnsubscribe) transportUnsubscribe();
    transportUnsubscribe = window.authService.onTransportRequests((requests) => {
        allTransportRequests = requests;
        renderTransportTable(requests);
        updateTransportStats(requests);
    });
}

function updateTransportStats(requests) {
    const pending = requests.filter(r => r.status === 'pending').length;
    const accepted = requests.filter(r => r.transportStatus === 'accepted').length;
    const rejected = requests.filter(r => r.transportStatus === 'rejected').length;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statAccepted').textContent = accepted;
    document.getElementById('statRejected').textContent = rejected;
}

function renderTransportTable(requests) {
    const tbody = document.getElementById('transportTableBody');
    tbody.innerHTML = '';

    if (requests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><p>Aucune demande reçue</p></td></tr>`;
        return;
    }

    requests.forEach(req => {
        const row = document.createElement('tr');
        const statusBadge = getStatusBadge(req.status);
        const canAct = req.status === 'pending';

        row.innerHTML = `
            <td><strong>${req.requestNumber || req.id.substring(0,8)}</strong></td>
            <td>${formatDate(req.flightDate)}</td>
            <td>${escapeHtml(req.clientName)}</td>
            <td>${escapeHtml(req.clientCompany)}</td>
            <td>${getTypeLabel(req.requestType)}</td>
            <td>${escapeHtml(req.flightNumber)}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-view" onclick="viewRequest('${req.id}', 'transport')">👁 Voir</button>
                    ${canAct ? `
                    <button class="btn-accept" onclick="transportAccept('${req.id}')">✅ Accepter</button>
                    <button class="btn-reject" onclick="openRejectModal('${req.id}', 'transport')">❌ Rejeter</button>
                    ` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.transportAccept = async function(id) {
    try {
        await window.authService.transportAccept(id);
        showNotification('Demande acceptée — transmise à la Direction Générale', 'success');
    } catch (e) {
        showNotification('Erreur lors de l\'acceptation', 'error');
    }
};

// ============================================
// DIRECTION DASHBOARD
// ============================================
function showDirectionDashboard() {
    document.getElementById('directionLogin').style.display = 'none';
    document.getElementById('directionDashboard').style.display = 'block';

    if (directionUnsubscribe) directionUnsubscribe();
    directionUnsubscribe = window.authService.onDirectionRequests((requests) => {
        allDirectionRequests = requests;
        renderDirectionTable(requests);
        updateDirectionStats(requests);
    });
}

function updateDirectionStats(requests) {
    const pending = requests.filter(r => r.status === 'transport_accepted').length;
    const approved = requests.filter(r => r.directionStatus === 'approved').length;
    const rejected = requests.filter(r => r.directionStatus === 'rejected').length;
    document.getElementById('statDirPending').textContent = pending;
    document.getElementById('statDirApproved').textContent = approved;
    document.getElementById('statDirRejected').textContent = rejected;
}

function renderDirectionTable(requests) {
    const tbody = document.getElementById('directionTableBody');
    tbody.innerHTML = '';

    if (requests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state"><p>Aucune demande en attente</p></td></tr>`;
        return;
    }

    requests.forEach(req => {
        const row = document.createElement('tr');
        const transportBadge = `<span class="status-badge status-accepted">✅ Accepté</span>`;
        const finalStatus = getFinalStatusBadge(req.status);
        const canAct = req.status === 'transport_accepted';

        row.innerHTML = `
            <td><strong>${req.requestNumber || req.id.substring(0,8)}</strong></td>
            <td>${formatDate(req.flightDate)}</td>
            <td>${escapeHtml(req.clientName)}</td>
            <td>${escapeHtml(req.clientCompany)}</td>
            <td>${getTypeLabel(req.requestType)}</td>
            <td>${escapeHtml(req.flightNumber)}</td>
            <td>${transportBadge}</td>
            <td>${finalStatus}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-view" onclick="viewRequest('${req.id}', 'direction')">👁 Voir</button>
                    ${canAct ? `
                    <button class="btn-accept" onclick="directionApprove('${req.id}')">✅ Approuver</button>
                    <button class="btn-reject" onclick="openRejectModal('${req.id}', 'direction')">❌ Rejeter</button>
                    ` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.directionApprove = async function(id) {
    try {
        await window.authService.directionApprove(id);
        showNotification('Demande approuvée définitivement !', 'success');
    } catch (e) {
        showNotification('Erreur lors de l\'approbation', 'error');
    }
};

// ============================================
// REJECT MODAL
// ============================================
window.openRejectModal = function(id, role) {
    pendingRejectId = id;
    pendingRejectRole = role;
    document.getElementById('rejectReason').value = '';
    document.getElementById('rejectModal').classList.add('active');
};

window.closeRejectModal = function() {
    document.getElementById('rejectModal').classList.remove('active');
    pendingRejectId = null;
    pendingRejectRole = null;
};

document.getElementById('confirmRejectBtn').addEventListener('click', async () => {
    const reason = document.getElementById('rejectReason').value.trim();
    if (!reason) {
        showNotification('Veuillez indiquer le motif du rejet', 'error');
        return;
    }

    try {
        if (pendingRejectRole === 'transport') {
            await window.authService.transportReject(pendingRejectId, reason);
            showNotification('Demande rejetée', 'success');
        } else {
            await window.authService.directionReject(pendingRejectId, reason);
            showNotification('Demande rejetée par la Direction', 'success');
        }
        closeRejectModal();
    } catch (e) {
        showNotification('Erreur lors du rejet', 'error');
    }
});

// ============================================
// VIEW REQUEST DETAIL
// ============================================
window.viewRequest = function(id, role) {
    const list = role === 'transport' ? allTransportRequests : allDirectionRequests;
    const req = list.find(r => r.id === id);
    if (!req) return;

    const content = document.getElementById('requestDetailContent');
    content.innerHTML = `
        <p class="detail-section-title">Informations du demandeur</p>
        <div class="detail-grid">
            <div class="detail-item"><label>Nom</label><span>${escapeHtml(req.clientName)}</span></div>
            <div class="detail-item"><label>Email</label><span>${escapeHtml(req.clientEmail)}</span></div>
            <div class="detail-item"><label>Téléphone</label><span>${escapeHtml(req.clientPhone)}</span></div>
            <div class="detail-item"><label>Compagnie</label><span>${escapeHtml(req.clientCompany)}</span></div>
        </div>
        <p class="detail-section-title">Informations du vol</p>
        <div class="detail-grid">
            <div class="detail-item"><label>Type de demande</label><span>${getTypeLabel(req.requestType)}</span></div>
            <div class="detail-item"><label>Date du vol</label><span>${formatDate(req.flightDate)}</span></div>
            <div class="detail-item"><label>Numéro de vol</label><span>${escapeHtml(req.flightNumber)}</span></div>
            <div class="detail-item"><label>Immatriculation</label><span>${escapeHtml(req.registration)}</span></div>
            <div class="detail-item"><label>Type d'aéronef</label><span>${escapeHtml(req.aircraftType)}</span></div>
            <div class="detail-item"><label>Passagers</label><span>${req.pax}</span></div>
            <div class="detail-item"><label>Départ</label><span>${escapeHtml(req.departure)}</span></div>
            <div class="detail-item"><label>Arrivée</label><span>${escapeHtml(req.arrival)}</span></div>
        </div>
        ${req.remarks ? `<p class="detail-section-title">Remarques</p><p>${escapeHtml(req.remarks)}</p>` : ''}
        ${req.transportComment ? `<p class="detail-section-title">Commentaire Transport Aérien</p><p>${escapeHtml(req.transportComment)}</p>` : ''}
        ${req.directionComment ? `<p class="detail-section-title">Commentaire Direction Générale</p><p>${escapeHtml(req.directionComment)}</p>` : ''}
    `;

    document.getElementById('requestDetailActions').innerHTML = `
        <button class="btn-secondary" onclick="document.getElementById('requestDetailModal').classList.remove('active')">Fermer</button>
    `;

    document.getElementById('requestDetailModal').classList.add('active');
};

// ============================================
// HELPERS
// ============================================
function getStatusBadge(status) {
    const map = {
        'pending': '<span class="status-badge status-pending">⏳ En attente</span>',
        'transport_accepted': '<span class="status-badge status-accepted">✅ Accepté</span>',
        'rejected': '<span class="status-badge status-rejected">❌ Rejeté</span>',
        'approved': '<span class="status-badge status-approved">🏛 Approuvé</span>',
        'direction_rejected': '<span class="status-badge status-rejected">❌ Rejeté DG</span>',
    };
    return map[status] || `<span class="status-badge status-pending">${status}</span>`;
}

function getFinalStatusBadge(status) {
    if (status === 'transport_accepted') return '<span class="status-badge status-pending">⏳ En attente DG</span>';
    if (status === 'approved') return '<span class="status-badge status-approved">✅ Approuvé</span>';
    if (status === 'direction_rejected') return '<span class="status-badge status-rejected">❌ Rejeté</span>';
    return '<span class="status-badge status-pending">–</span>';
}

function getTypeLabel(type) {
    const map = {
        'autorisation': 'Autorisation survol',
        'permission': 'Permission atterrissage',
        'escale': 'Escale technique',
        'charter': 'Vol charter'
    };
    return map[type] || type;
}

function formatDate(dateStr) {
    if (!dateStr) return '–';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function escapeHtml(text) {
    if (!text) return '–';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationContainer');
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = message;
    container.appendChild(n);
    setTimeout(() => {
        n.style.animation = 'slideOutRight 0.3s ease-out forwards';
        setTimeout(() => n.remove(), 300);
    }, 3500);
}
