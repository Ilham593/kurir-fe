import React, { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  LayersControl,
} from "react-leaflet";
import {
  Target,
  Search,
  Trash2,
  Navigation2,
  X,
  LocateFixed,
  Compass,
  Map as MapIcon,
  Eye,
  Bike,
  Car,
} from "lucide-react";
import axios from "axios";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet-routing-machine";

// Fix Icon Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const currentHost = window.location.hostname;
const API_URL =
  currentHost === "localhost" || currentHost === "127.0.0.1"
    ? "http://localhost:5000/api/locations"
    : "https://kurir-be.vercel.app/api/locations";

// KOMPONEN ROUTING
function RoutingMachine({ userPos, targetPos, mode }) {
  const map = useMap();
  const routingControlRef = useRef(null);

  useEffect(() => {
    if (!map || !userPos || !targetPos) return;

    // Fungsi pembersihan yang sangat aman
    const safeCleanup = () => {
      if (routingControlRef.current) {
        try {
          // 1. Kosongkan waypoint dulu agar rute tidak mencoba menggambar ulang
          routingControlRef.current.setWaypoints([]);
          // 2. Hapus control dari map
          map.removeControl(routingControlRef.current);
        } catch (e) {
          // Abaikan error internal leaflet-routing-machine
        } finally {
          routingControlRef.current = null;
        }
      }
    };

    safeCleanup();

    const osrmProfile = mode === "bike" ? "foot" : "car";

    try {
      routingControlRef.current = L.Routing.control({
        waypoints: [
          L.latLng(userPos[0], userPos[1]),
          L.latLng(targetPos[0], targetPos[1]),
        ],

        lineOptions: {
          styles: [
            {
              color: mode === "car" ? "#3b82f6" : "#10b981",
              weight: 6,
              opacity: 0.8,
            },
          ],
        },

        router: L.Routing.osrmv1({
          serviceUrl: "https://router.project-osrm.org/route/v1",
          profile: osrmProfile,
        }),

        createMarker: () => null,
        addWaypoints: false,
        draggableWaypoints: false,

        show: false,
        itinerary: false,
        routeWhileDragging: false,

        showAlternatives: false,
        collapsible: true,

        // PENTING
        containerClassName: "hidden",
      }).addTo(map);
    } catch (err) {
      console.warn("Routing error caught:", err);
    }

    return () => safeCleanup();
  }, [map, userPos, targetPos, mode]);

  return null;
}

function MapController({ position, isTracking, forceCenter, rotation }) {
  const map = useMap();
  useEffect(() => {
    map.getContainer().style.transform = `rotate(${rotation}deg)`;
  }, [rotation, map]);

  useEffect(() => {
    if (!isTracking || !position) return;
    map.panTo(position, { animate: true, duration: 1.0 });
  }, [position, isTracking, map]);

  useEffect(() => {
    if (forceCenter && position) map.flyTo(position, 18, { duration: 1.5 });
  }, [forceCenter, position, map]);

  return null;
}

