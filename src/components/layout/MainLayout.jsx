import React from 'react';
import Sidebar from './Sidebar';
import { Outlet } from 'react-router-dom';

const MainLayout = () => {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar fijo a la izquierda */}
      <Sidebar />
      
      {/* Contenido dinámico a la derecha */}
      <main className="flex-1 ml-64 p-8">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;