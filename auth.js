// ═══════════════════════════════════════════════════════════════
//  ANAC AUTH v5 — Firebase Authentication + Cloud Functions
//  ─────────────────────────────────────────────────────────────
//  • AUCUN mot de passe n'est lu, écrit ou stocké dans Firestore.
//    Firebase Authentication est la seule source de vérité.
//  • L'e-mail interne est DÉRIVÉ de l'identifiant
//    (DADY → dady@sgv-anac.local) : aucune lecture Firestore
//    n'est nécessaire AVANT l'authentification.
//  • La création / réinitialisation / suppression de comptes
//    passe par des Cloud Functions (SDK Admin, côté serveur).
//  • L'identifiant DADY reste le compte de secours ; il est adossé
//    à un vrai compte Firebase (créé au bootstrap) portant le claim
//    admin. Le filet de secours est conservé mais son mot de passe
//    n'existe dans le code que sous forme d'empreinte SHA-256.
// ═══════════════════════════════════════════════════════════════

const FB_CONFIG = {
  apiKey:"AIzaSyCHzrNNRL1MrBCCqxc-1wso9gcBwBztO40",
  authDomain:"anacmr-67835.firebaseapp.com",
  projectId:"anacmr-67835",
  storageBucket:"anacmr-67835.firebasestorage.app",
  messagingSenderId:"906668222910",
  appId:"1:906668222910:web:19d92b627f155bd2dbb1ef"
};

const FUNCTIONS_REGION = 'europe-west1';

export const AUTH_SESSION_KEY = 'anac_auth_v4';
export const FALLBACK_USER = 'DADY';
// Le mot de passe du filet de secours n'est PLUS stocké en clair.
// On ne conserve que son empreinte SHA-256 (irréversible) : le code
// peut vérifier un mot de passe sans jamais le contenir. Lire ce
// fichier ne révèle aucun secret exploitable.
const FALLBACK_PASS_SHA256 = '1b24b5004bd90d5fdace6cbf87b062892d1de27dabb14fb8c1dc05354412fa84';

// Calcule l'empreinte SHA-256 d'une chaîne (hex minuscule).
async function _sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Vrai si le mot de passe saisi correspond à l'empreinte du filet.
async function _isFallbackPass(pass) {
  try {
    const h = await _sha256Hex(String(pass || ''));
    // Comparaison simple ; l'empreinte n'étant pas un secret, pas
    // besoin de comparaison à temps constant ici.
    return h === FALLBACK_PASS_SHA256;
  } catch (e) { return false; }
}

const EMAIL_DOMAIN = 'sgv-anac.local';

