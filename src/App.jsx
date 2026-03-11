import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, LayersControl } from 'react-leaflet';
import { Target, RefreshCw, Search, Trash2, Navigation2, X, LocateFixed, Layers } from 'lucide-react';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet-routing-machine';

// Fix Icon Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const currentHost = window.location.hostname;
// Buka file App.jsx di folder Frontend kamu
// Ganti URL lama (localhost) menjadi URL Vercel Backend
const API_URL = "https://kurir-be.vercel.app/api/locations";

// Komponen Navigasi Garis Jalan
function RoutingMachine({ userPos, targetPos }) {
  const map = useMap();
  const routingControlRef = useRef(null);

  useEffect(() => {
    if (!map || !userPos || !targetPos) return;
    routingControlRef.current = L.Routing.control({
      waypoints: [L.latLng(userPos[0], userPos[1]), L.latLng(targetPos[0], targetPos[1])],
      lineOptions: { styles: [{ color: '#3b82f6', weight: 6, opacity: 0.9 }] },
      createMarker: () => null,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: false,
      show: false
    }).addTo(map);

    return () => { if (routingControlRef.current) map.removeControl(routingControlRef.current); };
  }, [map, userPos, targetPos]);
  return null;
}

function MapController({ position, isTracking, forceCenter }) {
  const map = useMap();
  useEffect(() => { if (isTracking && position) map.panTo(position, { animate: true }); }, [position, isTracking, map]);
  useEffect(() => { if (forceCenter && position) map.flyTo(position, 19, { duration: 1.5 }); }, [forceCenter, position, map]);
  return null;
}

