// ═══════════════════════════════════════════════════════════════
//  ANAC AUTH v4 — Firebase Authentication intégré
//  ─────────────────────────────────────────────────────────────
//  Les mots de passe sont gérés et chiffrés par Firebase
//  Authentication (Google). L'utilisateur tape un identifiant
//  simple (ex: HOUDA) transformé en interne en houda@sgv-anac.local
//
//  Migration auto : un ancien compte (champ password) est migré
//  vers Firebase Auth à sa première connexion.
//
//  Compte de secours DADY : codé en dur, toujours actif.
// ═══════════════════════════════════════════════════════════════

const FB_CONFIG = {
  apiKey:"AIzaSyCHzrNNRL1MrBCCqxc-1wso9gcBwBztO40",
  authDomain:"anacmr-67835.firebaseapp.com",
  projectId:"anacmr-67835",
  storageBucket:"anacmr-67835.firebasestorage.app",
  messagingSenderId:"906668222910",
  appId:"1:906668222910:web:19d92b627f155bd2dbb1ef"
};

export const AUTH_SESSION_KEY = 'anac_auth_v4';
export const FALLBACK_USER = 'DADY';
export const FALLBACK_PASS = 'ANACdady';

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
    desc: 'Vols + LDM/MVT + Admin',
    permissions: [
      'view_flights','add_flight','edit_flight','export_flights','view_charts','view_facturation',
      'view_map','export_map','access_ldm','access_ma','access_admin'
    ]
  },
  'reader': {
    label: 'Lecteur',
    desc: 'Consultation seule (aucune modification)',
    permissions: [
      'view_flights','view_charts','view_facturation','view_map','access_ldm','access_ma'
    ]
  },
  'custom': {
    label: 'Personnalisé',
    desc: "Permissions choisies à l'unité",
    permissions: []
  }
};

// ── Firebase setup ───────────────────────────────────────────────
let _app = null, _db = null, _auth = null;

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

// ── Chiffrement léger du pwHint (consultation DADY uniquement) ────
const _PW_KEY = 'anac-sgv-2026-key';
function _xor(str, key) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}
function encHint(plain) {
  try { return btoa(unescape(encodeURIComponent(_xor(plain, _PW_KEY)))); }
  catch { return ''; }
}
export function decHint(enc) {
  try { return _xor(decodeURIComponent(escape(atob(enc))), _PW_KEY); }
  catch { return ''; }
}

// ── Authentification ─────────────────────────────────────────────
function newSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,10);
}

