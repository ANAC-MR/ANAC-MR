// ============================================
// FIREBASE CONFIG FOR AUTORISATIONS
// ============================================
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyAdR2xj-R1fGqP7OMBJ9NKB7JgNYmTK6ww",
    authDomain: "anacmr-e05b4.firebaseapp.com",
    projectId: "anacmr-e05b4",
    storageBucket: "anacmr-e05b4.firebasestorage.app",
    messagingSenderId: "857117390430",
    appId: "1:857117390430:web:0231614b880df3196e26cf"
};

// Avoid duplicate app initialization
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const auth = getAuth(app);

const requestsCollection = collection(db, 'autorisation_requests');

// ============================================
// ROLES - email → role mapping
// Transport Aérien: role = 'transport'
// Direction Générale: role = 'direction'
// ============================================
// To set roles, go to Firebase Console → Firestore → collection 'users'
// and add documents with { email, role }
// OR hardcode emails here for simplicity:
const TRANSPORT_EMAILS = [
    'transport@anac.mr',
    // add more emails here
];
const DIRECTION_EMAILS = [
    'direction@anac.mr',
    // add more emails here
];

// ============================================
// PUBLIC API
// ============================================
window.authService = {

    // --- Add new request (Step 1 - public) ---
    async addRequest(requestData) {
        const doc = await addDoc(requestsCollection, {
            ...requestData,
            status: 'pending',          // pending → transport_accepted / rejected → direction_approved / direction_rejected
            transportStatus: null,
            transportComment: null,
            directionStatus: null,
            directionComment: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        return doc.id;
    },

    // --- Transport: accept request ---
    async transportAccept(requestId) {
        const ref = doc(db, 'autorisation_requests', requestId);
        await updateDoc(ref, {
            status: 'transport_accepted',
            transportStatus: 'accepted',
            updatedAt: new Date().toISOString()
        });
    },

    // --- Transport: reject request ---
    async transportReject(requestId, reason) {
        const ref = doc(db, 'autorisation_requests', requestId);
        await updateDoc(ref, {
            status: 'rejected',
            transportStatus: 'rejected',
            transportComment: reason,
            updatedAt: new Date().toISOString()
        });
    },

    // --- Direction: approve request ---
    async directionApprove(requestId) {
        const ref = doc(db, 'autorisation_requests', requestId);
        await updateDoc(ref, {
            status: 'approved',
            directionStatus: 'approved',
            updatedAt: new Date().toISOString()
        });
    },

    // --- Direction: reject request ---
    async directionReject(requestId, reason) {
        const ref = doc(db, 'autorisation_requests', requestId);
        await updateDoc(ref, {
            status: 'direction_rejected',
            directionStatus: 'rejected',
            directionComment: reason,
            updatedAt: new Date().toISOString()
        });
    },

    // --- Real-time listener for Transport (all requests) ---
    onTransportRequests(callback) {
        const q = query(requestsCollection, orderBy('createdAt', 'desc'));
        return onSnapshot(q, snapshot => {
            const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(requests);
        });
    },

    // --- Real-time listener for Direction (only transport_accepted) ---
    onDirectionRequests(callback) {
        const q = query(
            requestsCollection,
            where('status', 'in', ['transport_accepted', 'approved', 'direction_rejected']),
            orderBy('createdAt', 'desc')
        );
        return onSnapshot(q, snapshot => {
            const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(requests);
        });
    },

    // --- Login ---
    async login(email, password) {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const user = credential.user;
        const role = TRANSPORT_EMAILS.includes(user.email) ? 'transport'
                   : DIRECTION_EMAILS.includes(user.email) ? 'direction'
                   : null;
        if (!role) {
            await signOut(auth);
            throw new Error('Accès non autorisé pour cet email.');
        }
        return { user, role };
    },

    // --- Logout ---
    async logout() {
        await signOut(auth);
    },

    // --- Auth state ---
    onAuthChange(callback) {
        return onAuthStateChanged(auth, user => {
            if (user) {
                const role = TRANSPORT_EMAILS.includes(user.email) ? 'transport'
                           : DIRECTION_EMAILS.includes(user.email) ? 'direction'
                           : null;
                callback(user, role);
            } else {
                callback(null, null);
            }
        });
    }
};
