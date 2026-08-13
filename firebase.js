// ============================================
// FIREBASE CONFIGURATION & INITIALIZATION
// ============================================

// Firebase configuration - REPLACE WITH YOUR CONFIG 
const firebaseConfig = {
  apiKey: "AIzaSyCHzrNNRL1MrBCCqxc-1wso9gcBwBztO40",
  authDomain: "anacmr-67835.firebaseapp.com",
  projectId: "anacmr-67835",
  storageBucket: "anacmr-67835.firebasestorage.app",
  messagingSenderId: "906668222910",
  appId: "1:906668222910:web:19d92b627f155bd2dbb1ef",
  measurementId: "G-99SRWB16J8"
};

// ============================================
// FIREBASE SERVICES INITIALIZATION
// ============================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, getDocs, where, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Initialize Firebase
let app;
let db;
let flightsCollection;
let isInitialized = false;
let mockDbService = null;

/**
 * Initialize Firebase services
 */
async function initializeFirebase() {
    try {
        // Check if config is properly set
        if (firebaseConfig.apiKey === "YOUR_API_KEY") {
            console.warn('Firebase config not set. Using mock mode for development.');
            return initializeMockMode();
        }

        // Initialize Firebase app
        app = initializeApp(firebaseConfig);
        window._fbApp = app;   // exposé pour la ré-authentification du listener
        // Cache local persistant (IndexedDB) : les visites suivantes s'affichent
        // instantanément et Firestore ne re-télécharge que les vols modifiés.
        // Repli automatique si le cache est indisponible (navigation privée,
        // multi-onglets non supporté, instance déjà créée) → aucun risque.
        try {
            db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
        } catch(_cacheErr) {
            db = getFirestore(app);
        }
        window.db = db; // Exposé globalement pour autoFill etc.
        flightsCollection = collection(db, 'flights');

        // ── Authentifier cette connexion (règles Firestore strictes) ──
        // Attendre que ANAC_AUTH soit prêt puis authentifier l'instance.
        try {
            let _tries = 0;
            while (!(window.ANAC_AUTH && window.ANAC_AUTH.ensureAuthed) && _tries < 60) {
                await new Promise(r => setTimeout(r, 100));
                _tries++;
            }
            if (window.ANAC_AUTH && window.ANAC_AUTH.ensureAuthed) {
                await window.ANAC_AUTH.ensureAuthed(app);
            }
        } catch(authErr) {
            console.warn('Firebase auth bootstrap:', authErr && authErr.message);
        }

        // Test connection
        await testConnection();
        
        isInitialized = true;
        console.log('Firebase initialized successfully');
        
        // IMPORTANT: Overwrite mock service with real Firebase service
        window.dbService = {
            async addFlight(flightData) {
                return await addFlightToFirestore(flightData);
            },
            
            async updateFlight(flightId, flightData) {
                return await updateFlightInFirestore(flightId, flightData);
            },
            
            async deleteFlight(flightId) {
                if (isInitialized) {
                    return await deleteFlightFromFirestore(flightId);
                } else {
                    if (mockDbService) {
                        return await mockDbService.deleteFlight(flightId);
                    } else {
                        throw new Error('No database service available');
                    }
                }
            },
            
            async getAllFlights() {
                return await getAllFlights();
            },
            
            onFlightsUpdate(callback) {
                // Real-time listener is handled by startRealtimeListener
                return;
            }
        };
        
        // Start real-time listener
        startRealtimeListener();
        
        // Signaler à app.js que Firebase est prêt
        window.dispatchEvent(new CustomEvent('firebaseReady'));
        
        return true;
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        if (_isQuotaError(error)) _showQuotaBanner();
        showNotification('Erreur de connexion à la base de données', 'error');
        return initializeMockMode();
    }
}

/**
 * Test Firebase connection
 */
async function testConnection() {
    try {
        const testQuery = query(flightsCollection, orderBy('timestamp', 'desc'), limit(1));
        await getDocs(testQuery);
        console.log('Firebase connection test successful');
        _hideQuotaBanner();
    } catch (error) {
        console.error('Firebase connection test failed:', error);
        if (_isQuotaError(error)) _showQuotaBanner();
        throw error;
    }
}

