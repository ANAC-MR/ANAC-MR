/**
 * ANAC SGV — Cloud Functions (gestion des comptes + rôles par custom claims)
 * API v2 (2e génération), région europe-west1.
 *
 * Fonctions callable attendues par le frontend (auth.js) :
 *   - adminCreateUser   { username, password, role, permissions }
 *   - adminUpdateUser   { docId, role?, permissions?, disabled? }
 *   - adminSetPassword  { docId, newPassword }
 *   - adminDeleteUser   { docId }
 * Amorçage / migration (une seule fois — voir le plan) :
 *   - bootstrapFirstAdmin { secret, username, password }
 *   - migrateUsersToUidId { }
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

const EMAIL_DOMAIN = 'sgv-anac.local';
const ROLES = ['admin', 'operator', 'reader'];

// Secret d'amorçage : utilisé UNE seule fois, puis à neutraliser (plan étape F).
const BOOTSTRAP_SECRET = 'Zt9-Kp3mW-x7Qv-Lr2n-Hy8s';

function usernameToEmail(username) {
  return String(username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') + '@' + EMAIL_DOMAIN;
}
function assertAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  if (request.auth.token.role !== 'admin') throw new HttpsError('permission-denied', 'Réservé aux administrateurs.');
}
function normalizeRole(role) {
  const r = String(role || 'reader').toLowerCase();
  return ROLES.indexOf(r) >= 0 ? r : 'reader';
}

exports.adminCreateUser = onCall(async (request) => {
  assertAdmin(request);
  const data = request.data || {};
  const username = String(data.username || '').trim();
  const password = String(data.password || '');
  const role = normalizeRole(data.role);
  const permissions = Array.isArray(data.permissions) ? data.permissions : [];
  if (!username) throw new HttpsError('invalid-argument', 'Identifiant requis.');
  if (password.length < 6) throw new HttpsError('invalid-argument', 'Mot de passe trop court (min 6).');
  const email = usernameToEmail(username);
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({ email, password });
  } catch (e) {
    if (e && e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Cet identifiant existe déjà.');
    throw new HttpsError('internal', 'Création Auth impossible : ' + (e && e.message));
  }
  const uid = userRecord.uid;
  await admin.auth().setCustomUserClaims(uid, { role });
  await admin.firestore().collection('anac_users').doc(uid).set({
    uid, username, role, permissions, disabled: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { ok: true, uid };
});

exports.adminUpdateUser = onCall(async (request) => {
  assertAdmin(request);
  const data = request.data || {};
  const docId = String(data.docId || '').trim();
  if (!docId) throw new HttpsError('invalid-argument', 'docId requis.');
  const ref = admin.firestore().collection('anac_users').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const uid = snap.data().uid || docId;
  const patch = {};
  if (data.role !== undefined) {
    const role = normalizeRole(data.role);
    if (request.auth.uid === uid && role !== 'admin') throw new HttpsError('failed-precondition', 'Un admin ne peut pas se rétrograder lui-même.');
    patch.role = role;
    await admin.auth().setCustomUserClaims(uid, { role });
  }
  if (data.permissions !== undefined && Array.isArray(data.permissions)) patch.permissions = data.permissions;
  if (data.disabled !== undefined) {
    patch.disabled = !!data.disabled;
    try { await admin.auth().updateUser(uid, { disabled: !!data.disabled }); } catch (e) {}
  }
  patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await ref.set(patch, { merge: true });
  return { ok: true };
});

exports.adminSetPassword = onCall(async (request) => {
  assertAdmin(request);
  const data = request.data || {};
  const docId = String(data.docId || '').trim();
  const newPassword = String(data.newPassword || '');
  if (!docId) throw new HttpsError('invalid-argument', 'docId requis.');
  if (newPassword.length < 6) throw new HttpsError('invalid-argument', 'Mot de passe trop court (min 6).');
  const snap = await admin.firestore().collection('anac_users').doc(docId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const uid = snap.data().uid || docId;
  await admin.auth().updateUser(uid, { password: newPassword });
  return { ok: true };
});

exports.adminDeleteUser = onCall(async (request) => {
  assertAdmin(request);
  const data = request.data || {};
  const docId = String(data.docId || '').trim();
  if (!docId) throw new HttpsError('invalid-argument', 'docId requis.');
  const ref = admin.firestore().collection('anac_users').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const uid = snap.data().uid || docId;
  if (request.auth.uid === uid) throw new HttpsError('failed-precondition', 'Un admin ne peut pas se supprimer lui-même.');
  try { await admin.auth().deleteUser(uid); } catch (e) {}
  await ref.delete();
  return { ok: true };
});

// ── Amorçage (une fois) ──
exports.bootstrapFirstAdmin = onCall(async (request) => {
  const data = request.data || {};
  if (!BOOTSTRAP_SECRET) throw new HttpsError('failed-precondition', 'Bootstrap désactivé.');
  if (data.secret !== BOOTSTRAP_SECRET) throw new HttpsError('permission-denied', 'Secret invalide.');
  const username = String(data.username || 'DADY').trim();
  const password = String(data.password || '');
  const email = usernameToEmail(username);
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
    if (password.length >= 6) await admin.auth().updateUser(user.uid, { password });
  } catch (e) {
    if (password.length < 6) throw new HttpsError('invalid-argument', 'Mot de passe requis (min 6) pour créer l’admin.');
    user = await admin.auth().createUser({ email, password });
  }
  await admin.auth().setCustomUserClaims(user.uid, { role: 'admin' });
  await admin.firestore().collection('anac_users').doc(user.uid).set({
    uid: user.uid, username, role: 'admin', permissions: ['*'], disabled: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true, uid: user.uid };
});

exports.migrateUsersToUidId = onCall(async (request) => {
  assertAdmin(request);
  const db = admin.firestore();
  const snap = await db.collection('anac_users').get();
  let moved = 0, claimed = 0, skipped = 0;
  for (const d of snap.docs) {
    const u = d.data();
    const uid = u.uid;
    if (!uid) { skipped++; continue; }
    const role = normalizeRole(u.role);
    try { await admin.auth().setCustomUserClaims(uid, { role }); claimed++; } catch (e) {}
    if (d.id !== uid) {
      const target = db.collection('anac_users').doc(uid);
      const exists = await target.get();
      if (!exists.exists) await target.set(Object.assign({}, u, { uid }), { merge: true });
      await d.ref.delete();
      moved++;
    }
  }
  return { ok: true, moved, claimed, skipped };
});
