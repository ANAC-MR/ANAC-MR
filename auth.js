// ═══════════════════════════════════════════════════════════════
//  ANAC AUTH v3 — Système complet
//  ─────────────────────────────────────────────────────────────
//  Collections Firestore :
//    • anac_users         { username, password, role, permissions[], currentSessionId, lastLoginAt, createdAt, createdBy }
//    • anac_activity_log  { ts, username, action, target, details }
//
//  Session locale (sessionStorage 'anac_auth_v3') :
//    { username, role, permissions[], sessionId, ts }
//
//  Compte de secours codé en dur : DADY / Yahya100 (jamais visible
//  dans la liste, jamais désactivable).
// ═══════════════════════════════════════════════════════════════

const FB_CONFIG = {
  apiKey:"AIzaSyCHzrNNRL1MrBCCqxc-1wso9gcBwBztO40",
  authDomain:"anacmr-67835.firebaseapp.com",
  projectId:"anacmr-67835",
  storageBucket:"anacmr-67835.firebasestorage.app",
  messagingSenderId:"906668222910",
  appId:"1:906668222910:web:19d92b627f155bd2dbb1ef"
};

export const AUTH_SESSION_KEY = 'anac_auth_v3';
export const FALLBACK_USER = 'DADY';
export const FALLBACK_PASS = 'Yahya100';

// ── Catalogue COMPLET des permissions ────────────────────────────
export const ALL_PERMISSIONS = {
  // Page Accueil / Vols (granularité fine)
  'view_flights':       { label:'Voir la liste des vols',          group:'Vols' },
  'add_flight':         { label:'Ajouter un vol',                  group:'Vols' },
  'edit_flight':        { label:'Modifier un vol',                 group:'Vols' },
  'delete_flight':      { label:'Supprimer un vol',                group:'Vols' },
  'export_flights':     { label:'Exporter Excel des vols',         group:'Vols' },
  'view_charts':        { label:'Voir Diagrammes & Rapports',      group:'Vols' },
  'view_facturation':   { label:"Voir Ordre d'émission",           group:'Vols' },

  // Carte des vols (granularité fine)
  'view_map':           { label:'Voir la carte des vols',          group:'Carte' },
  'export_map':         { label:'Exporter la carte',               group:'Carte' },

  // LDM / MVT — UNE SEULE PERMISSION POUR TOUTE LA PAGE
  'access_ldm':         { label:'Accéder à la page LDM/MVT',       group:'LDM/MVT' },

  // Mauritanie Airlines — UNE SEULE PERMISSION POUR TOUTE LA PAGE
  'access_ma':          { label:'Accéder à la page Mauritanie Airlines', group:'Mauritanie Airlines' },

  // Administration — UNE SEULE PERMISSION POUR TOUTE LA PAGE
  'access_admin':       { label:"Accéder à la page d'administration", group:'Administration' },

  // Sécurité & Utilisateurs : JAMAIS délégable — réservé au compte DADY uniquement
};

// ── Rôles prédéfinis ──────────────────────────────────────────────
export const ROLES = {
  'admin': {
    label: 'Administrateur',
    desc: 'Accès complet (toutes les permissions)',
    permissions: '*'
  },
  'operator': {
    label: 'Opérateur',
    desc: 'Vols + LDM/MVT + Admin',
    permissions: [
      'view_flights','add_flight','edit_flight','export_flights','view_charts','view_facturation',
      'view_map','export_map',
      'access_ldm',
      'access_ma',
      'access_admin'
    ]
  },
  'reader': {
    label: 'Lecteur',
    desc: 'Consultation seule (aucune modification)',
    permissions: [
      'view_flights','view_charts','view_facturation',
      'view_map',
      'access_ldm',
      'access_ma'
    ]
  },
  'custom': {
    label: 'Personnalisé',
    desc: "Permissions choisies à l'unité",
    permissions: []
  }
};

// ─────────────────────────────────────────────────────────────────
// FIREBASE SETUP
// ─────────────────────────────────────────────────────────────────
let _db = null;
async function getDB() {
  if (_db) return _db;
  const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
  const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const apps = getApps();
  const app  = apps.find(a => a.name === 'anac-auth') || initializeApp(FB_CONFIG, 'anac-auth');
  _db = getFirestore(app);
  return _db;
}

// ─────────────────────────────────────────────────────────────────
// SESSION LOCALE (sessionStorage)
// ─────────────────────────────────────────────────────────────────
export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY)); }
  catch { return null; }
}
export function saveSession(data) {
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ ...data, ts: Date.now() }));
}
export function clearSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}
export function isLoggedIn() {
  return !!getSession();
}
export function currentUser() {
  return getSession();
}