function App() {
  const [position, setPosition] = useState([-2.9833, 104.7644]);
  const [markers, setMarkers] = useState([]);
  const [isTracking, setIsTracking] = useState(false);
  const [targetDestination, setTargetDestination] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [distance, setDistance] = useState(null);
  const [forceCenterTrigger, setForceCenterTrigger] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [hasAlerted, setHasAlerted] = useState(false);
  const [travelMode, setTravelMode] = useState("bike");
  const watchId = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const fetchMarkers = async () => {
    try {
      const response = await axios.get(API_URL);
      setMarkers(
        response.data.map((item) => ({
          id: item._id,
          lat: item.location.coordinates[1],
          lng: item.location.coordinates[0],
          noRumah: item.noRumah,
          address: item.address || "Alamat tidak tersedia",
        })),
      );
    } catch (error) {
      console.error("API Error:", error);
    }
  };

  useEffect(() => {
    fetchMarkers();
    return () => {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  const handleDelete = async (id) => {
    if (window.confirm("Hapus lokasi ini?")) {
      try {
        await axios.delete(`${API_URL}/${id}`);
        if (targetDestination?.id === id) setTargetDestination(null);
        fetchMarkers();
      } catch (error) {
        alert("Gagal hapus");
      }
    }
  };

  useEffect(() => {
    if (targetDestination && position) {
      const from = L.latLng(position[0], position[1]);
      const to = L.latLng(targetDestination.lat, targetDestination.lng);
      const d = from.distanceTo(to);
      setDistance(
        d > 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m",
      );

      if (d < 30 && !hasAlerted) {
        const msg = new SpeechSynthesisUtterance(
          `Tujuan dekat. Rumah nomor ${targetDestination.noRumah}`,
        );
        msg.lang = "id-ID";
        window.speechSynthesis.speak(msg);
        setHasAlerted(true);
      }
      if (d > 50 && hasAlerted) setHasAlerted(false);
    }
  }, [position, targetDestination, hasAlerted]);

  const findMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        setForceCenterTrigger((prev) => prev + 1);
      },
      (err) => alert("GPS Error"),
      { enableHighAccuracy: true },
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
        (err) => {
          alert("GPS Error");
          setIsTracking(false);
        },
        { enableHighAccuracy: true, distanceFilter: 2 },
      );
    }
  };

  return (
    <div className="relative h-screen w-full bg-slate-100 overflow-hidden font-sans select-none">
      {/* HEADER SECTION - Layered UI */}
      {/* SEARCH BAR */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-[3000]">
        <form
          onSubmit={(e) => {
            e.preventDefault();

            const found = markers.find(
              (m) => m.noRumah.toLowerCase() === searchQuery.toLowerCase(),
            );

            if (found) {
              setTargetDestination(found);
              setIsTracking(true);
              setHasAlerted(false);
              setForceCenterTrigger((prev) => prev + 1);
              setSuggestions([]);
            }
          }}
          className="flex gap-2 bg-white rounded-2xl shadow-xl p-1.5 border border-slate-200"
        >
          <input
            type="text"
            placeholder="Cari No. Rumah..."
            className="flex-1 bg-transparent outline-none text-base px-3 py-2 font-medium text-slate-800"
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              setSearchQuery(value);

              if (!value) {
                setSuggestions([]);
                return;
              }

              const filtered = markers.filter((m) =>
                m.noRumah.toLowerCase().includes(value.toLowerCase()),
              );

              setSuggestions(filtered.slice(0, 6));
            }}
          />

          <button
            type="submit"
            className="bg-blue-600 text-white p-3 rounded-xl shadow-md active:scale-95"
          >
            <Search size={20} />
          </button>
        </form>

        {/* AUTOCOMPLETE */}
        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 z-[4000] overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSearchQuery(s.noRumah);
                  setTargetDestination(s);
                  setIsTracking(true);
                  setHasAlerted(false);
                  setSuggestions([]);
                  setForceCenterTrigger((prev) => prev + 1);
                }}
                className="w-full text-left px-4 py-3 hover:bg-slate-100 border-b last:border-none"
              >
                <div className="font-bold text-slate-800">#{s.noRumah}</div>
                <div className="text-xs text-slate-500 truncate">
                  {s.address}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MAP CONTAINER */}
      <div className="h-full w-full">
        <MapContainer
          center={position}
          zoom={17}
          maxZoom={18}
          className="h-full w-full z-0"
          zoomControl={false}
          attributionControl={false}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Jalan">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satelit">
              <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" />
            </LayersControl.BaseLayer>
          </LayersControl>

          <MapController
            position={position}
            isTracking={isTracking}
            forceCenter={forceCenterTrigger}
            rotation={rotation}
          />

          {targetDestination && (
            <RoutingMachine
              userPos={position}
              targetPos={[targetDestination.lat, targetDestination.lng]}
              mode={travelMode}
            />
          )}

          {/* User Marker */}
          <Marker
            position={position}
            icon={L.divIcon({
              className: "custom-div-icon",
              html: `<div class="relative flex items-center justify-center"><div class="absolute w-8 h-8 bg-blue-500/30 rounded-full animate-ping"></div><div class="w-6 h-6 bg-blue-600 rounded-full border-4 border-white shadow-xl relative z-10"></div></div>`,
            })}
          />

          {markers.map((m) => (
            <Marker key={m.id} position={[m.lat, m.lng]}>
              <Popup>
                <div className="p-1 min-w-[220px]">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-black text-2xl text-slate-800">
                      #{m.noRumah}
                    </span>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-red-500 p-2 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed border-t pt-3">
                    {m.address}
                  </p>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      onClick={() =>
                        window.open(
                          `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`,
                          "_blank",
                        )
                      }
                      className="bg-slate-100 py-3 rounded-xl flex flex-col items-center gap-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <MapIcon size={16} />
                      Maps
                    </button>
                    <button
                      onClick={() =>
                        window.open(
                          `https://www.google.com/maps/@?api=1&map_action=streetview&location=${m.lat},${m.lng}`,
                          "_blank",
                        )
                      }
                      className="bg-slate-100 py-3 rounded-xl flex flex-col items-center gap-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <Eye size={16} />
                      Street
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setTargetDestination(m);
                      setIsTracking(true);
                      setHasAlerted(false);
                    }}
                    className={`w-full text-white py-4 rounded-2xl flex justify-center items-center gap-2 text-sm font-black shadow-lg active:scale-95 transition-all ${travelMode === "car" ? "bg-blue-600" : "bg-green-600"}`}
                  >
                    <Navigation2 size={18} /> ANTAR SEKARANG
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
          <MapEvents fetchMarkers={fetchMarkers} API_URL={API_URL} />
        </MapContainer>
      </div>

      {/* FLOATING ACTION BUTTONS - Kanan Bawah */}
      <div className="absolute bottom-8 right-5 z-[1001] flex flex-col items-center gap-4">
        {/* Rotation Controls */}
        <div className="flex flex-col bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => setRotation((prev) => prev - 15)}
            className="p-4 text-slate-600 active:bg-slate-100 transition-colors border-b border-slate-100"
          >
            <span className="text-xl font-bold">↺</span>
          </button>
          <button
            onClick={() => setRotation(0)}
            className="p-4 text-blue-600 active:bg-slate-100 transition-colors"
          >
            <Compass
              size={28}
              style={{
                transform: `rotate(${-rotation}deg)`,
                transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          </button>
          <button
            onClick={() => setRotation((prev) => prev + 15)}
            className="p-4 text-slate-600 active:bg-slate-100 transition-colors border-t border-slate-100"
          >
            <span className="text-xl font-bold">↻</span>
          </button>
        </div>

        {/* Secondary Actions */}
        <div className="flex flex-col gap-3">
          {targetDestination && (
            <button
              onClick={() => setTargetDestination(null)}
              className="bg-white p-4 rounded-2xl text-red-500 shadow-xl active:scale-90 border border-slate-200 transition-all"
            >
              <X size={24} strokeWidth={3} />
            </button>
          )}
          <button
            onClick={findMyLocation}
            className="bg-white p-4 rounded-2xl text-slate-700 shadow-xl active:scale-90 border border-slate-200 transition-all"
          >
            <LocateFixed size={24} />
          </button>
        </div>

        {/* MAIN TRACKING BUTTON */}
        <button
          onClick={toggleTracking}
          className={`p-5 rounded-[2rem] text-white shadow-2xl active:scale-95 transition-all duration-300 border-4 border-white ${isTracking ? "bg-green-500 shadow-green-400/50" : "bg-blue-600 shadow-blue-400/50"}`}
        >
          <Target size={36} className={isTracking ? "animate-pulse" : ""} />
        </button>
      </div>

      {/* Global Style Adjustments */}
      <style>{`
        .leaflet-popup-content-wrapper { border-radius: 28px !important; padding: 8px !important; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1) !important; }
        .leaflet-popup-tip { box-shadow: none !important; }
        .leaflet-control-layers { border-radius: 16px !important; border: 2px solid white !important; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1) !important; margin-top: 150px !important; }
        .custom-div-icon { background: none !important; border: none !important; }
      `}</style>
    </div>
  );
}

function MapEvents({ fetchMarkers, API_URL }) {
  const map = useMap();

  const handleAction = async (e) => {
    // Beri jeda sedikit agar UI tidak kaget saat prompt muncul
    setTimeout(async () => {
      const noRumah = prompt("Masukkan Nomor Rumah:");
      if (!noRumah) return;

      try {
        const res = await axios.get(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${e.latlng.lat}&lon=${e.latlng.lng}`,
        );
        const address = res.data.display_name;

        await axios.post(API_URL, {
          noRumah,
          address,
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          location: {
            type: "Point",
            coordinates: [e.latlng.lng, e.latlng.lat],
          },
        });
        fetchMarkers();
      } catch (err) {
        alert("Gagal Simpan Lokasi");
      }
    }, 100);
  };

  useMapEvents({
    // Klik kiri biasa (Laptop)
    click(e) {
      // Jika layar lebar (laptop), gunakan klik biasa
      if (window.innerWidth > 768) {
        handleAction(e);
      }
    },
    // Tekan lama (HP) atau Klik Kanan (Laptop)
    contextmenu(e) {
      handleAction(e);
    },
  });
  return null;
}

export default App;
