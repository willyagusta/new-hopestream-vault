import React, { useState, useEffect, useRef } from 'react';

const EarthquakeMap = () => {
  const [earthquakes, setEarthquakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false); // Separate state for data refresh
  const [error, setError] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const [initStatus, setInitStatus] = useState('waiting');
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const initializationAttempted = useRef(false);
  const debugInfo = useRef({});

  // Ensure component is mounted before trying to initialize map
  useEffect(() => {
    console.log('🚀 Component mounting...');
    setIsMounted(true);
    fetchEarthquakeData(true); // Initial load
    
    return () => {
      console.log('🛑 Component unmounting...');
      setIsMounted(false);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Initialize map only after component is mounted and container is available
  useEffect(() => {
    const checkData = {
      isMounted,
      hasContainer: !!mapRef.current,
      mapLoaded,
      initializationAttempted: initializationAttempted.current,
      mapError,
      initStatus,
      earthquakesLength: earthquakes.length
    };
    
    console.log('🔄 useEffect check:', checkData);
    debugInfo.current = checkData;

    if (isMounted && mapRef.current && !mapLoaded && !initializationAttempted.current && !mapError) {
      console.log('🚀 Triggering map initialization...');
      setInitStatus('initializing');
      
      // Add a small delay to ensure DOM is fully ready
      const timeoutId = setTimeout(() => {
        if (mapRef.current && isMounted) {
          console.log('⏰ Timeout fired, setting initializationAttempted and calling initializeMap');
          initializationAttempted.current = true;
          initializeMap();
        } else {
          console.log('❌ Timeout fired but conditions not met:', {
            hasContainer: !!mapRef.current,
            isMounted
          });
        }
      }, 100);
      
      return () => {
        console.log('🧹 Cleaning up timeout');
        clearTimeout(timeoutId);
      };
    } else {
      console.log('❌ Initialization conditions not met:', checkData);
    }
  }, [isMounted, mapLoaded, mapError, earthquakes.length]);

  // Immediate initialization attempt when data is ready
  useEffect(() => {
    if (isMounted && mapRef.current && !mapLoaded && !mapError && earthquakes.length > 0 && initStatus === 'waiting') {
      console.log('📊 Data is ready, attempting immediate initialization...');
      setInitStatus('data-ready');
      initializationAttempted.current = false; // Reset flag
      
      setTimeout(() => {
        console.log('🎯 Immediate initialization attempt');
        initializeMap();
      }, 50);
    }
  }, [isMounted, mapLoaded, mapError, earthquakes.length, initStatus]);

  // Handle container restoration after refresh
  useEffect(() => {
    if (isMounted && mapRef.current && mapLoaded && mapInstanceRef.current && earthquakes.length > 0) {
      // Container is back and map exists, update markers
      console.log('🔄 Container restored, updating markers...');
      updateMapMarkers();
    } else if (isMounted && mapRef.current && !mapLoaded && earthquakes.length > 0 && !initializationAttempted.current) {
      // Container is back but map is lost, reinitialize
      console.log('🔄 Container restored but map lost, reinitializing...');
      setInitStatus('restoring');
      initializationAttempted.current = false;
      setTimeout(() => {
        initializeMap();
      }, 100);
    }
  }, [mapRef.current, earthquakes.length, mapLoaded]);

  useEffect(() => {
    if (earthquakes.length > 0 && mapInstanceRef.current && mapLoaded) {
      updateMapMarkers();
    }
  }, [earthquakes, mapLoaded]);

  const initializeMap = async () => {
    try {
      console.log('🗺️ Starting map initialization...', {
        isMounted,
        hasContainer: !!mapRef.current,
        hasParent: !!mapRef.current?.parentNode,
        currentStatus: initStatus
      });
      
      setInitStatus('starting');
      
      if (typeof window === 'undefined') {
        console.error('❌ Window is undefined - running on server');
        setInitStatus('error');
        setMapError('Running on server');
        return;
      }
      
      if (!isMounted) {
        console.error('❌ Component not mounted');
        setInitStatus('error');
        setMapError('Component not mounted');
        return;
      }
      
      if (mapInstanceRef.current) {
        console.log('✅ Map already exists');
        setMapLoaded(true);
        setInitStatus('completed');
        return;
      }
      
      if (!mapRef.current) {
        console.error('❌ Map container ref is null');
        setMapError('Map container not found');
        setInitStatus('error');
        return;
      }
      
      // Double-check that the container element exists in the DOM
      const container = mapRef.current;
      if (!container.parentNode) {
        console.error('❌ Map container not attached to DOM');
        setMapError('Map container not attached to DOM');
        setInitStatus('error');
        return;
      }
      
      console.log('✅ All checks passed, proceeding with initialization');
      setInitStatus('importing');
      
      // Dynamically import Leaflet
      console.log('📦 Importing Leaflet...');
      const L = await import('leaflet');
      console.log('✅ Leaflet imported successfully');
      
      setInitStatus('configuring');
      
      // Fix for default markers in Next.js
      if (L.Icon.Default.prototype._getIconUrl) {
        delete L.Icon.Default.prototype._getIconUrl;
      }
      
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
      
      setInitStatus('loading-css');
      
      // Add CSS for Leaflet
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        console.log('🎨 Adding Leaflet CSS...');
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);
        
        // Wait for CSS to load
        console.log('⏳ Waiting for CSS to load...');
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      setInitStatus('creating-map');
      console.log('🗺️ Creating map instance...');
      
      // Final check before creating map
      if (!mapRef.current || !isMounted) {
        console.error('❌ Map container disappeared during initialization');
        setMapError('Map container disappeared during initialization');
        setInitStatus('error');
        return;
      }
      
      // Initialize map centered on Indonesia
      console.log('🏗️ Initializing Leaflet map...');
      const map = L.map(mapRef.current, {
        center: [-2.5, 118],
        zoom: 5,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true
      });
      
      console.log('✅ Map instance created successfully');
      setInitStatus('adding-tiles');
      
      // Add OpenStreetMap tiles
      console.log('🗺️ Adding tile layer...');
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      });
      
      tileLayer.addTo(map);
      console.log('✅ Tile layer added successfully');
      
      setInitStatus('finalizing');
      
      // Store map instance
      mapInstanceRef.current = map;
      
      // Wait for map to render
      console.log('⏳ Waiting for map to render...');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Force a resize to ensure proper rendering
      console.log('🔄 Invalidating map size...');
      map.invalidateSize();
      
      console.log('✅ Map initialization complete!');
      setInitStatus('completed');
      setMapLoaded(true);
      setMapError(null);
      
    } catch (error) {
      console.error('❌ Error initializing map:', error);
      setMapError('Failed to initialize map: ' + error.message);
      setInitStatus('error');
      setMapLoaded(false);
    }
  };

  const updateMapMarkers = async () => {
    if (!mapInstanceRef.current || !earthquakes.length) return;
    
    try {
      console.log('📍 Updating map markers...');
      const L = await import('leaflet');
      const map = mapInstanceRef.current;
      
      // Clear existing markers
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
          map.removeLayer(layer);
        }
      });
      
      let markersAdded = 0;
      
      // Add new markers
      earthquakes.forEach((eq, index) => {
        try {
          // Parse coordinates - handle different formats
          let lat, lng;
          
          if (eq.Coordinates) {
            const coords = eq.Coordinates.split(',');
            lat = parseFloat(coords[0].trim());
            lng = parseFloat(coords[1].trim());
          } else if (eq.Lintang && eq.Bujur) {
            // Convert from DMS to decimal if needed
            lat = parseFloat(eq.Lintang.replace(/[^\d.-]/g, ''));
            lng = parseFloat(eq.Bujur.replace(/[^\d.-]/g, ''));
          } else {
            console.warn('No valid coordinates found for earthquake:', eq);
            return;
          }
          
          // Validate coordinates
          if (isNaN(lat) || isNaN(lng)) {
            console.warn('Invalid coordinates:', lat, lng, eq);
            return;
          }
          
          const magnitude = parseFloat(eq.Magnitude);
          const color = getMagnitudeColor(eq.Magnitude);
          const size = getMagnitudeSize(eq.Magnitude);
          
          // Create custom marker
          const marker = L.circleMarker([lat, lng], {
            radius: size / 2,
            fillColor: color,
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
          }).addTo(map);
          
          // Add popup with better formatting
          const popupContent = `
            <div style="min-width: 200px; font-family: Arial, sans-serif;">
              <h3 style="margin: 0 0 8px 0; color: #333; font-size: 16px; font-weight: bold;">
                Magnitude ${eq.Magnitude}
              </h3>
              <p style="margin: 4px 0; color: #666; font-size: 14px;">
                <strong>Location:</strong> ${eq.Wilayah || 'Unknown'}
              </p>
              <p style="margin: 4px 0; color: #666; font-size: 12px;">
                <strong>Date:</strong> ${eq.Tanggal || 'Unknown'} at ${eq.Jam || 'Unknown'}
              </p>
              <p style="margin: 4px 0; color: #666; font-size: 12px;">
                <strong>Depth:</strong> ${eq.Kedalaman || 'Unknown'}
              </p>
              ${eq.Dirasakan ? `<p style="margin: 4px 0; color: #2563eb; font-size: 12px;"><strong>Felt:</strong> ${eq.Dirasakan}</p>` : ''}
            </div>
          `;
          
          marker.bindPopup(popupContent);
          markersAdded++;
          
        } catch (err) {
          console.error('Error creating marker for earthquake:', eq, err);
        }
      });
      
      console.log(`✅ Added ${markersAdded} markers to map`);
      
    } catch (error) {
      console.error('Error updating markers:', error);
    }
  };

  const fetchEarthquakeData = async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true); // Full loading for initial load
      } else {
        setDataLoading(true); // Separate loading for refresh
      }
      setError(null);
      
      console.log('🌍 Fetching earthquake data...');
      const response = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Earthquake data fetched:', data);
      
      if (!data.Infogempa || !data.Infogempa.gempa) {
        throw new Error('Invalid data structure received');
      }
      
      // Get the 5 most recent earthquakes (or all if less than 5)
      const recentEarthquakes = data.Infogempa.gempa.slice(0, 5);
      console.log(`📊 Found ${recentEarthquakes.length} recent earthquakes`);
      
      setEarthquakes(recentEarthquakes);
    } catch (err) {
      console.error('❌ Error fetching earthquake data:', err);
      setError('Failed to fetch earthquake data: ' + err.message);
    } finally {
      if (isInitial) {
        setLoading(false);
      } else {
        setDataLoading(false);
      }
    }
  };

  const getMagnitudeColor = (magnitude) => {
    const mag = parseFloat(magnitude);
    if (mag >= 6.0) return '#dc2626'; // Red for major
    if (mag >= 5.0) return '#ea580c'; // Orange for moderate
    if (mag >= 4.0) return '#ca8a04'; // Yellow for light
    if (mag >= 3.0) return '#65a30d'; // Green for minor
    return '#6b7280'; // Gray for micro
  };

  const getMagnitudeSize = (magnitude) => {
    const mag = parseFloat(magnitude);
    if (mag >= 6.0) return 28;
    if (mag >= 5.0) return 24;
    if (mag >= 4.0) return 20;
    if (mag >= 3.0) return 16;
    return 12;
  };

  const handleRetry = () => {
    console.log('🔄 Manual retry triggered by user...');
    setMapError(null);
    setMapLoaded(false);
    setInitStatus('waiting');
    initializationAttempted.current = false;
    
    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    
    // Retry both data fetch and map initialization
    fetchEarthquakeData(true);
  };

  const handleRefresh = () => {
    console.log('🔄 Data refresh triggered...');
    fetchEarthquakeData(false); // Don't destroy the component during refresh
  };

  // Don't render anything until mounted (prevents SSR issues)
  if (!isMounted) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h3 className="text-xl font-bold mb-4">🌍 Recent Earthquakes</h3>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Initializing...</span>
        </div>
      </div>
    );
  }

  // Only show full loading screen on initial load
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h3 className="text-xl font-bold mb-4">🌍 Recent Earthquakes</h3>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading earthquake data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h3 className="text-xl font-bold mb-4">🌍 Recent Earthquakes</h3>
        <div className="text-red-600 text-center p-4 bg-red-50 rounded-lg">
          <p className="font-medium">Error loading earthquake data</p>
          <p className="text-sm mt-2">{error}</p>
          <button
            onClick={handleRetry}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold">🌍 Recent Earthquakes</h3>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={dataLoading}
            className={`px-3 py-1 rounded text-sm ${
              dataLoading 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            }`}
          >
            {dataLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
      
      {/* Map Container */}
      <div className="relative">
        <div 
          ref={mapRef}
          className="w-full rounded-lg mb-4 border border-gray-300"
          style={{ height: '400px', minHeight: '400px' }}
        />
        
        {/* Data loading overlay (doesn't destroy map) */}
        {dataLoading && (
          <div className="absolute top-2 right-2 bg-white bg-opacity-90 rounded-lg p-2 shadow-md">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-xs text-gray-600">Updating data...</span>
            </div>
          </div>
        )}
        
        {/* Map loading overlay */}
        {!mapLoaded && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading map...</p>
              <p className="text-xs text-gray-500 mt-1">Status: {initStatus}</p>
            </div>
          </div>
        )}
        
        {/* Error overlay */}
        {mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50 rounded-lg">
            <div className="text-center text-red-600">
              <p className="font-medium">Map Error</p>
              <p className="text-sm mt-1">{mapError}</p>
              <button
                onClick={handleRetry}
                className="mt-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 mb-4">
        This earthquake data is powered by the BMKG (Badan Meteorologi, Klimatologi, dan Geofisika) of Indonesia API.
      </div>

      {/* Earthquake Details */}
      {earthquakes.length > 0 && (
        <div className="space-y-3">
          {earthquakes.map((eq, index) => (
            <div key={index} className="border-l-4 pl-4 py-2" style={{ borderLeftColor: getMagnitudeColor(eq.Magnitude) }}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-lg">{eq.Magnitude}</span>
                    <span className="text-sm text-gray-500">Magnitude</span>
                    <span className="text-sm bg-gray-100 px-2 py-1 rounded">{eq.Kedalaman || 'Unknown depth'}</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-1">{eq.Wilayah || 'Unknown location'}</p>
                  <p className="text-xs text-gray-500">{eq.Tanggal || 'Unknown date'} at {eq.Jam || 'Unknown time'}</p>
                  {eq.Dirasakan && (
                    <p className="text-xs text-blue-600 mt-1">Felt: {eq.Dirasakan}</p>
                  )}
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>Lat: {eq.Lintang || 'N/A'}</div>
                  <div>Lng: {eq.Bujur || 'N/A'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 pt-4 border-t">
        <h4 className="text-sm font-semibold mb-2">Magnitude Scale</h4>
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-600"></div>
            <span>6.0+ Major</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-orange-600"></div>
            <span>5.0-5.9 Moderate</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
            <span>4.0-4.9 Light</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-600"></div>
            <span>3.0-3.9 Minor</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-gray-600"></div>
            <span>2.0-2.9 Micro</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EarthquakeMap; 