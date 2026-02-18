// ============================================
// DESTINATIONS - AEROPORTS (ICAO)
// ============================================

const DESTINATIONS = [
    { name: "Nouakchott Oumtounsy", code: "GQNO" },
    { name: "Nouadhibou International", code: "GQPP" },
    { name: "Zoueratt International", code: "GQPZ" },
    { name: "Néma Airport", code: "GQNI" },
    { name: "Kiffa Airport", code: "GQPF" },
    { name: "Casablanca Mohammed V", code: "GMMN" },
    { name: "Tunis Carthage", code: "DTTA" },
    { name: "Dakar Blaise Diagne", code: "GOBD" },
    { name: "Las Palmas Gran Canaria", code: "GCLP" },
    { name: "Bamako Modibo Keita", code: "GABS" },
    { name: "Conakry Gbessia", code: "GUCY" },
    { name: "Abidjan Félix Houphouët-Boigny", code: "DIAP" },
    { name: "Istanbul Airport", code: "LTFM" },
    { name: "Paris Charles de Gaulle", code: "LFPG" },
    { name: "Alger Houari Boumediene", code: "DAAG" },
    { name: "Madinah Prince Mohammad Bin Abdulaziz", code: "OEMA" }
];

// ============================================
// CONFIGURATION & CONSTANTS
// ============================================

const MONTHS = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
];

const AIRLINES = [
    "Mauritania Airlines","Air Sénégal","Turkish Airlines",
    "Binter","Air Algérie","ASKY",
    "Royal Air Maroc","Tunisair","Air France"
];

const AIRLINE_PREFIXES = {
    "Mauritania Airlines":"L6",
    "Air Sénégal":"HC",
    "Turkish Airlines":"TK",
    "Binter":"NT",
    "Air Algérie":"AH",
    "ASKY":"KP",
    "Royal Air Maroc":"AT",
    "Tunisair":"TU",
    "Air France":"AF"
};

// ============================================
// AUTHENTICATION
// ============================================

const ADMIN_PASSWORD="ANACdady";
let isAuthenticated=false;

// ============================================
// APPLICATION STATE
// ============================================

let flights=[];
let currentTypeFilter="ALL";
let lastDeletedFlight=null;
let undoTimeout=null;
let isInitialized=false;
let editingFlightId=null;
let activeActionsMenu=null;

// ============================================
// DOM ELEMENT REFERENCES
// ============================================

const elements={
    flightTableBody:document.getElementById('flightTableBody'),
    totalPassengers:document.getElementById('totalPassengers'),
    totalBabies:document.getElementById('totalBabies'),

    monthSelect:document.getElementById('monthSelect'),
    companySelect:document.getElementById('companySelect'),
    destinationFilter:document.getElementById('destinationFilter'),
    searchFrom:document.getElementById('searchFrom'),
    searchTo:document.getElementById('searchTo'),
    searchImm:document.getElementById('searchImm'),
    searchVol:document.getElementById('searchVol'),
    resetFilters:document.getElementById('resetFilters'),

    typeButtons:document.querySelectorAll('[data-type]'),

    addFlightBtn:document.getElementById('addFlightBtn'),
    undoBtn:document.getElementById('undoBtn'),

    flightModal:document.getElementById('flightModal'),
    flightForm:document.getElementById('flightForm'),
    cancelBtn:document.getElementById('cancelBtn'),

    fAuthNumber:document.getElementById('fAuthNumber'),
    fDate:document.getElementById('fDate'),
    fCompany:document.getElementById('fCompany'),
    fImm:document.getElementById('fImm'),
    fVol:document.getElementById('fVol'),
    fType:document.getElementById('fType'),
    fDestination:document.getElementById('fDestination'),
    fPassengers:document.getElementById('fPassengers'),
    fBabies:document.getElementById('fBabies'),

    notificationContainer:document.getElementById('notificationContainer')
};

// ============================================
// INITIALIZATION
// ============================================

function initializeApp(){
    if(isInitialized)return;
    populateSelects();
    attachEventListeners();
    setupRealtimeListener();
    isInitialized=true;
}

