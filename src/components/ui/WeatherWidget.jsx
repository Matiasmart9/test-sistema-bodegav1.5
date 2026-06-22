import React, { useState, useEffect } from 'react';

const WeatherWidget = ({ dark = false }) => {
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
  if (loading) return <div className={`text-xs py-2 text-center animate-pulse ${dark ? 'text-slate-500' : 'text-gray-400'}`}>Cargando clima...</div>;
  if (error) return <div className={`text-xs py-2 text-center ${dark ? 'text-red-400/80' : 'text-red-300'}`}>Clima no disponible</div>;

  return (
    <div className={`p-2 rounded-xl flex items-center justify-between border shadow-sm ${
      dark 
        ? 'bg-slate-800/40 border-slate-800/70 text-slate-300' 
        : 'bg-gradient-to-r from-blue-50 to-blue-100/50 border-blue-100 text-gray-700'
    }`}>
        <div className="flex items-center gap-2">
            <span className="text-xl">{getIcon(weather.iconId)}</span>
            <div className="flex flex-col leading-none">
                <span className={`text-sm font-black ${dark ? 'text-white' : 'text-gray-700'}`}>{weather.temp}°C</span>
                <span className={`text-[10px] capitalize ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{weather.desc}</span>
            </div>
        </div>
        <div className={`text-[9px] font-bold uppercase tracking-wide ${dark ? 'text-slate-500' : 'text-blue-400'}`}>
            {weather.name}
        </div>
    </div>
  );
};

export default WeatherWidget;