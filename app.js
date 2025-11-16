// ----- 0. Configuration -----
const API_BASE_URL = "https://bkk-transit-website.onrender.com"; 

// ----- 1. Global Variables -----
let allStations = []; 

// ----- 2. DOM Elements -----
document.addEventListener('DOMContentLoaded', () => {
    // Connect JavaScript variables to HTML elements
    const searchForm = document.getElementById('search-form');
    const startInput = document.getElementById('start-station');
    const endInput = document.getElementById('end-station');
    const stationsDatalist = document.getElementById('stations-list');
    const searchButton = searchForm.querySelector('button[type="submit"]');

    const resultsContainer = document.getElementById('results-container');
    const loadingSpinner = document.getElementById('loading-spinner');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const resultsContent = document.getElementById('results-content');
    
    const totalTimeEl = document.getElementById('total-time');
    const totalTransfersEl = document.getElementById('total-transfers');
    const pathStepsEl = document.getElementById('path-steps');

    // ----- 3. Helper Functions -----
    // Function for map station line (from Backend) to name and color in CSS
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

    // ----- 4. Core Functions -----
    // 4.1. Load the list of all stations from the backend.
    async function loadAllStations() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/all-stations`); 
            if (!response.ok) {
                throw new Error('ไม่สามารถโหลดข้อมูลสถานีได้');
            }
            const stations = await response.json();
            allStations = stations; 
            
            populateStations(stations);
            
            startInput.placeholder = "เช่น สยาม, อโศก, สีลม";
            endInput.placeholder = "เช่น หมอชิต, สุขุมวิท, บางหว้า";
            searchButton.disabled = false;

        } catch (error) {
            console.error("Error loading stations:", error);
            startInput.placeholder = "เกิดข้อผิดพลาด";
            endInput.placeholder = "เกิดข้อผิดพลาด";
            showError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองรีเฟรชหน้า");
            resultsContainer.classList.remove('hidden');
        }
    }

    // 4.2. Add stations to the Datalist (search box)
    function populateStations(stations) {
        stationsDatalist.innerHTML = ''; 
        stations.forEach(station => {
            const option = document.createElement('option');
            option.value = station;
            stationsDatalist.appendChild(option);
        });
    }

    // 4.3. Functions that work when the "Find Route" button is pressed
    async function onSearchSubmit(e) {
        e.preventDefault(); 

        const startStation = startInput.value;
        const endStation = endInput.value;

        if (!allStations.includes(startStation) || !allStations.includes(endStation)) {
            showError("ไม่พบสถานีที่ระบุ กรุณาเลือกจากในรายการ");
            resultsContainer.classList.remove('hidden');
            return;
        }
        if (startStation === endStation) {
            showError("สถานีต้นทางและปลายทางต้องไม่ซ้ำกัน");
            resultsContainer.classList.remove('hidden');
            return;
        }

        hideError();
        hideResults();
        showLoading();
        resultsContainer.classList.remove('hidden'); 

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
    
    // 4.4. API call function to search for routes
    async function findPathFromAPI(start, end) {
        const params = new URLSearchParams({
            start_station: start,
            end_station: end
        });
        
        const response = await fetch(`${API_BASE_URL}/api/find-path?${params.toString()}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'ไม่สามารถค้นหาเส้นทางได้');
        }
        
        const data = await response.json();
        return data;
    }

    // ----- 5. UI Display Functions -----
    
    function displayResults(data) {
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
        loadingSpinner.classList.remove('hidden');
    }

    function hideLoading() {
        loadingSpinner.classList.add('hidden');
    }

    function showError(message) {
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }

    function hideResults() {
        resultsContent.classList.add('hidden');
    }
    
    // ----- 6. Initial Setup -----
    searchForm.addEventListener('submit', onSearchSubmit);
    loadAllStations(); 

});