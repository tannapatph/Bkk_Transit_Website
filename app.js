// ----- 0. Configuration -----
// **แก้ไข:** ลบ / (slash) ตัวสุดท้ายออก เพื่อป้องกัน // (double slash)
const API_URL = "https://bkk-transit-website.onrender.com"; 

// ----- 1. Global Variables -----
let allStations = []; 
let transitData = {}; // **เพิ่ม:** สำหรับเก็บข้อมูลสาย/สถานี
let sidebarListElement = null; // **เพิ่ม:** สำหรับเก็บ DOM ของ sidebar

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

    // **เพิ่ม:** เชื่อมต่อกับ Sidebar ที่สร้างใหม่
    sidebarListElement = document.getElementById('sidebar-list');

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
            // **แก้ไข:** ใช้ตัวแปร API_URL
            const response = await fetch(`${API_URL}/api/all-stations`); 
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
        
        // **แก้ไข:** ใช้ตัวแปร API_URL
        const response = await fetch(`${API_URL}/api/find-path?${params.toString()}`);
        
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

    // ----- 6. NEW Sidebar Functions -----
    
    // 6.1. ฟังก์ชันสำหรับดึงข้อมูล (API ใหม่)
    async function loadSidebarData() {
        if (!sidebarListElement) return; // ถ้าไม่มี sidebar ก็ไม่ต้องทำ
        
        sidebarListElement.innerHTML = '<div classclass="sidebar-item loading">Loading lines...</div>';
        
        try {
            const response = await fetch(`${API_URL}/api/lines-and-stations`);
            if (!response.ok) throw new Error('Failed to fetch lines');
            
            transitData = await response.json();
            
            // เริ่มต้น: ให้แสดง "รายการสาย" ก่อน
            showLinesList();

        } catch (error) {
            console.error("Error loading sidebar data:", error);
            if (sidebarListElement) {
                sidebarListElement.innerHTML = '<div class="sidebar-item error">Failed to load data</div>';
            }
        }
    }

    // 6.2. ฟังก์ชันสำหรับ "แสดงรายการสาย" (หน้าแรกของ Sidebar)
    function showLinesList() {
        if (!sidebarListElement) return;

        sidebarListElement.innerHTML = ''; // เคลียร์ sidebar
        
        // (คุณสามารถลบ Title ออกได้ถ้าไม่ต้องการ)
        // const title = document.createElement('h3');
        // title.className = 'sidebar-title'; 
        // title.textContent = '--- All Lines ---';
        // sidebarListElement.appendChild(title);
        
        // วนลูปสร้าง "สาย"
        for (const lineName in transitData) {
            const lineItem = document.createElement('div');
            // **แก้ไข:** เพิ่ม Tailwind classes ให้สวยงาม
            lineItem.className = 'p-3 hover:bg-gray-700 rounded-md cursor-pointer transition-colors'; 
            lineItem.textContent = lineName;
            
            // *** สำคัญ: เมื่อคลิกสาย ให้ไปหน้า "แสดงสถานี" ***
            lineItem.onclick = () => showStationsForLine(lineName);
            
            sidebarListElement.appendChild(lineItem);
        }
    }

    // 6.3. ฟังก์ชันสำหรับ "แสดงสถานีในสาย" (หน้าที่สอง)
    function showStationsForLine(lineName) {
        if (!sidebarListElement) return;

        sidebarListElement.innerHTML = ''; // เคลียร์ sidebar
        
        // --- 1. สร้างปุ่ม "ย้อนกลับ" ---
        const backButton = document.createElement('div');
        // **แก้ไข:** เพิ่ม Tailwind classes ให้สวยงาม
        backButton.className = 'p-3 font-bold text-indigo-400 hover:bg-gray-700 rounded-md cursor-pointer transition-colors'; 
        backButton.textContent = '← Back to All Lines';
        
        // *** สำคัญ: เมื่อคลิกย้อนกลับ ให้ไปหน้า "แสดงสาย" ***
        backButton.onclick = showLinesList;
        sidebarListElement.appendChild(backButton);

        // --- 2. สร้าง Title (ชื่อสาย) (ถ้าต้องการ) ---
        const title = document.createElement('h3');
        title.className = 'p-3 text-gray-400 text-sm font-semibold uppercase mt-2';
        title.textContent = lineName;
        sidebarListElement.appendChild(title);

        // --- 3. วนลูปสร้าง "สถานี" ---
        const stations = transitData[lineName];
        for (const stationName of stations) {
            const stationItem = document.createElement('div');
            // **แก้ไข:** เพิ่ม Tailwind classes ให้สวยงาม
            stationItem.className = 'p-3 hover:bg-gray-700 rounded-md cursor-pointer transition-colors'; 
            stationItem.textContent = stationName;
            
            // **เพิ่ม:** เมื่อคลิกสถานี ให้เติมชื่อลงในช่อง "สถานีต้นทาง"
            stationItem.onclick = () => {
                const startInput = document.getElementById('start-station');
                startInput.value = stationName;
            };
            
            sidebarListElement.appendChild(stationItem);
        }
    }
    
    // ----- 7. Initial Setup -----
    searchForm.addEventListener('submit', onSearchSubmit);
    loadAllStations(); // <-- โหลดข้อมูลสำหรับ datalist (ยังจำเป็น)
    loadSidebarData(); // <-- **เพิ่ม:** โหลดข้อมูลสำหรับ sidebar

});