export async function login(username, password) {
  const uname = (username || '').trim();
  const pass  = password || '';

  if (!uname || !pass) return { ok:false, error:'Veuillez remplir tous les champs.' };

  // 1. Compte de secours DADY
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
    const { collection, getDocs, doc, updateDoc } =
      await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    const allSnap = await getDocs(collection(db,'anac_users'));
    const match = allSnap.docs.find(d =>
      (d.data().username || '').toLowerCase() === uname.toLowerCase()
    );

    if (!match) {
      await logActivity('login_failed', uname, 'Utilisateur introuvable');
      return { ok:false, error:'Identifiants incorrects' };
    }

    const userDoc = match;
    const user    = userDoc.data();
    const email   = user.email || usernameToEmail(user.username);

    if (user.disabled) {
      await logActivity('login_failed', uname, 'Compte désactivé');
      return { ok:false, error:'Compte désactivé' };
    }

    const auth = await getAuth();
    const A = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

    let uid = user.uid || null;

    // CAS 1 : mot de passe en attente (réinitialisé par admin) → re-créer Auth
    if (user.pendingPassword) {
      if (pass !== user.pendingPassword) {
        await logActivity('login_failed', uname, 'Mot de passe invalide');
        return { ok:false, error:'Identifiants incorrects' };
      }
      try {
        let cred;
        try {
          cred = await A.createUserWithEmailAndPassword(auth, email, pass);
        } catch(ce) {
          if (ce.code === 'auth/email-already-in-use') {
            // Ancien compte Auth existe — impossible de changer son mdp côté client.
            // On utilise un email versionné pour repartir proprement.
            const vEmail = email.replace('@', '+' + Date.now().toString(36) + '@');
            cred = await A.createUserWithEmailAndPassword(auth, vEmail, pass);
            await updateDoc(doc(db,'anac_users',userDoc.id), { email: vEmail });
          } else { throw ce; }
        }
        uid = cred.user.uid;
        await updateDoc(doc(db,'anac_users',userDoc.id), {
          uid,
          pwHint: encHint(pass),
          pendingPassword: null,
          password: null
        });
      } catch(me) {
        console.error('Reset migration error:', me);
        return { ok:false, error:'Erreur de connexion. Contactez DADY.' };
      }
    }
    // CAS 2 : compte déjà migré → connexion Auth normale
    else if (uid) {
      try {
        const cred = await A.signInWithEmailAndPassword(auth, email, pass);
        uid = cred.user.uid;
      } catch(err) {
        await logActivity('login_failed', uname, 'Mot de passe invalide');
        return { ok:false, error:'Identifiants incorrects' };
      }
    }
    // CAS 3 : ancien compte (champ password) → migration auto
    else if (typeof user.password === 'string' && user.password !== null) {
      if (user.password !== pass) {
        await logActivity('login_failed', uname, 'Mot de passe invalide');
        return { ok:false, error:'Identifiants incorrects' };
      }
      try {
        let cred;
        try {
          cred = await A.createUserWithEmailAndPassword(auth, email, pass);
        } catch(ce) {
          if (ce.code === 'auth/email-already-in-use') {
            cred = await A.signInWithEmailAndPassword(auth, email, pass);
          } else { throw ce; }
        }
        uid = cred.user.uid;
        await updateDoc(doc(db,'anac_users',userDoc.id), {
          uid,
          email,
          pwHint: encHint(pass),
          password: null,
          migratedAt: new Date().toISOString()
        });
      } catch(me) {
        console.error('Migration error:', me);
        return { ok:false, error:'Erreur de migration. Contactez DADY.' };
      }
    }
    else {
      await logActivity('login_failed', uname, 'Compte non configuré');
      return { ok:false, error:'Identifiants incorrects' };
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
      docId: userDoc.id,
      uid,
      // Identifiants techniques pour ré-authentifier les autres
      // connexions Firebase des autres pages (reste dans ce navigateur,
      // sessionStorage effacé à la fermeture). Le mot de passe réel
      // est géré/chiffré par Firebase Auth ; ceci sert uniquement à
      // garder toutes les pages authentifiées de façon cohérente.
      _e: email,
      _k: btoa(unescape(encodeURIComponent(pass)))
    });

    await logActivity('login_success', uname, `Rôle: ${user.role || 'custom'}`);
    return { ok:true };

  } catch(e) {
    console.error('Auth error:', e);
    return { ok:false, error:'Erreur de connexion. Réessayez.' };
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
// Chaque page a sa propre connexion Firebase (app-arch, ldm, vols…).
// Firebase Auth est par-instance : il faut authentifier CHAQUE
// instance. ensureAuthed(app) connecte l'instance donnée :
//   • utilisateur connecté  → signInWithEmailAndPassword
//   • mode public / DADY    → signInAnonymously
// Idempotent : ne refait rien si déjà authentifié.
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

  // Mode public → connexion anonyme
  if (typeof window !== 'undefined' && window.ANAC_PUBLIC_MODE) {
    try {
      await A.signInAnonymously(auth);
      await _waitAuth(A, auth);
      _authedApps.add(app);
      return true;
    } catch(e) { console.warn('Anon auth:', e && e.message); return false; }
  }

  const s = getSession();
  // Compte de secours DADY : pas de compte Firebase réel → anonyme
  if (s && s.isFallback) {
    try {
      await A.signInAnonymously(auth);
      await _waitAuth(A, auth);
      _authedApps.add(app);
      return true;
    } catch(e) { console.warn('Fallback auth:', e && e.message); return false; }
  }
  // Utilisateur normal → ré-auth avec identifiants stockés
  if (s && s._e && s._k) {
    try {
      const pass = decodeURIComponent(escape(atob(s._k)));
      await A.signInWithEmailAndPassword(auth, s._e, pass);
      await _waitAuth(A, auth);
      _authedApps.add(app);
      return true;
    } catch(e) { console.warn('Reauth:', e && e.message); return false; }
  }
  return false;
}

