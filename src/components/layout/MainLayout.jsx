import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Botón de Hamburguesa para Mobile */}
      <header className="md:hidden flex items-center justify-between bg-white border-b border-gray-100 px-4 h-16 sticky top-0 z-40 w-full shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-md shadow-green-100 shrink-0">
            <span className="text-xs font-black">★</span>
          </div>
          <span className="text-md font-black tracking-tight text-gray-800">
            Bodega <span className="bg-gradient-to-r from-emerald-600 to-green-500 bg-clip-text text-transparent">el Grifo</span>
          </span>
        </div>
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 text-gray-600 hover:text-emerald-600 focus:outline-none transition-colors"
          aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Backdrop para cerrar el sidebar en mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/45 z-45 md:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar pasándole el estado */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      {/* Contenido dinámico a la derecha */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 min-w-0">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;