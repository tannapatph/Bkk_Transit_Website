// ----- 0. Configuration -----
const API_URL = "https://bkk-transit-website.onrender.com"; 

// ----- 1. Global Variables -----
let allStations = []; 
let transitData = {}; 
let activeInputTarget = 'start-station'; // ติดตามช่องที่ active

// ----- 2. Global DOM Element Variables (The Fix) -----
// ย้ายตัวแปร DOM ทั้งหมดออกมาข้างนอก โดยกำหนดเป็น null ก่อน
let searchForm = null;
let startInput = null;
let endInput = null;
let stationsDatalist = null;
let searchButton = null;
let resultsContainer = null;
let loadingSpinner = null;
let errorMessage = null;
let errorText = null;
let resultsContent = null;
let totalTimeEl = null;
let totalTransfersEl = null;
let pathStepsEl = null;
let sidebarListElement = null; 

// ----- 3. DOMContentLoaded -----
// เมื่อหน้าเว็บโหลดเสร็จ ค่อย "ค้นหา" element จริงๆ
document.addEventListener('DOMContentLoaded', () => {
    
    // 3.1. Assign DOM Elements
    // (ตอนนี้เรากำลังกำหนดค่าให้ตัวแปร Global ที่อยู่ข้างบน)
    searchForm = document.getElementById('search-form');
    startInput = document.getElementById('start-station');
    endInput = document.getElementById('end-station');
    stationsDatalist = document.getElementById('stations-list');
    
    // (ต้องเช็คก่อนว่า searchForm มีจริง)
    if(searchForm) {
        searchButton = searchForm.querySelector('button[type="submit"]');
    }

    resultsContainer = document.getElementById('results-container');
    loadingSpinner = document.getElementById('loading-spinner');
    errorMessage = document.getElementById('error-message');
    errorText = document.getElementById('error-text');
    resultsContent = document.getElementById('results-content');
    totalTimeEl = document.getElementById('total-time');
    totalTransfersEl = document.getElementById('total-transfers');
    pathStepsEl = document.getElementById('path-steps');
    sidebarListElement = document.getElementById('sidebar-list');

    // 3.2. Add Event Listeners
    
    // ติดตามช่องที่ focus
    if(startInput) {
        startInput.onfocus = () => { activeInputTarget = 'start-station'; };
    }
    if(endInput) {
        endInput.onfocus = () => { activeInputTarget = 'end-station'; };
    }
    
    // ตัวดักฟังการ submit (ย้ายมาไว้ตรงนี้)
    if(searchForm) {
        searchForm.addEventListener('submit', onSearchSubmit);
    }

    // 3.3. Initial Loaders
    loadAllStations(); // โหลด datalist (สำหรับช่องค้นหา)
    loadSidebarData(); // โหลด sidebar
});

// ----- 4. Helper Functions -----
function getLineDetails(lineCode) {
    const lines = {
        "BTS Sukhumvit Line": { name: "BTS สายสุขุมวิท", colorClass: "line-bts-green" },
        "BTS Silom Line": { name: "BTS สายสีลม", colorClass: "line-bts-silom" },
        "MRT Blue Line": { name: "MRT สายสีน้ำเงิน", colorClass: "line-mrt-blue" },
        "MRT Purple Line": { name: "MRT สายสีม่วง", colorClass: "line-mrt-purple" },
        "MRT Yellow Line": { name: "MRT สายสีเหลือง", colorClass: "line-mrt-yellow" },
        "MRT Pink Line": { name: "MRT สายสีชมพู", colorClass: "line-mrt-pink" },
        "Gold Line": { name: "BTS สายสีทอง", colorClass: "line-bts-gold" },
        "Airport Rail Link": { name: "Airport Rail Link", colorClass: "line-arl" },
        "SRT Dark Red Line": { name: "SRT สายสีแดงเข้ม", colorClass: "line-srt-red" },
        "Interchange": { name: "เดินเปลี่ยนสาย", colorClass: "line-walk" }
    };
    return lines[lineCode] || { name: lineCode, colorClass: "line-walk" };
}

