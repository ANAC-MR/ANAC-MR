// ============================================
// ADMIN PANEL LOGIC
// ============================================

let currentTab = 'airports';
let editingId = null;
let editingType = null;
let deleteId = null;
let deleteType = null;

let airportsData = [];
let airlinesData = [];
let aircraftData = [];
let usersData = [];

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    waitForAdminService();
});

function waitForAdminService(attempts = 0) {
    if (window.adminService) {
        window.adminService.onAuthChange(user => {
            if (user) {
                showDashboard();
            } else {
                showLogin();
            }
        });
        setupLogin();
    } else if (attempts < 20) {
        setTimeout(() => waitForAdminService(attempts + 1), 200);
    }
}

function setupTabs() {
    document.querySelectorAll('.admin-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            document.getElementById(`tab-${currentTab}`).classList.add('active');
        });
    });
}

function setupLogin() {
    document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('adminEmail').value;
        const password = document.getElementById('adminPassword').value;
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Connexion...';
        try {
            await window.adminService.login(email, password);
        } catch (err) {
            showNotification(err.message || 'Email ou mot de passe incorrect', 'error');
            btn.disabled = false;
            btn.textContent = 'Se connecter';
        }
    });
}

function showLogin() {
    document.getElementById('adminLogin').style.display = 'flex';
    document.getElementById('adminDashboard').style.display = 'none';
}

function showDashboard() {
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';

    // Seed default data then load
    window.adminService.seedDefaultData().then(() => {
        loadAllData();
    });
}

window.adminLogout = async function() {
    await window.adminService.logout();
    showNotification('Déconnecté', 'success');
};

// ============================================
// LOAD DATA
// ============================================
function loadAllData() {
    window.adminService.onAirports(data => {
        airportsData = data.sort((a, b) => a.code?.localeCompare(b.code));
        renderAirports();
    });
    window.adminService.onAirlines(data => {
        airlinesData = data.sort((a, b) => a.name?.localeCompare(b.name));
        renderAirlines();
    });
    window.adminService.onAircraft(data => {
        aircraftData = data.sort((a, b) => a.code?.localeCompare(b.code));
        renderAircraft();
    });
    window.adminService.onUsers(data => {
        usersData = data.sort((a, b) => a.email?.localeCompare(b.email));
        renderUsers();
    });
}

