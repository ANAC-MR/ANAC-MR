// ============================================
// FIREBASE CONFIGURATION & INITIALIZATION
// ============================================

// Firebase configuration - REPLACE WITH YOUR CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyAdR2xj-R1fGqP7OMBJ9NKB7JgNYmTK6ww",
  authDomain: "anacmr-e05b4.firebaseapp.com",
  projectId: "anacmr-e05b4",
  storageBucket: "anacmr-e05b4.firebasestorage.app",
  messagingSenderId: "857117390430",
  appId: "1:857117390430:web:0231614b880df3196e26cf",
  measurementId: "G-99SRWB16J8"
};

// ============================================
// FIREBASE SERVICES INITIALIZATION
// ============================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, getDocs, where, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
        db = getFirestore(app);
        flightsCollection = collection(db, 'flights');
        
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
                console.log('deleteFlight called, isInitialized:', isInitialized);
                if (isInitialized) {
                    console.log('Using Firebase delete');
                    return await deleteFlightFromFirestore(flightId);
                } else {
                    console.log('Using mock service delete');
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
        
        return true;
    } catch (error) {
        console.error('Error initializing Firebase:', error);
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
    } catch (error) {
        console.error('Firebase connection test failed:', error);
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
        console.log('Flight added with ID:', docRef.id);
        
        return {
            id: docRef.id,
            ...flightWithMetadata
        };
    } catch (error) {
        console.error('Error adding flight:', error);
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
        console.log('Updating flight with ID:', flightId);
        console.log('Update data:', flightData);
        
        const flightRef = doc(db, 'flights', flightId);
        const updateData = {
            ...flightData,
            updatedAt: new Date().toISOString()
        };
        
        await updateDoc(flightRef, updateData);
        console.log('Flight updated successfully with ID:', flightId);
        
        return true;
    } catch (error) {
        console.error('Error updating flight:', error);
        console.error('FlightId was:', flightId);
        console.error('FlightData was:', flightData);
        throw error;
    }
}

/**
 * Delete a flight from Firestore
 */
async function deleteFlightFromFirestore(flightId) {
    console.log('deleteFlightFromFirestore called with ID:', flightId);
    if (!isInitialized) {
        throw new Error('Firebase not initialized');
    }
    
    try {
        const flightRef = doc(db, 'flights', flightId);
        console.log('Attempting to delete document:', flightRef);
        await deleteDoc(flightRef);
        console.log('Flight deleted with ID:', flightId);
        
        return true;
    } catch (error) {
        console.error('Error deleting flight:', error);
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
                id: doc.id,
                ...doc.data()
            });
        });
        
        return flights;
    } catch (error) {
        console.error('Error getting flights:', error);
        throw error;
    }
}

/**
 * Get flights filtered by date range
 */
async function getFlightsByDateRange(startDate, endDate) {
    if (!isInitialized) {
        throw new Error('Firebase not initialized');
    }
    
    try {
        const q = query(
            flightsCollection,
            where('date', '>=', startDate),
            where('date', '<=', endDate),
            orderBy('date', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        const flights = [];
        
        querySnapshot.forEach((doc) => {
            flights.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        return flights;
    } catch (error) {
        console.error('Error getting flights by date range:', error);
        throw error;
    }
}

// ============================================
// REAL-TIME LISTENERS
// ============================================

let unsubscribeFromFlights = null;

/**
 * Start real-time listener for flights
 */
function startRealtimeListener() {
    if (!isInitialized || unsubscribeFromFlights) {
        return;
    }
    
    try {
        const q = query(flightsCollection, orderBy('timestamp', 'desc'));
        
        unsubscribeFromFlights = onSnapshot(q, (snapshot) => {
            const flights = [];
            
            snapshot.forEach((doc) => {
                flights.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            // Update UI through app.js
            if (window.app && window.app.updateFlightsData) {
                window.app.updateFlightsData(flights);
            }
        }, (error) => {
            console.error('Error in real-time listener:', error);
            showNotification('Erreur de synchronisation des données', 'error');
        });
        
        console.log('Real-time listener started');
    } catch (error) {
        console.error('Error starting real-time listener:', error);
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
function handleFirebaseError(error) {
    console.error('Firebase error:', error);
    
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