// ----- 5. Core Functions -----
// 5.1. Load the list of all stations from the backend.
async function loadAllStations() {
    // (เช็คให้แน่ใจว่า element พร้อมใช้)
    if (!startInput || !endInput || !stationsDatalist) return; 
    
    try {
        const response = await fetch(`${API_URL}/api/all-stations`); 
        if (!response.ok) {
            throw new Error('ไม่สามารถโหลดข้อมูลสถานีได้');
        }
        const stations = await response.json();
        allStations = stations; 
        
        populateStations(stations);
        
        startInput.placeholder = "เช่น สยาม, อโศก, สีลม";
        endInput.placeholder = "เช่น หมอชิต, สุขุมวิท, บางหว้า";
        if(searchButton) searchButton.disabled = false;

    } catch (error) {
        console.error("Error loading stations:", error);
        startInput.placeholder = "เกิดข้อผิดพลาด";
        endInput.placeholder = "เกิดข้อผิดพลาด";
        showError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองรีเฟรชหน้า");
        if(resultsContainer) resultsContainer.classList.remove('hidden');
    }
}

// 5.2. Add stations to the Datalist (search box)
function populateStations(stations) {
    if (!stationsDatalist) return;
    stationsDatalist.innerHTML = ''; 
    stations.forEach(station => {
        const option = document.createElement('option');
        option.value = station;
        stationsDatalist.appendChild(option);
    });
}

// 5.3. Functions that work when the "Find Route" button is pressed
async function onSearchSubmit(e) {
    e.preventDefault(); 
    if (!startInput || !endInput) return; // (เช็คเผื่อไว้)

    const startStation = startInput.value;
    const endStation = endInput.value;

    if (!allStations.includes(startStation) || !allStations.includes(endStation)) {
        showError("ไม่พบสถานีที่ระบุ กรุณาเลือกจากในรายการ");
        if(resultsContainer) resultsContainer.classList.remove('hidden');
        return;
    }
    if (startStation === endStation) {
        showError("สถานีต้นทางและปลายทางต้องไม่ซ้ำกัน");
        if(resultsContainer) resultsContainer.classList.remove('hidden');
        return;
    }

    hideError(); // <-- **นี่คือจุดที่เคย Error (ตอนนี้จะทำงานได้แล้ว)**
    hideResults();
    showLoading();
    if(resultsContainer) resultsContainer.classList.remove('hidden'); 

    try {
        const pathData = await findPathFromAPI(startStation, endStation);
        displayResults(pathData);

    } catch (error) {
        console.error("Error finding path:", error);
        showError(error.message || "เกิดข้อผิดพลาดในการค้นหาเส้นทาง");
    } finally {
        hideLoading(); 
    }
}

// 5.4. API call function to search for routes
async function findPathFromAPI(start, end) {
    const params = new URLSearchParams({
        start_station: start,
        end_station: end
    });
    
    const response = await fetch(`${API_URL}/api/find-path?${params.toString()}`);
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'ไม่สามารถค้นหาเส้นทางได้');
    }
    
    const data = await response.json();
    return data;
}

// ----- 6. UI Display Functions -----
// (ฟังก์ชันเหล่านี้อยู่นอก DOMContentLoaded แต่จะ "เห็น" ตัวแปร Global)