function App() {
  const [position, setPosition] = useState([-2.9833, 104.7644]); // Default Palembang
  const [markers, setMarkers] = useState([]);
  const [isTracking, setIsTracking] = useState(false);
  const [targetDestination, setTargetDestination] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [distance, setDistance] = useState(null);
  const [forceCenterTrigger, setForceCenterTrigger] = useState(0);
  const watchId = useRef(null);

  const fetchMarkers = async () => {
    try {
      const response = await axios.get(API_URL);
      setMarkers(response.data.map(item => ({
        id: item._id,
        lat: item.location.coordinates[1],
        lng: item.location.coordinates[0],
        noRumah: item.noRumah
      })));
    } catch (error) { console.error(error); }
  };

  useEffect(() => {
    fetchMarkers();
    return () => { if (watchId.current) navigator.geolocation.clearWatch(watchId.current); };
  }, []);

  useEffect(() => {
    if (targetDestination && position) {
      const from = L.latLng(position[0], position[1]);
      const to = L.latLng(targetDestination.lat, targetDestination.lng);
      const d = from.distanceTo(to);
      setDistance(d > 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m");
    }
  }, [position, targetDestination]);

  const findMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        setForceCenterTrigger(prev => prev + 1);
      },
      (err) => alert("GPS Error"),
      { enableHighAccuracy: true }
    );
  };

  const toggleTracking = () => {
    if (isTracking) {
      navigator.geolocation.clearWatch(watchId.current);
      setIsTracking(false);
    } else {
      setIsTracking(true);
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
        (err) => { alert("GPS Error"); setIsTracking(false); },
        { enableHighAccuracy: true }
      );
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const found = markers.find(m => m.noRumah.toLowerCase().includes(searchQuery.toLowerCase()));
    if (found) { setPosition([found.lat, found.lng]); setForceCenterTrigger(prev => prev + 1); }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Hapus lokasi ini?")) { await axios.delete(`${API_URL}/${id}`); fetchMarkers(); }
  };

  return (
    <div className="relative h-screen w-full bg-slate-100 overflow-hidden font-sans">
      
      {/* Search & Info */}
      <div className="absolute top-4 inset-x-0 z-[1000] px-4 flex flex-col gap-2">
        <form onSubmit={handleSearch} className="flex gap-2 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl p-1 border border-white">
          <input 
            type="text" placeholder="Cari No. Rumah..." 
            className="flex-1 bg-transparent border-none outline-none text-sm px-4 py-3"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="bg-blue-600 text-white p-3 rounded-xl shadow-lg"><Search size={20} /></button>
        </form>

        {targetDestination && (
          <div className="bg-blue-600/90 backdrop-blur-md text-white p-3 rounded-2xl shadow-xl flex justify-between items-center border border-white/20">
            <div className="flex items-center gap-2">
              <Navigation2 size={18} className="rotate-45" />
              <span className="text-xs font-bold">#{targetDestination.noRumah}</span>
            </div>
            <span className="bg-white text-blue-600 px-3 py-1 rounded-full text-xs font-black">{distance}</span>
          </div>
        )}
      </div>

      <MapContainer center={position} zoom={17} className="h-full w-full z-0" zoomControl={false}>
        <LayersControl position="topright">
          {/* PILIHAN MODE PETA */}
          <LayersControl.BaseLayer checked name="Peta Jalan">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>
          
          <LayersControl.BaseLayer name="Mode Satelit">
            <TileLayer 
              url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" 
              attribution="&copy; Google Maps"
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Satelit + Jalan">
            <TileLayer 
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" 
              attribution="&copy; Google Maps"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <MapController position={position} isTracking={isTracking} forceCenter={forceCenterTrigger} />
        {targetDestination && <RoutingMachine userPos={position} targetPos={[targetDestination.lat, targetDestination.lng]} />}

        <Marker position={position} icon={L.divIcon({ 
          className: 'relative',
          html: `<div class="w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-2xl ${isTracking ? 'animate-pulse' : ''}"></div>`
        })} />

        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]}>
            <Popup>
              <div className="p-1 min-w-[130px]">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-black text-lg">#{m.noRumah}</span>
                  <button onClick={() => handleDelete(m.id)} className="text-red-400 p-1"><Trash2 size={16}/></button>
                </div>
                <button 
                  onClick={() => { setTargetDestination(m); setIsTracking(true); }}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl flex justify-center items-center gap-2 text-xs font-bold"
                >
                  <Navigation2 size={14} /> ANTAR KE SINI
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
        
        <MapEvents fetchMarkers={fetchMarkers} API_URL={API_URL} />
      </MapContainer>

      {/* Control Buttons */}
      <div className="absolute bottom-10 right-6 z-[1000] flex flex-col gap-4">
        {targetDestination && (
          <button onClick={() => setTargetDestination(null)} className="bg-red-500 p-4 rounded-2xl text-white shadow-xl border-2 border-white/20 active:scale-90">
            <X size={24} />
          </button>
        )}
        <button onClick={findMyLocation} className="bg-white p-4 rounded-2xl text-slate-700 shadow-xl border border-slate-100 active:scale-90">
          <LocateFixed size={28} />
        </button>
        <button onClick={toggleTracking} className={`${isTracking ? 'bg-green-500 shadow-green-400/50' : 'bg-blue-600 shadow-blue-400/50'} p-5 rounded-3xl text-white shadow-2xl border-2 border-white/20 active:scale-90 transition-all`}>
          <Target size={32} />
        </button>
      </div>

      <div className="absolute bottom-10 left-6 z-[1000]">
         <div className={`px-4 py-2 rounded-full text-[10px] font-bold border shadow-lg ${isTracking ? 'bg-green-100 border-green-500 text-green-700' : 'bg-red-100 border-red-500 text-red-700'}`}>
           {isTracking ? 'IKUTI JALAN' : 'MANUAL'}
         </div>
      </div>
      
      {/* CSS untuk memindahkan icon Layers Leaflet agar lebih enak di HP */}
      <style>{`
        .leaflet-control-layers { 
          border-radius: 12px !important; 
          margin-top: 80px !important; 
          margin-right: 15px !important;
          border: none !important;
          box-shadow: 0 4px 15px rgba(0,0,0,0.2) !important;
        }
      `}</style>
    </div>
  );
}

function MapEvents({ fetchMarkers, API_URL }) {
  useMapEvents({
    async click(e) {
      const noRumah = prompt("Nomor Rumah:");
      if (!noRumah) return;
      try {
        await axios.post(API_URL, { noRumah, lat: e.latlng.lat, lng: e.latlng.lng, location: { type: 'Point', coordinates: [e.latlng.lng, e.latlng.lat] } });
        fetchMarkers();
      } catch (err) { alert("Gagal Simpan"); }
    }
  });
  return null;
}

export default App;