function populateSelects(){

    MONTHS.forEach((m,i)=>{
        const o=document.createElement('option');
        o.value=i;
        o.textContent=m;
        elements.monthSelect.appendChild(o);
    });

    AIRLINES.forEach(a=>{
        const f=document.createElement('option');
        f.value=a;
        f.textContent=a;
        elements.companySelect.appendChild(f);

        const f2=document.createElement('option');
        f2.value=a;
        f2.textContent=a;
        elements.fCompany.appendChild(f2);
    });

    DESTINATIONS.forEach(dest=>{
        const o1=document.createElement('option');
        o1.value=dest.code;
        o1.textContent=`${dest.name} (${dest.code})`;
        elements.destinationFilter.appendChild(o1);

        const o2=document.createElement('option');
        o2.value=dest.code;
        o2.textContent=`${dest.name} (${dest.code})`;
        elements.fDestination.appendChild(o2);
    });
}

// ============================================
// FILTERS
// ============================================

function filterFlights(){

    const monthFilter=elements.monthSelect.value;
    const companyFilter=elements.companySelect.value;
    const destinationFilter=elements.destinationFilter.value;
    const dateFrom=elements.searchFrom.value;
    const dateTo=elements.searchTo.value;
    const immFilter=elements.searchImm.value.toUpperCase().trim();
    const volFilter=elements.searchVol.value.toUpperCase().trim();

    return flights.filter(flight=>{

        const flightDate=new Date(flight.date);

        if(monthFilter!=='ALL' && flightDate.getMonth()!==parseInt(monthFilter))return false;
        if(companyFilter!=='ALL' && flight.company!==companyFilter)return false;
        if(destinationFilter!=='ALL' && flight.destination!==destinationFilter)return false;
        if(dateFrom && flight.date<dateFrom)return false;
        if(dateTo && flight.date>dateTo)return false;
        if(currentTypeFilter!=='ALL' && flight.type!==currentTypeFilter)return false;
        if(immFilter && !flight.registration.toUpperCase().includes(immFilter))return false;
        if(volFilter && !flight.flightNumber.toUpperCase().includes(volFilter))return false;

        return true;
    });
}

// ============================================
// FORM DATA
// ============================================

function getFormData(){
    return{
        authorizationNumber:elements.fAuthNumber.value.trim().toUpperCase(),
        date:elements.fDate.value,
        company:elements.fCompany.value,
        registration:elements.fImm.value.trim().toUpperCase(),
        flightNumber:elements.fVol.value.trim().toUpperCase(),
        type:elements.fType.value,
        destination:elements.fDestination.value,
        passengers:parseInt(elements.fPassengers.value)||0,
        babies:parseInt(elements.fBabies.value)||0,
        timestamp:Date.now()
    };
}

// ============================================
// RENDER
// ============================================

function renderTable(filteredFlights){

    elements.flightTableBody.innerHTML='';

    if(filteredFlights.length===0){
        elements.flightTableBody.innerHTML=`
            <tr>
                <td colspan="10" class="empty-state">
                    <p>Aucun vol trouvé</p>
                </td>
            </tr>
        `;
        return;
    }

    filteredFlights.forEach(flight=>{
        elements.flightTableBody.appendChild(createFlightRow(flight));
    });
}

function createFlightRow(flight){

    const row=document.createElement('tr');

    const formattedDate=formatDateEU(flight.date);
    const typeText=flight.type==='DEP'?'Départ':'Arrivée';
    const typeClass=flight.type==='DEP'?'type-depart':'type-arrivee';
    const authNumber=flight.authorizationNumber||'N/A';

    const destinationObj=DESTINATIONS.find(d=>d.code===flight.destination);
    const destinationText=destinationObj
        ?`${destinationObj.name} (${destinationObj.code})`
        :'N/A';

    row.innerHTML=`
        <td><strong>${authNumber}</strong></td>
        <td>${formattedDate}</td>
        <td>${flight.company}</td>
        <td><strong>${flight.registration}</strong></td>
        <td>${flight.flightNumber}</td>
        <td><span class="type-badge ${typeClass}">${typeText}</span></td>
        <td>${destinationText}</td>
        <td>${flight.passengers}</td>
        <td>${flight.babies}</td>
        <td>⋯</td>
    `;

    return row;
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded',initializeApp);
