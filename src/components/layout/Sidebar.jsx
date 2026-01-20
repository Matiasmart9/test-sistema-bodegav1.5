import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; 
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Settings, 
  Briefcase, 
  ChevronDown, 
  ChevronRight, 
  Clock, 
  LogOut, 
  Receipt,
  History,
  Wallet,
  TrendingDown,
  Tag // <--- ÍCONO TAG
} from 'lucide-react';

const Sidebar = () => {
  const location = useLocation();
  const { userData, logout } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState({});

  const toggleMenu = (path) => {
    setExpandedMenus(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const menuItems = [
    { path: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    
    // GRUPO VENTAS
    { 
        path: '/pos-section', 
        icon: <ShoppingCart size={20} />, 
        label: 'Ventas',
        subItems: [
          { path: '/pos', label: 'Terminal TPV' },
          { path: '/pos/history', label: 'Historial Ventas', icon: <Receipt size={16}/> },
          { path: '/cajas', label: 'Historial Cajas', icon: <Wallet size={16}/> },
          { path: '/pos/gastos', label: 'Historial Gastos', icon: <TrendingDown size={16}/> }
        ]
    },
    
    // GRUPO ARTÍCULOS (ACTUALIZADO)
    { 
      path: '/productos-section', 
      icon: <Package size={20} />, 
      label: 'Artículos',
      subItems: [
        { path: '/productos', label: 'Lista de Productos' },
        { path: '/articulos/historial', label: 'Historial Inventario', icon: <History size={16}/> },
        // --- NUEVA OPCIÓN DESCUENTOS ---
        { path: '/descuentos', label: 'Descuentos', icon: <Tag size={16}/> } 
      ]
    },
    
    // GRUPO EMPLEADOS
    { 
      path: '/empleados', 
      icon: <Briefcase size={20} />, 
      label: 'Empleados',
      subItems: [
        { path: '/empleados', label: 'Lista de Empleados' },
        { path: '/empleados/horas', label: 'Horas Trabajadas', icon: <Clock size={16}/> }
      ]
    },
    
    { path: '/clientes', icon: <Users size={20} />, label: 'Clientes' },
    { path: '/config', icon: <Settings size={20} />, label: 'Configuración' },
  ];

  return (
    <aside className="w-64 bg-white h-screen border-r border-gray-200 flex flex-col fixed left-0 top-0 z-50">
      {/* HEADER */}
      <div className="h-16 flex items-center px-6 border-b border-gray-100">
        <span className="text-xl font-bold text-gray-800">Bodega <span className="text-primary">El Grifo</span></span>
      </div>

      {/* MENÚ DE NAVEGACIÓN */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path || 
                           (item.subItems && item.subItems.some(sub => location.pathname === sub.path));
          
          const isExpanded = expandedMenus[item.path];

          return (
            <div key={item.path}>
              <div 
                onClick={() => item.subItems ? toggleMenu(item.path) : null}
                className={`flex items-center justify-between px-3 py-3 rounded-lg transition-colors duration-200 cursor-pointer group
                  ${isActive && !item.subItems ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}
                  ${isActive && item.subItems ? 'text-green-700 font-medium' : ''} 
                `}
              >
                {item.subItems ? (
                    <div className="flex items-center gap-3 w-full">
                        <span className={isActive ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600'}>{item.icon}</span>
                        <span>{item.label}</span>
                    </div>
                ) : (
                    <Link to={item.path} className="flex items-center gap-3 w-full">
                        <span className={isActive ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600'}>{item.icon}</span>
                        <span>{item.label}</span>
                    </Link>
                )}

                {item.subItems && (
                  <span className="text-gray-400">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                )}
              </div>

              {item.subItems && isExpanded && (
                <div className="pl-10 space-y-1 mt-1 animate-fadeIn">
                  {item.subItems.map((sub) => (
                    <Link
                      key={sub.path}
                      to={sub.path}
                      className={`block py-2 px-3 text-sm rounded-md transition-colors flex items-center gap-2
                        ${location.pathname === sub.path 
                          ? 'text-green-700 bg-green-50 font-medium' 
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}
                      `}
                    >
                      {sub.icon && <span className={location.pathname === sub.path ? "text-green-600" : "text-gray-400"}>{sub.icon}</span>}
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* FOOTER USUARIO */}
      <div className="p-4 border-t border-gray-100 mt-auto bg-gray-50">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white
            ${userData?.role === 'admin' ? 'bg-purple-600' : 'bg-blue-600'}`}>
            {userData?.name ? userData.name.substring(0, 2).toUpperCase() : 'U'}
          </div>
          <div className="text-sm overflow-hidden">
            <p className="font-medium text-gray-700 truncate">{userData?.name || 'Usuario'}</p>
            <p className="text-xs text-gray-400 capitalize">
                {userData?.role === 'admin' ? 'Administrador' : 'Cajero'}
            </p>
          </div>
        </div>
        
        <button 
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 bg-white border border-red-100 rounded-lg hover:bg-red-50 transition-colors shadow-sm"
        >
          <LogOut size={16} /> Salir
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;