// ─────────────────────────────────────────────────────────────────
// PERMISSIONS
// ─────────────────────────────────────────────────────────────────
export function hasPerm(perm) {
  const s = getSession();
  if (!s) return false;
  if (s.username === FALLBACK_USER) return true;
  if (s.role === 'admin') return true;
  return Array.isArray(s.permissions) && s.permissions.includes(perm);
}

export function resolvePermissions(role, customPerms) {
  const r = ROLES[role];
  if (!r) return [];
  if (r.permissions === '*') return Object.keys(ALL_PERMISSIONS);
  if (role === 'custom') return Array.isArray(customPerms) ? customPerms : [];
  return r.permissions.slice();
}

// ─────────────────────────────────────────────────────────────────
// AUTHENTIFICATION
// ─────────────────────────────────────────────────────────────────
function newSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,10);
}

export async function login(username, password) {
  const uname = (username || '').trim();
  const pass  = password || '';

  // 1. Compte de secours codé en dur — toujours actif, jamais visible dans la liste
  // (DADY case-sensitive)
  if (uname === FALLBACK_USER && pass === FALLBACK_PASS) {
    const sid = newSessionId();
    saveSession({
      username: FALLBACK_USER,
      role: 'admin',
      permissions: Object.keys(ALL_PERMISSIONS),
      sessionId: sid,
      isFallback: true
    });
    await logActivity('login_success', uname, 'Compte de secours');
    return { ok:true };
  }

  try {
    const db = await getDB();
    const { collection, query, where, getDocs, doc, updateDoc } =
      await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    const q    = query(collection(db,'anac_users'), where('username','==',uname));
    const snap = await getDocs(q);

    if (snap.empty) {
      await logActivity('login_failed', uname, 'Utilisateur introuvable');
      return { ok:false, error:'Identifiants incorrects' };
    }

    const userDoc = snap.docs[0];
    const user    = userDoc.data();

    if (user.password !== pass) {
      await logActivity('login_failed', uname, 'Mot de passe invalide');
      return { ok:false, error:'Identifiants incorrects' };
    }

    if (user.disabled) {
      await logActivity('login_failed', uname, 'Compte désactivé');
      return { ok:false, error:'Compte désactivé' };
    }

    const sid = newSessionId();
    await updateDoc(doc(db,'anac_users',userDoc.id), {
      currentSessionId: sid,
      lastLoginAt: new Date().toISOString()
    });

    const perms = resolvePermissions(user.role || 'custom', user.permissions);

    saveSession({
      username: user.username,
      role: user.role || 'custom',
      permissions: perms,
      sessionId: sid,
      docId: userDoc.id
    });

    await logActivity('login_success', uname, `Rôle: ${user.role || 'custom'}`);
    return { ok:true };

  } catch(e) {
    console.error('Auth error:', e);
    return { ok:false, error:'Erreur de connexion: ' + e.message };
  }
}

export async function logout() {
  const s = getSession();
  if (s) {
    await logActivity('logout', s.username, '');
    if (!s.isFallback && s.docId) {
      try {
        const db = await getDB();
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await updateDoc(doc(db,'anac_users',s.docId), { currentSessionId: null });
      } catch(e) { /* silent */ }
    }
  }
  clearSession();
  location.href = 'login.html';
}

// ─────────────────────────────────────────────────────────────────
// VÉRIFICATION SINGLE-DEVICE (poll régulier)
// ─────────────────────────────────────────────────────────────────
let _sessionCheckInterval = null;

export function startSessionWatcher() {
  if (_sessionCheckInterval) return;
  const s = getSession();
  if (!s || s.isFallback || !s.docId) return;

  _sessionCheckInterval = setInterval(async () => {
    try {
      const cur = getSession();
      if (!cur || cur.isFallback) { stopSessionWatcher(); return; }

      const db = await getDB();
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      const snap = await getDoc(doc(db,'anac_users',cur.docId));
      if (!snap.exists()) {
        clearSession();
        alert('Votre compte a été supprimé. Vous allez être déconnecté.');
        location.href = 'login.html';
        return;
      }
      const serverSid = snap.data().currentSessionId;
      if (serverSid && serverSid !== cur.sessionId) {
        stopSessionWatcher();
        clearSession();
        alert('Votre session a été ouverte sur un autre appareil. Vous avez été déconnecté.');
        location.href = 'login.html';
      }
    } catch(e) { /* silent */ }
  }, 6000);
}

export function stopSessionWatcher() {
  if (_sessionCheckInterval) {
    clearInterval(_sessionCheckInterval);
    _sessionCheckInterval = null;
  }
}

// ─────────────────────────────────────────────────────────────────
// GARDE DE PAGE
// ─────────────────────────────────────────────────────────────────
export function requireAuth(requiredPerm) {
  const s = getSession();
  if (!s) {
    location.href = 'login.html';
    return false;
  }
  if (requiredPerm && !hasPerm(requiredPerm)) {
    showNoPermissionScreen();
    return false;
  }
  startSessionWatcher();
  return true;
}

