import React, { useState, useEffect } from 'react';

const WeatherWidget = () => {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_KEY = '53e19ce5405b254222392b9aec21c01d'; 
  const CITY = 'San Ignacio,PY'; // Ubicación Fija

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        setLoading(true);
        // Llamada a la API
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&appid=${API_KEY}&units=metric&lang=es`
        );
        
        if (!response.ok) throw new Error('Error API');
        
        const data = await response.json();
        setWeather({
          name: "San Ignacio", 
          temp: Math.round(data.main.temp),
          desc: data.weather[0].description,
          iconId: data.weather[0].id
        });
        
      } catch (err) {
        console.error('Error clima:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
    // Actualizar cada 30 min
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Función simple para iconos
  const getIcon = (id) => {
    if (id >= 200 && id < 300) return '⛈️';
    if (id >= 300 && id < 500) return '🌧️';
    if (id >= 500 && id < 600) return '🌧️';
    if (id >= 600 && id < 700) return '❄️';
    if (id === 800) return '☀️';
    return '☁️';
  };

  // Si carga o hay error, mostramos algo discreto para que sepas que está ahí
  if (loading) return <div className="text-xs text-gray-400 py-2 text-center animate-pulse">Cargando clima...</div>;
  if (error) return <div className="text-xs text-red-300 py-2 text-center">Clima no disponible</div>;

  return (
    <div className="mx-4 mt-2 mb-1 p-2 bg-gradient-to-r from-blue-50 to-blue-100/50 rounded-xl border border-blue-100 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
            <span className="text-xl">{getIcon(weather.iconId)}</span>
            <div className="flex flex-col leading-none">
                <span className="text-sm font-black text-gray-700">{weather.temp}°C</span>
                <span className="text-[10px] text-gray-500 capitalize">{weather.desc}</span>
            </div>
        </div>
        <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wide">
            {weather.name}
        </div>
    </div>
  );
};

export default WeatherWidget;