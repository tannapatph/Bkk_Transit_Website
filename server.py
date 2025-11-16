import pandas as pd
import networkx as nx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from typing import List, Dict, Any
import re # Import Regular Expressions

# ----- 1. Configuration -----
CSV_FILE_PATH = "connections.csv" 

# ----- 2. Global Variables -----
G = nx.Graph()
all_stations = set()
station_display_to_internal_map = {}

# ----- 3. Helper Functions (NEW) -----
def clean_station_name(name: str) -> str:
    """ 'Siam (Sukhumvit)' -> 'Siam' """
    return re.sub(r'\s*\([^)]*\)', '', name).strip()

# ----- 4. Graph Loading Functions (UPDATED) -----
def load_graph_from_csv():
    global G, all_stations, station_display_to_internal_map
    try:
        df = pd.read_csv(CSV_FILE_PATH, comment='#', dtype={'time': float}) 
    except FileNotFoundError:
        print(f"!!! CRITICAL ERROR: ไม่พบไฟล์ '{CSV_FILE_PATH}'")
        return
    except Exception as e:
        print(f"!!! CRITICAL ERROR: เกิดปัญหาตอนอ่าน CSV: {e}")
        return

    G = nx.Graph()
    all_stations = set()
    station_display_to_internal_map = {}
    
    print("กำลังสร้าง Graph จาก CSV (เวอร์ชัน FINAL)...")
    
    for _, row in df.iterrows():
        if 'station_A' not in row or 'station_B' not in row or 'line' not in row or 'time' not in row:
            print(f"ข้ามแถวที่มีข้อมูลไม่ครบ: {row}")
            continue

        # 1. Read information (e.g. "Siam (Sukhumvit)")
        internal_station_a = str(row['station_A']).strip()
        internal_station_b = str(row['station_B']).strip()
        line = str(row['line']).strip()
        weight = float(row['time'])
        
        G.add_edge(internal_station_a, internal_station_b, line=line, weight=weight)
        
        # 2. Create a "display name" (e.g. "Siam")
        display_a = clean_station_name(internal_station_a)
        display_b = clean_station_name(internal_station_b)
        
        # 3. Create Map
        all_stations.add(display_a)
        all_stations.add(display_b)

        # If the display name is not already in the map, add it.
        if display_a not in station_display_to_internal_map:
            station_display_to_internal_map[display_a] = []
        if display_b not in station_display_to_internal_map:
            station_display_to_internal_map[display_b] = []

        # Add "Full Name" (Internal) to the list of display names.
        if internal_station_a not in station_display_to_internal_map[display_a]:
            station_display_to_internal_map[display_a].append(internal_station_a)
        if internal_station_b not in station_display_to_internal_map[display_b]:
            station_display_to_internal_map[display_b].append(internal_station_b)

    print(f"สร้าง Graph สำเร็จ: {len(all_stations)} สถานี, {G.number_of_edges()} เส้นทาง")

# ----- 5. Function format_path_to_json -----
def format_path_to_json(path: List[str]) -> Dict[str, Any]:
    if not path:
        return {}
    steps = []
    total_time = 0
    total_transfers = 0 
    current_line = None
    current_step_nodes = []

    for i in range(len(path) - 1):
        u, v = path[i], path[i+1] # u, v is full name ("Siam (Sukhumvit)")
        edge_data = G.get_edge_data(u, v)
        if edge_data is None:
            continue
            
        line = edge_data['line']

        if current_line is None:
            current_line = line
            current_step_nodes = [u, v]
        elif line == current_line:
            current_step_nodes.append(v)
        else:
            # --- "Change line" ---
            step_time = sum(G.get_edge_data(current_step_nodes[j], current_step_nodes[j+1])['weight'] for j in range(len(current_step_nodes)-1))
            
            steps.append({
                "type": "ride" if current_line != "Interchange" else "walk",
                "line": current_line,
                "from": clean_station_name(current_step_nodes[0]), 
                "to": clean_station_name(current_step_nodes[-1]), 
                "stops": len(current_step_nodes) - 1,
                "time": round(step_time) 
            })
            
            if current_line == "Interchange":
                total_transfers += 1
                
            current_line = line
            current_step_nodes = [u, v]

    # Save the last step
    if current_step_nodes:
        step_time = sum(G.get_edge_data(current_step_nodes[j], current_step_nodes[j+1])['weight'] for j in range(len(current_step_nodes)-1))
        
        steps.append({
            "type": "ride" if current_line != "Interchange" else "walk",
            "line": current_line,
            "from": clean_station_name(current_step_nodes[0]), 
            "to": clean_station_name(current_step_nodes[-1]), 
            "stops": len(current_step_nodes) - 1,
            "time": round(step_time)
        })

    final_total_time = sum(step['time'] for step in steps)
    return {
        "total_time": final_total_time,
        "total_transfers": total_transfers, 
        "steps": steps
    }

# ----- 6. FastAPI Application -----
app = FastAPI()

origins = [ "http://127.0.0.1:5500", "http://localhost:5500", ]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    load_graph_from_csv()

@app.get("/api/all-stations")
def get_all_stations():
    if not all_stations:
        raise HTTPException(status_code=500, detail="ไม่สามารถโหลดข้อมูลสถานีได้")
    return sorted(list(all_stations)) 

@app.get("/api/find-path")
def find_path(
    start_station: str = Query(..., min_length=1), # (ex. "Siam")
    end_station: str = Query(..., min_length=1)   # (ex. "Asok")
):
    # 1. Find all "Full Names" that match the displayed name.
    internal_start_nodes = station_display_to_internal_map.get(start_station)
    internal_end_nodes = station_display_to_internal_map.get(end_station)

    if not internal_start_nodes:
        raise HTTPException(status_code=404, detail=f"ไม่พบสถานี: {start_station}")
    if not internal_end_nodes:
        raise HTTPException(status_code=404, detail=f"ไม่พบสถานี: {end_station}")

    # 2. Find the shortest path from "all" possibilities.
    # (ex. find Siam (Sukhumvit) -> ... and Siam (Silom) -> ...)
    best_path = None
    min_time = float('inf')

    try:
        for start_node in internal_start_nodes:
            for end_node in internal_end_nodes:
                try:
                    # Find the weight (time) of the path.
                    current_time = nx.shortest_path_length(G, source=start_node, target=end_node, weight='weight')
                    if current_time < min_time:
                        min_time = current_time
                        # (We'll find the full path later to save time.)
                        best_path = nx.shortest_path(G, source=start_node, target=end_node, weight='weight')
                except nx.NetworkXNoPath:
                    continue # Skip this pair if there is no path.
        
        if best_path is None:
            raise nx.NetworkXNoPath # I can't find the route at all.

        formatted_response = format_path_to_json(best_path)
        return formatted_response
    
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail=f"ไม่พบเส้นทางเชื่อมต่อระหว่าง {start_station} และ {end_station}")
    except Exception as e:
        print(f"Error: {e}") 
        raise HTTPException(status_code=500, detail=str(e))

# ----- 7. Run Server -----
if __name__ == "__main__":
    print(f"--- starting server on http://127.0.0.1:8000 ---")
    print(f"--- allowing connections from http://127.0.0.1:5500 ---")
    uvicorn.run(app, host="127.0.0.1", port=8000)