export function showNoPermissionScreen() {
  document.body.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
                background:linear-gradient(135deg,#0F1E3D,#1A3A6B);z-index:99999;font-family:-apple-system,'Segoe UI',sans-serif;">
      <div style="background:#fff;border-radius:18px;padding:48px 40px;max-width:440px;width:90%;text-align:center;
                  box-shadow:0 30px 80px rgba(0,0,0,0.4);">
        <div style="font-size:60px;margin-bottom:18px;">🔒</div>
        <h2 style="color:#0F1E3D;font-size:22px;font-weight:700;margin:0 0 10px;">Accès refusé</h2>
        <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 28px;">
          Vous n'avez pas la permission d'accéder à cette page. Contactez l'administrateur si vous pensez qu'il s'agit d'une erreur.
        </p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button onclick="history.back()" style="padding:10px 20px;background:#f1f5f9;color:#1a2d45;border:1px solid #e2e8f0;border-radius:9px;font-weight:600;cursor:pointer;font-size:13px;">← Retour</button>
          <button onclick="location.href='index.html'" style="padding:10px 20px;background:linear-gradient(135deg,#0F1E3D,#1A3A6B);color:#D4AF37;border:1px solid #D4AF37;border-radius:9px;font-weight:600;cursor:pointer;font-size:13px;">Accueil</button>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────
// GESTION UTILISATEURS (admin only)
// ─────────────────────────────────────────────────────────────────
export async function listUsers() {
  const db = await getDB();
  const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const snap = await getDocs(collection(db,'anac_users'));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export async function createUser({ username, password, role, permissions, createdBy }) {
  const db = await getDB();
  const { collection, addDoc, query, where, getDocs } =
    await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const uname = (username || '').trim();
  if (!uname) throw new Error('Identifiant requis');
  if (uname.toUpperCase() === FALLBACK_USER) throw new Error('Identifiant réservé');
  if (!password) throw new Error('Mot de passe requis');

  // Vérifier unicité (insensible à la casse pour éviter collisions)
  const allSnap = await getDocs(collection(db,'anac_users'));
  const exists = allSnap.docs.some(d => (d.data().username || '').toLowerCase() === uname.toLowerCase());
  if (exists) throw new Error('Cet identifiant existe déjà');

  await addDoc(collection(db,'anac_users'), {
    username: uname,
    password,
    role: role || 'custom',
    permissions: permissions || [],
    disabled: false,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || 'SYSTEM',
    currentSessionId: null
  });
}

export async function updateUser(userId, fields) {
  const db = await getDB();
  const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  if (fields.password || fields.role || fields.permissions || fields.disabled) {
    fields.currentSessionId = null;
  }
  fields.updatedAt = new Date().toISOString();
  await updateDoc(doc(db,'anac_users',userId), fields);
}

export async function deleteUser(userId) {
  const db = await getDB();
  const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  await deleteDoc(doc(db,'anac_users',userId));
}

// ─────────────────────────────────────────────────────────────────
// JOURNAL D'ACTIVITÉ
// ─────────────────────────────────────────────────────────────────
export async function logActivity(action, target, details) {
  try {
    const db = await getDB();
    const { collection, addDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const s = getSession();
    await addDoc(collection(db,'anac_activity_log'), {
      ts: Date.now(),
      tsIso: new Date().toISOString(),
      username: (s ? s.username : target) || 'ANONYMOUS',
      action,
      target: target || '',
      details: details || ''
    });
  } catch(e) { /* silent — ne jamais bloquer l'app pour un échec de log */ }
}

export async function getActivityLog({ limit = 200, since = null } = {}) {
  const db = await getDB();
  const { collection, query, orderBy, limit: lim, where, getDocs } =
    await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  let q;
  if (since) q = query(collection(db,'anac_activity_log'), where('ts','>=',since), orderBy('ts','desc'), lim(limit));
  else       q = query(collection(db,'anac_activity_log'), orderBy('ts','desc'), lim(limit));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export const ACTION_LABELS = {
  'login_success':  '🔓 Connexion réussie',
  'login_failed':   '⛔ Échec de connexion',
  'logout':         '🚪 Déconnexion',
  'add_flight':     '➕ Ajout vol',
  'edit_flight':    '✏️ Modification vol',
  'delete_flight':  '🗑️ Suppression vol',
};

// ─────────────────────────────────────────────────────────────────
// EXPOSITION GLOBALE pour scripts non-modules
// ─────────────────────────────────────────────────────────────────
window.ANAC_AUTH = {
  login, logout, getSession, currentUser, isLoggedIn, hasPerm,
  requireAuth, showNoPermissionScreen, startSessionWatcher, stopSessionWatcher,
  listUsers, createUser, updateUser, deleteUser,
  logActivity, getActivityLog,
  ALL_PERMISSIONS, ROLES, ACTION_LABELS, resolvePermissions
};