function usernameToEmail(username) {
  return (username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') + '@' + EMAIL_DOMAIN;
}

export const ALL_PERMISSIONS = {
  'view_flights':       { label:'Voir la liste des vols',          group:'Vols' },
  'add_flight':         { label:'Ajouter un vol',                  group:'Vols' },
  'edit_flight':        { label:'Modifier un vol',                 group:'Vols' },
  'delete_flight':      { label:'Supprimer un vol',                group:'Vols' },
  'export_flights':     { label:'Exporter Excel des vols',         group:'Vols' },
  'view_charts':        { label:'Voir Diagrammes & Rapports',      group:'Vols' },
  'view_facturation':   { label:"Voir Ordre d'émission",           group:'Vols' },
  'view_map':           { label:'Voir la carte des vols',          group:'Carte' },
  'export_map':         { label:'Exporter la carte',               group:'Carte' },
  'access_ldm':         { label:'Accéder à la page LDM/MVT',       group:'LDM/MVT' },
  'access_suivi':       { label:'Accéder au Suivi Hebdomadaire',   group:'Suivi Hebdomadaire' },
  'manage_aircraft':    { label:'Gérer les immatriculations (Suivi)', group:'Suivi Hebdomadaire' },
  'access_ma':          { label:'Accéder à la page Mauritanie Airlines', group:'Mauritanie Airlines' },
  'access_admin':       { label:"Accéder à la page d'administration", group:'Administration' },
};

export const ROLES = {
  'admin': {
    label: 'Administrateur',
    desc: 'Accès complet (toutes les permissions)',
    permissions: '*'
  },
  'operator': {
    label: 'Opérateur',
    desc: 'Vols + LDM/MVT + Suivi + Admin',
    permissions: [
      'view_flights','add_flight','edit_flight','export_flights','view_charts','view_facturation',
      'view_map','export_map','access_ldm','access_suivi','manage_aircraft','access_ma','access_admin'
    ]
  },
  'reader': {
    label: 'Lecteur',
    desc: 'Consultation seule (aucune modification)',
    permissions: [
      'view_flights','view_charts','view_facturation','view_map','access_ldm','access_suivi','access_ma'
    ]
  },
  'custom': {
    label: 'Personnalisé',
    desc: "Permissions choisies à l'unité",
    permissions: []
  }
};

// ── Firebase setup ───────────────────────────────────────────────
let _app = null, _db = null, _auth = null, _functions = null;

async function getApp() {
  if (_app) return _app;
  const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
  const apps = getApps();
  _app = apps.find(a => a.name === 'anac-auth') || initializeApp(FB_CONFIG, 'anac-auth');
  return _app;
}
async function getDB() {
  if (_db) return _db;
  const app = await getApp();
  const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  _db = getFirestore(app);
  return _db;
}
async function getAuth() {
  if (_auth) return _auth;
  const app = await getApp();
  const m = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
  _auth = m.getAuth(app);
  try { await m.setPersistence(_auth, m.browserSessionPersistence); } catch(e) {}
  return _auth;
}
async function getFunctions() {
  if (_functions) return _functions;
  const app = await getApp();
  const m = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
  _functions = m.getFunctions(app, FUNCTIONS_REGION);
  return _functions;
}
async function callFn(name, data) {
  // ── S'assurer que la session Firebase de DADY (ou de l'admin) est
  //    active et liée à la MÊME app que l'instance Functions, pour
  //    que le jeton d'authentification parte avec l'appel.
  //    Sans ça : 401 Unauthorized (la fonction reçoit un appel
  //    anonyme et le refuse). ──
  const auth = await getAuth();          // instance Auth de l'app 'anac-auth'
  const A = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

  // Si pas connecté côté Firebase : reconnecter avec la session locale.
  if (!auth.currentUser) {
    const s = getSession();
    if (s && s.username) {
      const email = usernameToEmail(s.username);
      // Mot de passe non stocké : on tente une reconnexion silencieuse
      // uniquement possible si une session Firebase persiste déjà.
      // Sinon on attend brièvement qu'elle se rétablisse.
      await new Promise((resolve) => {
        if (auth.currentUser) return resolve();
        const unsub = A.onAuthStateChanged(auth, (u) => { if (u) { unsub(); resolve(); } });
        setTimeout(() => { try{unsub();}catch(e){} resolve(); }, 4000);
      });
    }
  }

  if (!auth.currentUser) {
    throw new Error('Session Firebase expirée — reconnectez-vous (déconnexion puis reconnexion DADY).');
  }

  // Forcer un jeton frais (le claim admin doit être présent).
  try { await auth.currentUser.getIdToken(true); } catch(e) {}

  const app = await getApp();
  const m = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
  // Instance Functions créée à partir de la MÊME app que Auth :
  // le SDK joint alors automatiquement le jeton à l'appel.
  const fns = m.getFunctions(app, FUNCTIONS_REGION);
  const res = await m.httpsCallable(fns, name)(data || {});
  return res.data;
}

// ── Session locale ───────────────────────────────────────────────
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
export function isLoggedIn() { return !!getSession(); }
export function currentUser() { return getSession(); }

// ── Permissions ──────────────────────────────────────────────────
// Alias hérités : l'ancien panneau admin stockait des clés courtes
// ('ldm', 'admin', …). On accepte les deux écritures pour compatibilité.
const PERM_ALIASES = {
  'access_ldm':       'ldm',
  'access_admin':     'admin',
  'view_facturation': 'facturation',
  'access_suivi':     'suivi',
  'manage_aircraft':  'aircraft'
};
export function hasPerm(perm) {
  const s = getSession();
  if (!s) return false;
  if (s.username === FALLBACK_USER) return true;
  if (s.role === 'admin') return true;
  // Rôles standards : résolus dynamiquement depuis ROLES (les sessions déjà
  // ouvertes bénéficient ainsi des nouvelles permissions sans reconnexion).
  if (s.role && s.role !== 'custom' && ROLES[s.role]) {
    const rolePerms = resolvePermissions(s.role, null);
    if (rolePerms.includes(perm)) return true;
  }
  if (!Array.isArray(s.permissions)) return false;
  if (s.permissions.includes(perm)) return true;
  const alias = PERM_ALIASES[perm];
  return alias ? s.permissions.includes(alias) : false;
}
export function resolvePermissions(role, customPerms) {
  const r = ROLES[role];
  if (!r) return [];
  if (r.permissions === '*') return Object.keys(ALL_PERMISSIONS);
  if (role === 'custom') return Array.isArray(customPerms) ? customPerms : [];
  return r.permissions.slice();
}

// Compat : la consultation des mots de passe est SUPPRIMÉE (sécurité).
// Stubs conservés pour ne pas casser les pages qui les appellent.
export function decHint() { return ''; }
export function getPasswordHint() { return ''; }

// ── Authentification ─────────────────────────────────────────────
function newSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,10);
}