function _waitAuth(A, auth) {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve();
    const unsub = A.onAuthStateChanged(auth, (u) => { if (u) { unsub(); resolve(); } });
    setTimeout(resolve, 5000);
  });
}

// ── Gestion utilisateurs ─────────────────────────────────────────
export async function listUsers() {
  const db = await getDB();
  const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const snap = await getDocs(collection(db,'anac_users'));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export async function createUser({ username, password, role, permissions, createdBy }) {
  const db = await getDB();
  const { collection, addDoc, getDocs } =
    await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const uname = (username || '').trim();
  if (!uname) throw new Error('Identifiant requis');
  if (uname.toUpperCase() === FALLBACK_USER) throw new Error('Identifiant réservé');
  if (!password) throw new Error('Mot de passe requis');
  if (password.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères');

  const allSnap = await getDocs(collection(db,'anac_users'));
  const exists = allSnap.docs.some(d => (d.data().username || '').toLowerCase() === uname.toLowerCase());
  if (exists) throw new Error('Cet identifiant existe déjà');

  const email = usernameToEmail(uname);
  const auth = await getAuth();
  const A = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

  let uid;
  try {
    const cred = await A.createUserWithEmailAndPassword(auth, email, password);
    uid = cred.user.uid;
    await A.signOut(auth);   // ne pas casser la session de l'admin
  } catch(ce) {
    if (ce.code === 'auth/email-already-in-use') {
      // Email déjà pris dans Auth — utiliser une variante versionnée
      const vEmail = email.replace('@', '+' + Date.now().toString(36) + '@');
      try {
        const cred = await A.createUserWithEmailAndPassword(auth, vEmail, password);
        uid = cred.user.uid;
        await A.signOut(auth);
        await addDoc(collection(db,'anac_users'), {
          username: uname, email: vEmail, uid, pwHint: encHint(password),
          role: role || 'custom', permissions: permissions || [],
          disabled: false, createdAt: new Date().toISOString(),
          createdBy: createdBy || 'SYSTEM', currentSessionId: null
        });
        return;
      } catch(e2) {
        throw new Error('Erreur création compte : ' + e2.message);
      }
    }
    if (ce.code === 'auth/weak-password') throw new Error('Mot de passe trop faible (minimum 6 caractères)');
    throw new Error('Erreur création compte : ' + ce.message);
  }

  await addDoc(collection(db,'anac_users'), {
    username: uname, email, uid, pwHint: encHint(password),
    role: role || 'custom', permissions: permissions || [],
    disabled: false, createdAt: new Date().toISOString(),
    createdBy: createdBy || 'SYSTEM', currentSessionId: null
  });
}

export async function updateUser(userId, fields) {
  const db = await getDB();
  const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

  if (fields.password) {
    // Le changement de mot de passe d'un autre utilisateur ne peut pas se
    // faire côté client. On le stocke en attente : il sera appliqué (et le
    // compte Auth recréé) lors de la prochaine connexion de l'utilisateur.
    fields.pwHint = encHint(fields.password);
    fields.pendingPassword = fields.password;
    fields.uid = null;
    delete fields.password;
  }

  if (fields.role || fields.permissions || fields.disabled !== undefined) {
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

// Indice de mot de passe (réservé DADY)
export function getPasswordHint(userObj) {
  if (!userObj) return '';
  if (userObj.pendingPassword) return userObj.pendingPassword;
  if (userObj.pwHint) return decHint(userObj.pwHint);
  if (userObj.password) return userObj.password;
  return '';
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
  listUsers, createUser, updateUser, deleteUser, getPasswordHint,
  logActivity, getActivityLog, ensureAuthed,
  ALL_PERMISSIONS, ROLES, ACTION_LABELS, resolvePermissions,
  FALLBACK_USER
};