/**
 * Initialize mock mode for development without Firebase
 */
function initializeMockMode() {
    console.log('Initializing in mock mode');
    
    // Mock storage
    let mockFlights = JSON.parse(localStorage.getItem('mock_flights') || '[]');
    
    // Mock service
    const mockDbService = {
        async addFlight(flightData) {
            const flight = {
                ...flightData,
                id: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };
            
            mockFlights.push(flight);
            localStorage.setItem('mock_flights', JSON.stringify(mockFlights));
            
            // Simulate delay
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Update UI
            if (window.app && window.app.updateFlightsData) {
                window.app.updateFlightsData([...mockFlights]);
            }
            
            return flight;
        },
        
        async updateFlight(flightId, flightData) {
            const index = mockFlights.findIndex(f => f.id === flightId);
            if (index !== -1) {
                mockFlights[index] = {
                    ...mockFlights[index],
                    ...flightData,
                    id: flightId
                };
                localStorage.setItem('mock_flights', JSON.stringify(mockFlights));
                
                // Simulate delay
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Update UI
                if (window.app && window.app.updateFlightsData) {
                    window.app.updateFlightsData([...mockFlights]);
                }
                
                return true;
            }
            return false;
        },
        
        async deleteFlight(flightId) {
            mockFlights = mockFlights.filter(f => f.id !== flightId);
            localStorage.setItem('mock_flights', JSON.stringify(mockFlights));
            
            // Simulate delay
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Update UI
            if (window.app && window.app.updateFlightsData) {
                window.app.updateFlightsData([...mockFlights]);
            }
            
            return true;
        },
        
        onFlightsUpdate(callback) {
            // Initial load
            callback([...mockFlights]);
            
            // Mock real-time updates (polling localStorage)
            const interval = setInterval(() => {
                const currentFlights = JSON.parse(localStorage.getItem('mock_flights') || '[]');
                if (JSON.stringify(currentFlights) !== JSON.stringify(mockFlights)) {
                    mockFlights = currentFlights;
                    callback([...mockFlights]);
                }
            }, 1000);
            
            // Return cleanup function
            return () => clearInterval(interval);
        }
    };
    
    window.dbService = mockDbService;
    
    return false;
}

// ============================================
// FIREBASE DATABASE OPERATIONS
// ============================================

/**
 * Add a new flight to Firestore
 */