async function loadProfileByUid(uid) {
  const db = await getDB();
  const { collection, query, where, getDocs } =
    await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const snap = await getDocs(query(collection(db,'anac_users'), where('uid','==',uid)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id:d.id, ...d.data() };
}

export async function login(username, password) {
  const uname = (username || '').trim();
  const pass  = password || '';
  if (!uname || !pass) return { ok:false, error:'Veuillez remplir tous les champs.' };

  const auth = await getAuth();
  const A = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
  const email = usernameToEmail(uname);

  // Connexion Firebase Auth directe (e-mail dérivé, aucune lecture
  // Firestore préalable). Vaut aussi pour DADY (compte réel
  // dady@sgv-anac.local créé au bootstrap).
  let cred = null;
  try {
    cred = await A.signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    // FILET DE SECOURS DADY : si le compte réel n'existe pas encore
    // (bootstrap non exécuté) ou panne, on autorise l'accès local
    // pour ne JAMAIS être verrouillé dehors. Mode dégradé : la
    // gestion des comptes via Cloud Function exigera le compte réel.
    if (uname === FALLBACK_USER && await _isFallbackPass(pass)) {
      const sid = newSessionId();
      saveSession({
        username: FALLBACK_USER, role: 'admin',
        permissions: Object.keys(ALL_PERMISSIONS),
        sessionId: sid, isFallback: true
      });
      try { if (!auth.currentUser) await A.signInAnonymously(auth); } catch(e) {}
      await logActivity('login_success', uname, 'Compte de secours (mode dégradé)');
      return { ok:true, degraded:true };
    }
    await logActivity('login_failed', uname, 'Identifiants invalides');
    return { ok:false, error:'Identifiants incorrects' };
  }

  // Authentifié : chargement du profil (rôle/permissions).
  let profile = null;
  try { profile = await loadProfileByUid(cred.user.uid); } catch(e) {}

  if (profile && profile.disabled) {
    try { await A.signOut(auth); } catch(e) {}
    await logActivity('login_failed', uname, 'Compte désactivé');
    return { ok:false, error:'Compte désactivé' };
  }

  const isDady = uname.toUpperCase() === FALLBACK_USER;
  const role   = profile ? (profile.role || 'custom') : (isDady ? 'admin' : 'custom');
  const perms  = isDady
    ? Object.keys(ALL_PERMISSIONS)
    : resolvePermissions(role, profile && profile.permissions);

  const sid = newSessionId();
  if (profile && profile.id) {
    try {
      const db = await getDB();
      const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      await updateDoc(doc(db,'anac_users',profile.id), {
        currentSessionId: sid, lastLoginAt: new Date().toISOString()
      });
    } catch(e) {}
  }

  saveSession({
    username: profile ? profile.username : uname,
    role, permissions: perms, sessionId: sid,
    docId: profile ? profile.id : null,
    uid: cred.user.uid,
    isFallback: false
  });

  await logActivity('login_success', uname, `Rôle: ${role}`);
  return { ok:true };
}

export async function logout() {
  const s = getSession();
  if (s) {
    await logActivity('logout', s.username, '');
    if (s.docId) {
      try {
        const db = await getDB();
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await updateDoc(doc(db,'anac_users',s.docId), { currentSessionId: null });
      } catch(e) {}
    }
    try {
      const auth = await getAuth();
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      await signOut(auth);
    } catch(e) {}
  }
  clearSession();
  location.href = 'login.html';
}

// ── Single-device watcher ────────────────────────────────────────
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
      const data = snap.data();
      if (data.disabled) {
        stopSessionWatcher();
        clearSession();
        alert('Votre compte a été désactivé.');
        location.href = 'login.html';
        return;
      }
      const serverSid = data.currentSessionId;
      if (serverSid && serverSid !== cur.sessionId) {
        stopSessionWatcher();
        clearSession();
        alert('Votre session a été ouverte sur un autre appareil. Vous avez été déconnecté.');
        location.href = 'login.html';
      }
    } catch(e) {}
  }, 6000);
}

