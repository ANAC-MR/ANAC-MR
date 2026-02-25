// ============================================
// FIREBASE CONFIG FOR ADMIN
// ============================================
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyAdR2xj-R1fGqP7OMBJ9NKB7JgNYmTK6ww",
    authDomain: "anacmr-e05b4.firebaseapp.com",
    projectId: "anacmr-e05b4",
    storageBucket: "anacmr-e05b4.firebasestorage.app",
    messagingSenderId: "857117390430",
    appId: "1:857117390430:web:0231614b880df3196e26cf"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const auth = getAuth(app);

// Admin emails
const ADMIN_EMAILS = [
    'admin@anac.mr',
    // Add more admin emails here
];

window.adminService = {

    // --- Auth ---
    async login(email, password) {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        if (!ADMIN_EMAILS.includes(credential.user.email)) {
            await signOut(auth);
            throw new Error('Accès non autorisé.');
        }
        return credential.user;
    },

    async logout() {
        await signOut(auth);
    },

    onAuthChange(callback) {
        return onAuthStateChanged(auth, user => {
            if (user && ADMIN_EMAILS.includes(user.email)) {
                callback(user);
            } else {
                callback(null);
            }
        });
    },

    // --- Airports ---
    onAirports(callback) {
        return onSnapshot(collection(db, 'config_airports'), snapshot => {
            callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    },

    async addAirport(data) {
        return await addDoc(collection(db, 'config_airports'), data);
    },

    async updateAirport(id, data) {
        await updateDoc(doc(db, 'config_airports', id), data);
    },

    async deleteAirport(id) {
        await deleteDoc(doc(db, 'config_airports', id));
    },

    // --- Airlines ---
    onAirlines(callback) {
        return onSnapshot(collection(db, 'config_airlines'), snapshot => {
            callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    },

    async addAirline(data) {
        return await addDoc(collection(db, 'config_airlines'), data);
    },

    async updateAirline(id, data) {
        await updateDoc(doc(db, 'config_airlines', id), data);
    },

    async deleteAirline(id) {
        await deleteDoc(doc(db, 'config_airlines', id));
    },

    // --- Aircraft ---
    onAircraft(callback) {
        return onSnapshot(collection(db, 'config_aircraft'), snapshot => {
            callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    },

    async addAircraft(data) {
        return await addDoc(collection(db, 'config_aircraft'), data);
    },

    async updateAircraft(id, data) {
        await updateDoc(doc(db, 'config_aircraft', id), data);
    },

    async deleteAircraft(id) {
        await deleteDoc(doc(db, 'config_aircraft', id));
    },

    // --- Users (roles) ---
    onUsers(callback) {
        return onSnapshot(collection(db, 'config_users'), snapshot => {
            callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    },

    async addUser(data) {
        return await setDoc(doc(db, 'config_users', data.email), data);
    },

    async updateUser(id, data) {
        await updateDoc(doc(db, 'config_users', id), data);
    },

    async deleteUser(id) {
        await deleteDoc(doc(db, 'config_users', id));
    },

    // --- Seed default data if collections empty ---
    async seedDefaultData() {
        const airports = [
            { code: "GQNN", name: "Nouakchott Oumtounsy", country: "Mauritanie" },
            { code: "GQPP", name: "Nouadhibou International", country: "Mauritanie" },
            { code: "GQPF", name: "Zoueratt International", country: "Mauritanie" },
            { code: "GQNE", name: "Néma Airport", country: "Mauritanie" },
            { code: "GQNK", name: "Kiffa Airport", country: "Mauritanie" },
            { code: "GMMN", name: "Casablanca Mohammed V", country: "Maroc" },
            { code: "DTTA", name: "Tunis Carthage", country: "Tunisie" },
            { code: "GOOY", name: "Dakar Blaise Diagne", country: "Sénégal" },
            { code: "GCLP", name: "Las Palmas Gran Canaria", country: "Espagne" },
            { code: "GABS", name: "Bamako Modibo Keita", country: "Mali" },
            { code: "GUCY", name: "Conakry Gbessia", country: "Guinée" },
            { code: "DIAP", name: "Abidjan Félix Houphouët-Boigny", country: "Côte d'Ivoire" },
            { code: "LTFM", name: "Istanbul Airport", country: "Turquie" },
            { code: "LFPG", name: "Paris Charles de Gaulle", country: "France" },
            { code: "DAAG", name: "Alger Houari Boumediene", country: "Algérie" },
            { code: "OEMA", name: "Madinah Prince Mohammad Bin Abdulaziz", country: "Arabie Saoudite" }
        ];

        const airlines = [
            { name: "Mauritania Airlines", prefix: "L6", regPrefix: "5T", regFormat: "5T-XXX" },
            { name: "Air Sénégal", prefix: "HC", regPrefix: "6V", regFormat: "6V-XXX" },
            { name: "Turkish Airlines", prefix: "TK", regPrefix: "TC", regFormat: "TC-XXX" },
            { name: "Binter", prefix: "NT", regPrefix: "EC", regFormat: "EC-XXX" },
            { name: "Air Algérie", prefix: "AH", regPrefix: "7T", regFormat: "7T-XXX" },
            { name: "ASKY", prefix: "KP", regPrefix: "ET", regFormat: "ET-XXX" },
            { name: "Royal Air Maroc", prefix: "AT", regPrefix: "CN", regFormat: "CN-XXX" },
            { name: "Tunisair", prefix: "TU", regPrefix: "TS", regFormat: "TS-XXX" },
            { name: "Air France", prefix: "AF", regPrefix: "F", regFormat: "F-XXXX" }
        ];

        const aircraft = [
            { code: "B738", name: "Boeing 737-800", manufacturer: "Boeing" },
            { code: "B739", name: "Boeing 737-900", manufacturer: "Boeing" },
            { code: "B77W", name: "Boeing 777-300ER", manufacturer: "Boeing" },
            { code: "A320", name: "Airbus A320", manufacturer: "Airbus" },
            { code: "A321", name: "Airbus A321", manufacturer: "Airbus" },
            { code: "A332", name: "Airbus A330-200", manufacturer: "Airbus" },
            { code: "A333", name: "Airbus A330-300", manufacturer: "Airbus" },
            { code: "AT76", name: "ATR 72-600", manufacturer: "ATR" },
            { code: "AT72", name: "ATR 72-500", manufacturer: "ATR" },
            { code: "E190", name: "Embraer E190", manufacturer: "Embraer" },
            { code: "DH8D", name: "Dash 8-400", manufacturer: "De Havilland" },
        ];

        const users = [
            { email: "transport@anac.mr", role: "transport" },
            { email: "direction@anac.mr", role: "direction" },
            { email: "admin@anac.mr", role: "admin" },
        ];

        // Only seed if empty
        const snap = await getDoc(doc(db, 'config_airports', airports[0].code));
        if (!snap.exists()) {
            for (const a of airports) await addDoc(collection(db, 'config_airports'), a);
            for (const a of airlines) await addDoc(collection(db, 'config_airlines'), a);
            for (const a of aircraft) await addDoc(collection(db, 'config_aircraft'), a);
            for (const u of users) await setDoc(doc(db, 'config_users', u.email), u);
            console.log('Default data seeded');
        }
    }
};