// ============================================
// RENDER TABLES
// ============================================
function renderAirports() {
    const tbody = document.getElementById('airportsTableBody');
    tbody.innerHTML = '';
    if (!airportsData.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#718096;padding:20px;">Aucun aéroport</td></tr>';
        return;
    }
    airportsData.forEach(a => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${esc(a.code)}</strong></td>
            <td>${esc(a.name)}</td>
            <td>${esc(a.country)}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-edit" onclick="openEditModal('airport','${a.id}')">✏️ Modifier</button>
                    <button class="btn-delete-sm" onclick="confirmDelete('airport','${a.id}','${esc(a.code)} – ${esc(a.name)}')">🗑️</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

function renderAirlines() {
    const tbody = document.getElementById('airlinesTableBody');
    tbody.innerHTML = '';
    if (!airlinesData.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#718096;padding:20px;">Aucune compagnie</td></tr>';
        return;
    }
    airlinesData.forEach(a => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${esc(a.name)}</strong></td>
            <td>${esc(a.prefix)}</td>
            <td>${esc(a.regPrefix)}</td>
            <td><code style="background:#f0f4ff;padding:2px 8px;border-radius:4px;">${esc(a.regFormat)}</code></td>
            <td>
                <div class="action-btns">
                    <button class="btn-edit" onclick="openEditModal('airline','${a.id}')">✏️ Modifier</button>
                    <button class="btn-delete-sm" onclick="confirmDelete('airline','${a.id}','${esc(a.name)}')">🗑️</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

function renderAircraft() {
    const tbody = document.getElementById('aircraftTableBody');
    tbody.innerHTML = '';
    if (!aircraftData.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#718096;padding:20px;">Aucun type d\'aéronef</td></tr>';
        return;
    }
    aircraftData.forEach(a => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${esc(a.code)}</strong></td>
            <td>${esc(a.name)}</td>
            <td>${esc(a.manufacturer)}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-edit" onclick="openEditModal('aircraft','${a.id}')">✏️ Modifier</button>
                    <button class="btn-delete-sm" onclick="confirmDelete('aircraft','${a.id}','${esc(a.code)} – ${esc(a.name)}')">🗑️</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

function renderUsers() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    if (!usersData.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#718096;padding:20px;">Aucun utilisateur</td></tr>';
        return;
    }
    const roleLabels = { admin: 'Admin', transport: 'Transport Aérien', direction: 'Direction Générale' };
    const roleClass = { admin: 'role-admin', transport: 'role-transport', direction: 'role-direction' };
    usersData.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${esc(u.email)}</td>
            <td><span class="role-badge ${roleClass[u.role] || ''}">${roleLabels[u.role] || u.role}</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-edit" onclick="openEditModal('user','${u.id}')">✏️ Modifier</button>
                    <button class="btn-delete-sm" onclick="confirmDelete('user','${u.id}','${esc(u.email)}')">🗑️</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

// ============================================
// MODALS
// ============================================
const FORMS = {
    airport: (data = {}) => `
        <div class="form-group"><label>Code ICAO *</label><input id="f_code" value="${esc(data.code||'')}" placeholder="Ex: GQNN" maxlength="4" style="text-transform:uppercase"></div>
        <div class="form-group"><label>Nom de l'aéroport *</label><input id="f_name" value="${esc(data.name||'')}" placeholder="Ex: Nouakchott Oumtounsy"></div>
        <div class="form-group"><label>Pays *</label><input id="f_country" value="${esc(data.country||'')}" placeholder="Ex: Mauritanie"></div>`,

    airline: (data = {}) => `
        <div class="form-group"><label>Nom de la compagnie *</label><input id="f_name" value="${esc(data.name||'')}" placeholder="Ex: Mauritania Airlines"></div>
        <div class="form-group"><label>Préfixe vol (IATA) *</label><input id="f_prefix" value="${esc(data.prefix||'')}" placeholder="Ex: L6" maxlength="3" style="text-transform:uppercase"></div>
        <div class="form-group"><label>Préfixe immatriculation *</label><input id="f_regPrefix" value="${esc(data.regPrefix||'')}" placeholder="Ex: 5T" oninput="updateImmatPreview()" style="text-transform:uppercase"></div>
        <div class="form-group"><label>Format immatriculation *</label><input id="f_regFormat" value="${esc(data.regFormat||'')}" placeholder="Ex: 5T-XXX" oninput="updateImmatPreview()" style="text-transform:uppercase"></div>
        <div class="immat-preview" id="immatPreview">Format : <strong>${esc(data.regFormat||'–')}</strong></div>`,

    aircraft: (data = {}) => `
        <div class="form-group"><label>Code ICAO *</label><input id="f_code" value="${esc(data.code||'')}" placeholder="Ex: B738" maxlength="4" style="text-transform:uppercase"></div>
        <div class="form-group"><label>Désignation *</label><input id="f_name" value="${esc(data.name||'')}" placeholder="Ex: Boeing 737-800"></div>
        <div class="form-group"><label>Constructeur *</label><input id="f_manufacturer" value="${esc(data.manufacturer||'')}" placeholder="Ex: Boeing"></div>`,

    user: (data = {}) => `
        <div class="form-group"><label>Email *</label><input id="f_email" type="email" value="${esc(data.email||'')}" placeholder="Ex: transport@anac.mr" ${data.id ? 'readonly style="background:#f7fafc"' : ''}></div>
        <div class="form-group"><label>Rôle *</label>
        <select id="f_role">
            <option value="transport" ${data.role==='transport'?'selected':''}>Transport Aérien</option>
            <option value="direction" ${data.role==='direction'?'selected':''}>Direction Générale</option>
            <option value="admin" ${data.role==='admin'?'selected':''}>Administrateur</option>
        </select></div>
        <div class="info-box" style="font-size:12px;">ℹ️ Pour créer le compte, allez dans Firebase Console → Authentication → Add user avec cet email et un mot de passe.</div>`
};

window.openAddModal = function(type) {
    editingId = null;
    editingType = type;
    const titles = { airport: 'Ajouter un aéroport', airline: 'Ajouter une compagnie', aircraft: 'Ajouter un type d\'aéronef', user: 'Ajouter un utilisateur' };
    document.getElementById('modalTitle').textContent = titles[type];
    document.getElementById('modalForm').innerHTML = FORMS[type]();
    document.getElementById('adminModal').classList.add('active');
};

window.openEditModal = function(type, id) {
    editingId = id;
    editingType = type;
    const datasets = { airport: airportsData, airline: airlinesData, aircraft: aircraftData, user: usersData };
    const data = datasets[type].find(d => d.id === id);
    if (!data) return;
    const titles = { airport: 'Modifier l\'aéroport', airline: 'Modifier la compagnie', aircraft: 'Modifier le type d\'aéronef', user: 'Modifier l\'utilisateur' };
    document.getElementById('modalTitle').textContent = titles[type];
    document.getElementById('modalForm').innerHTML = FORMS[type](data);
    document.getElementById('adminModal').classList.add('active');
};

window.closeAdminModal = function() {
    document.getElementById('adminModal').classList.remove('active');
    editingId = null;
    editingType = null;
};

window.updateImmatPreview = function() {
    const fmt = document.getElementById('f_regFormat')?.value || '–';
    const prev = document.getElementById('immatPreview');
    if (prev) prev.innerHTML = `Format : <strong>${esc(fmt)}</strong>`;
};

window.saveModalData = async function() {
    let data = {};
    try {
        if (editingType === 'airport') {
            data = {
                code: document.getElementById('f_code').value.trim().toUpperCase(),
                name: document.getElementById('f_name').value.trim(),
                country: document.getElementById('f_country').value.trim()
            };
            if (!data.code || !data.name || !data.country) { showNotification('Remplissez tous les champs', 'error'); return; }
            if (editingId) await window.adminService.updateAirport(editingId, data);
            else await window.adminService.addAirport(data);

        } else if (editingType === 'airline') {
            data = {
                name: document.getElementById('f_name').value.trim(),
                prefix: document.getElementById('f_prefix').value.trim().toUpperCase(),
                regPrefix: document.getElementById('f_regPrefix').value.trim().toUpperCase(),
                regFormat: document.getElementById('f_regFormat').value.trim().toUpperCase()
            };
            if (!data.name || !data.prefix || !data.regPrefix || !data.regFormat) { showNotification('Remplissez tous les champs', 'error'); return; }
            if (editingId) await window.adminService.updateAirline(editingId, data);
            else await window.adminService.addAirline(data);

        } else if (editingType === 'aircraft') {
            data = {
                code: document.getElementById('f_code').value.trim().toUpperCase(),
                name: document.getElementById('f_name').value.trim(),
                manufacturer: document.getElementById('f_manufacturer').value.trim()
            };
            if (!data.code || !data.name || !data.manufacturer) { showNotification('Remplissez tous les champs', 'error'); return; }
            if (editingId) await window.adminService.updateAircraft(editingId, data);
            else await window.adminService.addAircraft(data);

        } else if (editingType === 'user') {
            data = {
                email: document.getElementById('f_email').value.trim().toLowerCase(),
                role: document.getElementById('f_role').value
            };
            if (!data.email || !data.role) { showNotification('Remplissez tous les champs', 'error'); return; }
            if (editingId) await window.adminService.updateUser(editingId, data);
            else await window.adminService.addUser(data);
        }

        showNotification('Enregistré avec succès !', 'success');
        closeAdminModal();
    } catch (err) {
        console.error(err);
        showNotification('Erreur lors de l\'enregistrement', 'error');
    }
};

// ============================================
// DELETE
// ============================================
window.confirmDelete = function(type, id, label) {
    deleteId = id;
    deleteType = type;
    document.getElementById('deleteConfirmText').textContent = `Voulez-vous supprimer : "${label}" ?`;
    document.getElementById('deleteModal').classList.add('active');
    document.getElementById('confirmDeleteBtn').onclick = async () => {
        try {
            const fns = { airport: 'deleteAirport', airline: 'deleteAirline', aircraft: 'deleteAircraft', user: 'deleteUser' };
            await window.adminService[fns[deleteType]](deleteId);
            showNotification('Supprimé avec succès', 'success');
        } catch (err) {
            showNotification('Erreur lors de la suppression', 'error');
        }
        document.getElementById('deleteModal').classList.remove('active');
    };
};

window.closeDeleteModal = function() {
    document.getElementById('deleteModal').classList.remove('active');
};

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => {
        if (e.target === m) m.classList.remove('active');
    });
});

// ============================================
// HELPERS
// ============================================
function esc(text) {
    if (!text) return '';
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