export function stopSessionWatcher() {
  if (_sessionCheckInterval) {
    clearInterval(_sessionCheckInterval);
    _sessionCheckInterval = null;
  }
}

// ── Garde de page ────────────────────────────────────────────────
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
// AUTHENTIFICATION PARTAGÉE ENTRE PAGES
// Chaque page a sa propre connexion Firebase. ensureAuthed(app)
// connecte l'instance en réutilisant le jeton de l'app 'anac-auth'
// si une session réelle existe, sinon en anonyme (mode public /
// DADY dégradé). La règle métier exige seulement une session.
// ─────────────────────────────────────────────────────────────────
const _authedApps = new WeakSet();

export async function ensureAuthed(app) {
  if (!app) return false;
  if (_authedApps.has(app)) return true;

  const A = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
  let auth;
  try {
    auth = A.getAuth(app);
    try { await A.setPersistence(auth, A.browserSessionPersistence); } catch(e) {}
  } catch(e) { return false; }

  if (auth.currentUser) { _authedApps.add(app); return true; }

  // Mode public (carte) → connexion anonyme
  if (typeof window !== 'undefined' && window.ANAC_PUBLIC_MODE) {
    try {
      await A.signInAnonymously(auth);
      await _waitAuth(A, auth);
      _authedApps.add(app);
      return true;
    } catch(e) { console.warn('Anon auth:', e && e.message); return false; }
  }

  // Anonyme : suffisant pour lire les données métier (la règle
  // exige uniquement request.auth != null). Les opérations
  // sensibles (comptes) passent par Cloud Functions qui vérifient
  // le claim admin séparément.
  try {
    await A.signInAnonymously(auth);
    await _waitAuth(A, auth);
    _authedApps.add(app);
    return true;
  } catch(e) { console.warn('ensureAuthed anon:', e && e.message); return false; }
}

function _waitAuth(A, auth) {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve();
    const unsub = A.onAuthStateChanged(auth, (u) => { if (u) { unsub(); resolve(); } });
    setTimeout(resolve, 5000);
  });
}

