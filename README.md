# DADY ANAC Mauritanie – Suivi Mensuel des Vols

Une application web moderne pour le suivi des vols avec persistance des données via Firebase Firestore.

## 📋 Table des matières

- [Architecture](#architecture)
- [Configuration Firebase](#configuration-firebase)
- [Déploiement](#déploiement)
- [Fonctionnalités](#fonctionnalités)
- [Structure des fichiers](#structure-des-fichiers)
- [Développement local](#développement-local)

## 🏗️ Architecture

### Séparation des responsabilités

L'application est structurée en 4 fichiers principaux :

1. **`index.html`** - Structure HTML sémantique uniquement
2. **`styles.css`** - Styles modernes et design responsive
3. **`app.js`** - Logique UI et manipulation du DOM
4. **`firebase.js`** - Configuration Firebase et opérations de base de données

### Flux de données

```
Firebase Firestore ↔ firebase.js ↔ app.js ↔ DOM (index.html)
```

- **firebase.js** gère toutes les communications avec Firebase
- **app.js** contient la logique métier et les interactions utilisateur
- Les mises à jour en temps réel sont gérées via `onSnapshot`

## 🔧 Configuration Firebase

### 1. Créer un projet Firebase

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Cliquez sur "Ajouter un projet"
3. Suivez les étapes de configuration

### 2. Activer Firestore

1. Dans votre projet Firebase, allez dans "Firestore Database"
2. Cliquez sur "Créer une base de données"
3. Choisissez "Mode test" ou "Mode production"
4. Sélectionnez l'emplacement (recommandé: `europe-west1`)
5. Activer

### 3. Configurer les règles de sécurité

Dans Firestore, allez dans l'onglet "Règles" et remplacez par :

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /flights/{flightId} {
      allow read, write: if true; // Mode test - à sécuriser en production
    }
  }
}
```

### 4. Obtenir la configuration

1. Dans les paramètres du projet, allez dans "Applications web"
2. Cliquez sur "</>" pour ajouter une application web
3. Copiez la configuration `firebaseConfig`

### 5. Mettre à jour firebase.js

Ouvrez `firebase.js` et remplacez les placeholders :

```javascript
const firebaseConfig = {
    apiKey: "VOTRE_API_KEY",
    authDomain: "VOTRE_PROJECT_ID.firebaseapp.com",
    projectId: "VOTRE_PROJECT_ID",
    storageBucket: "VOTRE_PROJECT_ID.appspot.com",
    messagingSenderId: "VOTRE_MESSAGING_SENDER_ID",
    appId: "VOTRE_APP_ID"
};
```

## 🚀 Déploiement sur GitHub Pages

### 1. Push vers GitHub

```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/VOTRE_USERNAME/VOTRE_REPO.git
git push -u origin main
```

### 2. Activer GitHub Pages

1. Allez dans votre repository GitHub
2. Settings → Pages
3. Source: "Deploy from a branch"
4. Branch: `main` / folder: `/root`
5. Save

### 3. Configurer les domaines autorisés Firebase

Pour que l'application fonctionne sur GitHub Pages :

1. Dans Firebase Console → Authentication → Paramètres
2. Ajoutez votre domaine GitHub Pages dans "Domaines autorisés"
3. Exemple: `VOTRE_USERNAME.github.io`

## ✨ Fonctionnalités

### Gestion des vols
- ✅ Ajouter un vol avec validation
- ✅ Supprimer un vol avec fonction d'annulation
- ✅ Mises à jour en temps réel
- ✅ Persistance des données

### Filtrage et recherche
- ✅ Filtrer par mois
- ✅ Filtrer par compagnie
- ✅ Filtrer par plage de dates
- ✅ Rechercher par immatriculation
- ✅ Rechercher par numéro de vol
- ✅ Filtrer par type (Départ/Arrivée)

### Interface utilisateur
- ✅ Design moderne et professionnel
- ✅ Responsive (desktop + mobile)
- ✅ Animations et transitions fluides
- ✅ Notifications non-intrusives
- ✅ Accessibilité clavier

### Données
- ✅ Total automatique des passagers
- ✅ Tri par date (plus récent d'abord)
- ✅ Formatage des dates
- ✅ Support des caractères spéciaux

## 📁 Structure des fichiers

```
DD/
├── index.html          # Structure HTML sémantique
├── styles.css          # Styles complets et responsive
├── app.js              # Logique UI et interactions
├── firebase.js         # Configuration Firebase et DB
└── README.md           # Documentation
```

### Détails des fichiers

#### `index.html` (163 lignes)
- Structure HTML5 sémantique
- Pas de JavaScript inline
- Accessibilité et attributs ARIA
- Liens vers les ressources externes

#### `styles.css` (650+ lignes)
- Design moderne avec gradients
- Complètement responsive
- Animations CSS fluides
- Support des thèmes clair/sombre
- Styles d'impression
- Accessibilité

#### `app.js` (600+ lignes)
- Architecture modulaire
- Gestion d'état centralisée
- Validation des formulaires
- Raccourcis clavier
- Système de notifications
- Pas de dépendances externes

#### `firebase.js` (400+ lignes)
- SDK Firebase v9+ (modulaire)
- Mode mock pour développement
- Gestion d'erreurs robuste
- Reconnexion automatique
- Support du debug

## 🛠️ Développement local

### 1. Serveur local

```bash
# Avec Python 3
python -m http.server 8000

# Avec Node.js
npx serve .

# Avec PHP
php -S localhost:8000
```

### 2. Mode développement

L'application fonctionne en mode mock automatiquement si Firebase n'est pas configuré :

- Les données sont stockées dans `localStorage`
- Simule les délais réseau
- Permet le développement sans configuration

### 3. Debug

En développement (`localhost`), des fonctions de debug sont disponibles :

```javascript
// Vérifier le statut Firebase
window.firebaseStatus()

// Reconnecter Firebase
window.reconnectFirebase()

// Effacer les données mock
window.debugFirebase.clearMockData()
```

## 🔒 Sécurité (Production)

Pour la production, sécurisez vos règles Firestore :

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /flights/{flightId} {
      allow read: if true;
      allow write: if request.time < timestamp.date(2025, 1, 1);
      // Limiter les écritures ou ajouter l'authentification
    }
  }
}
```

## 📱 Support navigateur

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 🐈 Dépannage

### Problèmes courants

1. **"Firebase config not set"**
   - Mettez à jour `firebase.js` avec votre configuration

2. **"Permission denied"**
   - Vérifiez les règles de sécurité Firestore
   - Ajoutez votre domaine aux domaines autorisés

3. **Données non synchronisées**
   - Vérifiez la connexion internet
   - Essayez `window.reconnectFirebase()`

4. **Styles ne s'appliquent pas**
   - Vérifiez que `styles.css` est dans le même dossier
   - Videz le cache du navigateur

## 📞 Support

Pour toute question ou problème :

1. Vérifiez la console du navigateur
2. Consultez les fonctions de debug
3. Vérifiez cette documentation

---

**Développé avec ❤️ pour l'ANAC Mauritanie**
