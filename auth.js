// ═══════════════════════════════════════════════════
//  ANAC AUTH — Module partagé
//  Stocke les comptes dans Firestore: collection 'anac_users'
//  Chaque doc: { username, password, role:'admin', createdAt, createdBy }
//  Session: sessionStorage 'anac_auth' = { username, role }
// ═══════════════════════════════════════════════════

const FB_CONFIG = {
  apiKey:"AIzaSyCHzrNNRL1MrBCCqxc-1wso9gcBwBztO40",
  authDomain:"anacmr-67835.firebaseapp.com",
  projectId:"anacmr-67835",
  storageBucket:"anacmr-67835.firebasestorage.app",
  messagingSenderId:"906668222910",
  appId:"1:906668222910:web:19d92b627f155bd2dbb1ef"
};
const AUTH_SESSION_KEY = 'anac_auth_v2';
const DEFAULT_USER = 'DADY';
const DEFAULT_PASS = 'ANACdady';

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

// ── Vérifier identifiants ──────────────────────────────────────
export async function checkCredentials(username, password) {
  try {
    const db = await getDB();
    const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    // Chercher dans anac_users
    const q    = query(collection(db,'anac_users'), where('username','==',username.toUpperCase()));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const user = snap.docs[0].data();
      if (user.password !== password) return { ok:false };
      return {
        ok: true,
        role: user.role || 'user',
        username: user.username,
        permissions: user.permissions || []
      };
    }
    // Fallback: compte admin par défaut (legacy DADY/ANACdady depuis cfg-auth)
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const cfg = await getDoc(doc(db,'flights','cfg-auth'));
    const storedUser = cfg.exists() ? (cfg.data().username || DEFAULT_USER) : DEFAULT_USER;
    const storedPass = cfg.exists() ? (cfg.data().password || DEFAULT_PASS) : DEFAULT_PASS;
    if (username.toUpperCase() === storedUser.toUpperCase() && password === storedPass) {
      return { ok:true, role:'admin', username: storedUser, permissions: ['admin','ldm','facturation','add_flight','edit_flight','delete_flight','import'] };
    }
    return { ok:false };
  } catch(e) {
    console.error('Auth error:', e);
    return { ok:false, error: e.message };
  }
}

// ── Session ────────────────────────────────────────────────────
export function saveSession(username, role, permissions) {
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    username, role,
    permissions: permissions || [],
    ts: Date.now()
  }));
}
export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY)); }
  catch { return null; }
}
export function clearSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

// Vérifier si l'utilisateur connecté a une permission spécifique
export function hasPerm(perm) {
  const s = getSession();
  if (!s) return false;
  if (s.role === 'admin') return true; // admin a tout
  return Array.isArray(s.permissions) && s.permissions.includes(perm);
}
export function isLoggedIn() {
  return !!getSession();
}

// ── Gestion utilisateurs (admin seulement) ────────────────────
export async function listUsers() {
  const db = await getDB();
  const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const snap = await getDocs(collection(db,'anac_users'));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export async function createUser(username, password, createdBy) {
  const db = await getDB();
  const { collection, addDoc, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  // Vérifier que le username n'existe pas déjà
  const q    = query(collection(db,'anac_users'), where('username','==',username.toUpperCase()));
  const snap = await getDocs(q);
  if (!snap.empty) throw new Error('Utilisateur déjà existant');
  await addDoc(collection(db,'anac_users'), {
    username: username.toUpperCase(),
    password,
    role: 'admin',
    createdAt: new Date().toISOString(),
    createdBy: createdBy || 'SYSTEM'
  });
}

export async function deleteUser(userId) {
  const db = await getDB();
  const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  await deleteDoc(doc(db,'anac_users',userId));
}

export async function changeUserPassword(userId, newPassword) {
  const db = await getDB();
  const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  await updateDoc(doc(db,'anac_users',userId), { password: newPassword, updatedAt: new Date().toISOString() });
}