// ── Gestion utilisateurs (via Cloud Functions) ───────────────────
export async function listUsers() {
  // S'assurer qu'une session Firebase est active sur l'app 'anac-auth'
  // AVANT de lire (la règle exige request.auth != null). Sans ça,
  // au chargement de admin.html : "Missing or insufficient permissions".
  const auth = await getAuth();
  const A = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
  if (!auth.currentUser) {
    // Attendre une session déjà en cours d'établissement (login DADY)
    await new Promise((resolve) => {
      if (auth.currentUser) return resolve();
      const unsub = A.onAuthStateChanged(auth, (u) => { if (u) { try{unsub();}catch(e){} resolve(); } });
      setTimeout(() => { try{unsub();}catch(e){} resolve(); }, 5000);
    });
  }
  if (!auth.currentUser) {
    // Toujours rien : connexion anonyme (suffisante pour LIRE).
    try { await A.signInAnonymously(auth); } catch(e) {}
    await new Promise((resolve) => {
      if (auth.currentUser) return resolve();
      const unsub = A.onAuthStateChanged(auth, (u) => { if (u) { try{unsub();}catch(e){} resolve(); } });
      setTimeout(() => { try{unsub();}catch(e){} resolve(); }, 5000);
    });
  }
  if (!auth.currentUser) {
    throw new Error('Session Firebase non établie — reconnectez-vous (DADY).');
  }
  try { await auth.currentUser.getIdToken(); } catch(e) {}

  const db = await getDB();
  const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const snap = await getDocs(collection(db,'anac_users'));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export async function createUser({ username, password, role, permissions }) {
  const uname = (username || '').trim();
  if (!uname) throw new Error('Identifiant requis');
  if (uname.toUpperCase() === FALLBACK_USER) throw new Error('Identifiant réservé');
  if (!password) throw new Error('Mot de passe requis');
  if (password.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères');
  try {
    const r = await callFn('adminCreateUser', { username:uname, password, role, permissions });
    if (!r || !r.ok) throw new Error('Échec de la création');
  } catch(e) {
    throw new Error(_fnErr(e, 'Erreur création compte'));
  }
}

export async function updateUser(userId, fields) {
  fields = fields || {};
  // Réinitialisation de mot de passe → Cloud Function dédiée.
  if (fields.password) {
    try {
      await callFn('adminSetPassword', { docId:userId, newPassword:fields.password });
    } catch(e) {
      throw new Error(_fnErr(e, 'Erreur réinitialisation mot de passe'));
    }
    const { password, ...rest } = fields;
    if (Object.keys(rest).length === 0) return;
    fields = rest;
  }
  if (fields.role !== undefined || fields.permissions !== undefined || fields.disabled !== undefined) {
    try {
      await callFn('adminUpdateUser', {
        docId:userId,
        role:fields.role, permissions:fields.permissions, disabled:fields.disabled
      });
    } catch(e) {
      throw new Error(_fnErr(e, 'Erreur mise à jour du compte'));
    }
  }
}

export async function deleteUser(userId) {
  try {
    await callFn('adminDeleteUser', { docId:userId });
  } catch(e) {
    throw new Error(_fnErr(e, 'Erreur suppression du compte'));
  }
}

// Réinitialisation explicite (mot de passe oublié)
export async function resetPassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Le nouveau mot de passe doit faire au moins 6 caractères');
  }
  try {
    await callFn('adminSetPassword', { docId:userId, newPassword });
  } catch(e) {
    throw new Error(_fnErr(e, 'Erreur réinitialisation mot de passe'));
  }
}

function _fnErr(e, fallback) {
  const msg = (e && (e.message || (e.details && e.details.message))) || '';
  if (/unauthenticated|permission-denied|droits|administration/i.test(msg)) {
    return 'Action réservée à un administrateur connecté (compte réel requis). ' +
           'En mode dégradé DADY : exécutez le bootstrap puis reconnectez-vous.';
  }
  return fallback + (msg ? ' : ' + msg : '');
}

// ── Journal d'activité ───────────────────────────────────────────
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
  } catch(e) {}
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

// ── Exposition globale ───────────────────────────────────────────
window.ANAC_AUTH = {
  login, logout, getSession, currentUser, isLoggedIn, hasPerm,
  requireAuth, showNoPermissionScreen, startSessionWatcher, stopSessionWatcher,
  listUsers, createUser, updateUser, deleteUser, resetPassword, getPasswordHint,
  logActivity, getActivityLog, ensureAuthed,
  ALL_PERMISSIONS, ROLES, ACTION_LABELS, resolvePermissions,
  FALLBACK_USER
};