async function addFlightToFirestore(flightData) {
    if (!isInitialized) {
        throw new Error('Firebase not initialized');
    }
    
    try {
        const flightWithMetadata = {
            ...flightData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const docRef = await addDoc(flightsCollection, flightWithMetadata);
        
        return {
            id: docRef.id,
            ...flightWithMetadata
        };
    } catch (error) {
        console.error('Error adding flight:', error);
        if (_isQuotaError(error)) _showQuotaBanner();
        throw error;
    }
}

/**
 * Update an existing flight in Firestore
 */
async function updateFlightInFirestore(flightId, flightData) {
    if (!isInitialized) {
        throw new Error('Firebase not initialized');
    }
    
    // Validate flightId
    if (!flightId || typeof flightId !== 'string') {
        console.error('Invalid flightId:', flightId, 'Type:', typeof flightId);
        throw new Error('Invalid flight ID: must be a non-empty string');
    }
    
    try {
        
        const flightRef = doc(db, 'flights', flightId);
        const updateData = {
            ...flightData,
            updatedAt: new Date().toISOString()
        };
        
        await updateDoc(flightRef, updateData);
        
        return true;
    } catch (error) {
        console.error('Error updating flight:', error);
        console.error('FlightId was:', flightId);
        console.error('FlightData was:', flightData);
        if (_isQuotaError(error)) _showQuotaBanner();
        throw error;
    }
}

/**
 * Delete a flight from Firestore
 */
async function deleteFlightFromFirestore(flightId) {
    if (!isInitialized) {
        throw new Error('Firebase not initialized');
    }
    if (!flightId || typeof flightId !== 'string' || flightId.trim() === '') {
        throw new Error('ID de vol invalide: ' + flightId);
    }

    try {
        const flightRef = doc(db, 'flights', flightId.trim());
        await deleteDoc(flightRef);
        console.log('Flight successfully deleted from Firebase:', flightId);
        return true;
    } catch (error) {
        console.error('Error deleting flight from Firebase:');
        console.error('  - error.code:', error.code);
        console.error('  - error.message:', error.message);
        console.error('  - flightId:', flightId);
        if (_isQuotaError(error)) _showQuotaBanner();
        throw error;
    }
}

/**
 * Get all flights from Firestore
 */
async function getAllFlights() {
    if (!isInitialized) {
        throw new Error('Firebase not initialized');
    }
    
    try {
        const q = query(flightsCollection, orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        const flights = [];
        
        querySnapshot.forEach((doc) => {
            flights.push({
                ...doc.data(),
                id: doc.id            // ID Firestore réel — prioritaire sur tout champ "id" interne hérité
            });
        });
        
        return flights;
    } catch (error) {
        console.error('Error getting flights:', error);
        if (_isQuotaError(error)) _showQuotaBanner();
        throw error;
    }
}

/**
 * Get flights filtered by date range
 */
// ============================================
// REAL-TIME LISTENERS
// ============================================

let unsubscribeFromFlights = null;

/**
 * Start real-time listener for flights
 */
let _rtRetries = 0;
function startRealtimeListener() {
    if (!isInitialized || unsubscribeFromFlights) {
        return;
    }
    
    try {
        const q = query(flightsCollection, orderBy('timestamp', 'desc'));
        
        unsubscribeFromFlights = onSnapshot(q, (snapshot) => {
            _rtRetries = 0;   // connexion OK → réinitialiser le compteur
            const flights = [];
            
            snapshot.forEach((doc) => {
                flights.push({
                    ...doc.data(),
                    id: doc.id            // ID Firestore réel — prioritaire sur tout champ "id" interne hérité
                });
            });
            
            // Update UI through app.js
            if (window.app && window.app.updateFlightsData) {
                window.app.updateFlightsData(flights);
            }
        }, (error) => {
            // ── Échec (souvent : auth pas encore prête sur connexion lente) ──
            // On NE laisse PLUS le listener mourir : nettoyage puis réessai
            // automatique, jusqu'à 10 tentatives espacées de 2,5 s.
            console.warn('Listener temps réel en erreur:', error && error.code || error);
            try { if (unsubscribeFromFlights) unsubscribeFromFlights(); } catch(e) {}
            unsubscribeFromFlights = null;
            _rtRetries++;
            if (_rtRetries <= 10) {
                setTimeout(async () => {
                    // Attendre/forcer l'authentification avant de réessayer
                    try {
                        if (window.ANAC_AUTH && window.ANAC_AUTH.ensureAuthed && window._fbApp) {
                            await window.ANAC_AUTH.ensureAuthed(window._fbApp);
                        }
                    } catch(e) {}
                    console.log('Reconnexion du listener temps réel (tentative ' + _rtRetries + ')…');
                    startRealtimeListener();
                }, 2500);
            } else {
                showNotification('Erreur de synchronisation des données — actualisez la page', 'error');
            }
        });
        
        console.log('Real-time listener started');
        _hideQuotaBanner();
    } catch (error) {
        console.error('Error starting real-time listener:', error);
        // Réessai aussi en cas d'échec immédiat de l'abonnement
        _rtRetries++;
        if (_rtRetries <= 10) setTimeout(startRealtimeListener, 2500);
    }
}

/**
 * Stop real-time listener
 */
function stopRealtimeListener() {
    if (unsubscribeFromFlights) {
        unsubscribeFromFlights();
        unsubscribeFromFlights = null;
        console.log('Real-time listener stopped');
    }
}

// ============================================
// PUBLIC DATABASE SERVICE API
// ============================================

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Show notification (delegates to app.js if available)
 */
function showNotification(message, type = 'info') {
    if (window.app && window.app.showNotification) {
        window.app.showNotification(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

/**
 * Validate Firebase configuration
 */
function validateConfig() {
    const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const missingFields = requiredFields.filter(field => 
        !firebaseConfig[field] || firebaseConfig[field].includes('YOUR_')
    );
    
    if (missingFields.length > 0) {
        console.warn('Missing Firebase configuration fields:', missingFields);
        return false;
    }
    
    return true;
}

/**
 * Get current Firebase status
 */
function getFirebaseStatus() {
    return {
        isInitialized,
        hasValidConfig: validateConfig(),
        isRealtimeActive: unsubscribeFromFlights !== null
    };
}

// ============================================
// ERROR HANDLING & RECOVERY
// ============================================

/**
 * Handle Firebase errors and attempt recovery
 */
// ── Détection quota Firebase ──────────────────────────────────
function _isQuotaError(error) {
    if (!error) return false;
    const code = (error.code || '').toLowerCase();
    const msg  = (error.message || '').toLowerCase();
    return code === 'resource-exhausted'
        || code === 'quota-exceeded'
        || msg.includes('quota')
        || msg.includes('resource-exhausted')
        || msg.includes('429');
}

function _showQuotaBanner() {
    if (document.getElementById('_quotaBanner')) return;
    const banner = document.createElement('div');
    banner.id = '_quotaBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;font-size:13px;font-weight:700;padding:10px 20px;text-align:center;display:flex;align-items:center;justify-content:center;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,0.4)';
    banner.innerHTML = 'QUOTA FIREBASE DÉPASSÉ — Les opérations sont bloquées. Attendez minuit (UTC) ou vérifiez votre plan Firebase.'
        + '<button onclick="document.getElementById(\'_quotaBanner\').remove();sessionStorage.removeItem(\'_quotaExceeded\')" '
        + 'style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px;">✕ Fermer</button>';
    document.body.prepend(banner);
    sessionStorage.setItem('_quotaExceeded', '1');
}

function _hideQuotaBanner() {
    const b = document.getElementById('_quotaBanner');
    if (b) b.remove();
    sessionStorage.removeItem('_quotaExceeded');
}

// Réafficher le bandeau si quota était dépassé lors du dernier chargement
if (sessionStorage.getItem('_quotaExceeded') === '1') {
    document.addEventListener('DOMContentLoaded', () => _showQuotaBanner());
}

function handleFirebaseError(error) {
    console.error('Firebase error:', error);

    if (_isQuotaError(error)) {
        _showQuotaBanner();
        return;
    }

    switch (error.code) {
        case 'unavailable':
        case 'timeout':
            showNotification('Connexion temporairement indisponible', 'warning');
            break;
        case 'permission-denied':
            showNotification('Erreur d\'autorisation', 'error');
            break;
        case 'not-found':
            showNotification('Ressource introuvable', 'error');
            break;
        default:
            showNotification('Erreur de base de données', 'error');
    }
}

/**
 * Attempt to reconnect to Firebase
 */
async function reconnectFirebase() {
    try {
        stopRealtimeListener();
        
        if (validateConfig()) {
            const success = await initializeFirebase();
            if (success) {
                showNotification('Connexion rétablie', 'success');
            }
        }
    } catch (error) {
        console.error('Error reconnecting to Firebase:', error);
        handleFirebaseError(error);
    }
}

// ============================================
// INITIALIZATION
// ============================================

// Initialize Firebase when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeFirebase();
        
        // Make status available for debugging
        window.firebaseStatus = getFirebaseStatus;
        
        // Expose reconnect function for manual recovery
        window.reconnectFirebase = reconnectFirebase;
        
    } catch (error) {
        console.error('Error during Firebase initialization:', error);
        handleFirebaseError(error);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopRealtimeListener();
});

// ============================================
// DEVELOPMENT HELPERS
// ============================================

// Enable debug mode in development
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.dbService.debug = true;
    
    // Add debug functions
    window.debugFirebase = {
        getStatus: getFirebaseStatus,
        reconnect: reconnectFirebase,
        clearMockData: () => {
            localStorage.removeItem('mock_flights');
            console.log('Mock data cleared');
        }
    };
    
    console.log('Firebase debug mode enabled');
}