function displayResults(data) {
    if (!totalTimeEl || !totalTransfersEl || !pathStepsEl || !resultsContent) return;
    
    totalTimeEl.textContent = `${data.total_time} นาที`;
    totalTransfersEl.textContent = `${data.total_transfers} ครั้ง`;
    pathStepsEl.innerHTML = '';

    data.steps.forEach(step => {
        const li = document.createElement('li');
        const lineInfo = getLineDetails(step.line);
        
        li.className = `timeline-item ${lineInfo.colorClass}`; 
        
        let innerHTML = '';
        if (step.type === 'ride') {
            innerHTML = `
                <h4 class="font-semibold text-gray-800">ขึ้น ${lineInfo.name}</h4>
                <p class="text-gray-600">จาก <span class="font-medium">${step.from}</span> ไปยัง <span class="font-medium">${step.to}</span> (${step.stops} สถานี)</p>
                <time class="text-sm text-gray-500">ประมาณ ${step.time} นาที</time>
            `;
        } else if (step.type === 'walk') {
            innerHTML = `
                <h4 class="font-semibold text-gray-800">${lineInfo.name}</h4>
                <p class="text-gray-600">จาก <span class="font-medium">${step.from}</span> ไปยัง <span class="font-medium">${step.to}</span></p>
                <time class="text-sm text-gray-500">ประมาณ ${step.time} นาที</time>
            `;
        }
        li.innerHTML = innerHTML;
        pathStepsEl.appendChild(li);
    });

    resultsContent.classList.remove('hidden');
}

function showLoading() {
    if (loadingSpinner) loadingSpinner.classList.remove('hidden');
}

function hideLoading() {
    if (loadingSpinner) loadingSpinner.classList.add('hidden');
}

function showError(message) {
    if (errorText) errorText.textContent = message;
    if (errorMessage) errorMessage.classList.remove('hidden');
}

function hideError() {
    if (errorMessage) errorMessage.classList.add('hidden');
}

function hideResults() {
    if (resultsContent) resultsContent.classList.add('hidden');
}

// ----- 7. Sidebar Functions -----

async function loadSidebarData() {
    if (!sidebarListElement) return; 
    
    sidebarListElement.innerHTML = '<div class="p-3 text-gray-400">Loading lines...</div>';
    
    try {
        const response = await fetch(`${API_URL}/api/lines-and-stations`);
        if (!response.ok) throw new Error('Failed to fetch lines');
        
        transitData = await response.json();
        showLinesList();

    } catch (error) {
        console.error("Error loading sidebar data:", error);
        if (sidebarListElement) {
            sidebarListElement.innerHTML = '<div class="p-3 text-red-400">Failed to load data</div>';
        }
    }
}

function showLinesList() {
    if (!sidebarListElement) return;
    sidebarListElement.innerHTML = ''; 
    
    for (const lineName in transitData) {
        const lineItem = document.createElement('div');
        lineItem.className = 'p-3 hover:bg-gray-700 rounded-md cursor-pointer transition-colors'; 
        lineItem.textContent = lineName;
        lineItem.onclick = () => showStationsForLine(lineName);
        sidebarListElement.appendChild(lineItem);
    }
}

function showStationsForLine(lineName) {
    if (!sidebarListElement) return;
    sidebarListElement.innerHTML = ''; 
    
    const backButton = document.createElement('div');
    backButton.className = 'p-3 font-bold text-indigo-400 hover:bg-gray-700 rounded-md cursor-pointer transition-colors'; 
    backButton.textContent = '← Back to All Lines';
    backButton.onclick = showLinesList;
    sidebarListElement.appendChild(backButton);

    const title = document.createElement('h3');
    title.className = 'p-3 text-gray-400 text-sm font-semibold uppercase mt-2';
    title.textContent = lineName;
    sidebarListElement.appendChild(title);

    const stations = transitData[lineName];
    for (const stationName of stations) {
        const stationItem = document.createElement('div');
        stationItem.className = 'p-3 hover:bg-gray-700 rounded-md cursor-pointer transition-colors'; 
        stationItem.textContent = stationName;
        
        stationItem.onclick = () => {
            // (เช็คให้แน่ใจว่า targetInput มีจริง)
            const targetInput = document.getElementById(activeInputTarget);
            if (targetInput) {
                targetInput.value = stationName;
            }
        };
        
        sidebarListElement.appendChild(stationItem);
    }
}