import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import WeatherWidget from '../ui/WeatherWidget';
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
  Tag,
  FileBarChart,
  ClipboardList,
  UserCheck,
  Truck,
  Monitor,
  Sparkles,
  X,
} from 'lucide-react';

const Sidebar = ({ isOpen, onClose }) => {
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
        { path: '/pos',                   label: 'Terminal TPV',      icon: <Monitor size={16} /> },
        { path: '/pos/history',           label: 'Historial Ventas',  icon: <Receipt size={16} /> },
        { path: '/cajas',                 label: 'Historial Cajas',   icon: <Wallet size={16} /> },
        { path: '/pos/gastos',            label: 'Historial Gastos',  icon: <TrendingDown size={16} /> },
        { path: '/pos/reporte-productos', label: 'Reporte Productos', icon: <FileBarChart size={16} /> },
        { path: '/pos/registro-manual',   label: 'Registro Manual',   icon: <ClipboardList size={16} /> },
        { path: '/pos/reporte-cajeros',   label: 'Reporte Cajeros',   icon: <UserCheck size={16} /> },
      ],
    },

    // GRUPO ARTÍCULOS
    {
      path: '/productos-section',
      icon: <Package size={20} />,
      label: 'Artículos',
      subItems: [
        { path: '/productos',           label: 'Lista de Productos',   icon: <Package size={16} /> },
        { path: '/articulos/historial', label: 'Historial Inventario', icon: <History size={16} /> },
        { path: '/articulos/entrada',   label: 'Entrada Mercadería',   icon: <Truck size={16} /> },
        { path: '/articulos/proveedores', label: 'Proveedores',        icon: <Users size={16} /> },
        { path: '/descuentos',          label: 'Descuentos',           icon: <Tag size={16} /> },
      ],
    },

    // GRUPO EMPLEADOS
    {
      path: '/empleados',
      icon: <Briefcase size={20} />,
      label: 'Empleados',
      subItems: [
        { path: '/empleados',       label: 'Lista de Empleados',   icon: <Users size={16} /> },
        { path: '/empleados/horas', label: 'Horas Trabajadas',    icon: <Clock size={16} /> },
      ],
    },

    { path: '/clientes', icon: <Users size={20} />,    label: 'Clientes' },
    { path: '/config',   icon: <Settings size={20} />, label: 'Configuración' },
  ];

  return (
    <aside className={`w-64 bg-gradient-to-b from-white to-gray-50/70 h-screen border-r border-gray-100 flex flex-col fixed left-0 top-0 z-50 shadow-xs select-none transition-transform duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>

      {/* HEADER PREMIUM */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-md shadow-green-100 shrink-0 animate-pulse">
            <Sparkles size={16} className="text-white fill-white/20" />
          </div>
          <span className="text-lg font-black tracking-tight text-gray-800">
            Bodega <span className="bg-gradient-to-r from-emerald-600 to-green-500 bg-clip-text text-transparent">el Grifo</span>
          </span>
        </div>
        {/* Botón de cerrar visible solo en mobile */}
        <button 
          onClick={onClose}
          className="md:hidden p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Cerrar barra lateral"
        >
          <X size={18} />
        </button>
      </div>

      {/* WIDGET CLIMA */}
      <div className="px-3 pt-3">
        <WeatherWidget />
      </div>

      {/* MENÚ DE NAVEGACIÓN */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.subItems && item.subItems.some(sub => location.pathname === sub.path));

          const isExpanded = expandedMenus[item.path];

          return (
            <div key={item.path} className="mb-0.5">
              <div
                onClick={() => item.subItems ? toggleMenu(item.path) : null}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg
                            transition-all duration-200 cursor-pointer group
                            ${isActive && !item.subItems
                              ? 'bg-emerald-50 text-emerald-800 font-bold border-l-4 border-emerald-500 pl-3 shadow-xs'
                              : 'text-gray-500 hover:bg-emerald-50/20 hover:text-emerald-700 hover:pl-4'}
                            ${isActive && item.subItems ? 'text-emerald-800 font-bold' : ''}`}
              >
                {item.subItems ? (
                  <div className="flex items-center gap-3 w-full">
                    <span className={`transition-colors duration-200 ${isActive ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-600'}`}>
                      {item.icon}
                    </span>
                    <span className="text-sm tracking-wide">{item.label}</span>
                  </div>
                ) : (
                  <Link to={item.path} className="flex items-center gap-3 w-full" onClick={onClose}>
                    <span className={`transition-colors duration-200 ${isActive ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-600'}`}>
                      {item.icon}
                    </span>
                    <span className="text-sm tracking-wide">{item.label}</span>
                  </Link>
                )}

                {item.subItems && (
                  <span className={`transition-transform duration-200 ${isActive ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-600'}`}>
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </span>
                )}
              </div>

              {item.subItems && isExpanded && (
                <div className="pl-4 ml-4 border-l border-gray-100 space-y-1 mt-1 animate-fadeIn">
                  {item.subItems.map(sub => {
                    const isManual  = sub.path === '/pos/registro-manual';
                    const isSubActive = location.pathname === sub.path;
                    return (
                      <Link
                        key={sub.path}
                        to={sub.path}
                        onClick={onClose}
                        className={`py-2 px-3 text-xs rounded-md transition-all duration-200 flex items-center gap-2.5
                          ${isSubActive
                            ? 'text-emerald-800 bg-gradient-to-r from-emerald-50 to-green-50/50 font-bold border-l-2 border-emerald-500 pl-4 shadow-xs'
                            : isManual
                              ? 'text-indigo-600 border border-dashed border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 font-semibold'
                              : 'text-gray-500 hover:text-emerald-700 hover:bg-emerald-50/10 hover:pl-4'}`}
                      >
                        {sub.icon && (
                          <span className={`transition-colors duration-200 ${
                            isSubActive
                              ? 'text-emerald-600'
                              : isManual
                                ? 'text-indigo-400'
                                : 'text-gray-400 group-hover:text-emerald-600'
                          }`}>
                            {sub.icon}
                          </span>
                        )}
                        <span>{sub.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* FOOTER USUARIO PREMIUM */}
      <div className="p-4 border-t border-gray-100 mt-auto bg-gray-50/50">
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-xs flex items-center gap-3 mb-3 hover:shadow-sm transition-shadow">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-xs
            ${userData?.role === 'admin' ? 'bg-gradient-to-tr from-purple-600 to-indigo-500' : 'bg-gradient-to-tr from-blue-600 to-sky-500'}`}>
            {userData?.name ? userData.name.substring(0, 2).toUpperCase() : 'U'}
          </div>
          <div className="text-sm overflow-hidden flex-1">
            <p className="font-bold text-gray-800 truncate leading-none mb-1">{userData?.name || 'Usuario'}</p>
            <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider leading-none">
              {userData?.role === 'admin' ? 'Administrador' : 'Cajero'}
            </p>
          </div>
        </div>

        <button
          onClick={() => { logout(); onClose(); }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm
                     text-red-600 bg-white border border-red-100 rounded-lg
                     hover:bg-red-600 hover:text-white hover:border-red-600 transition-all shadow-xs font-bold"
        >
          <LogOut size={16} /> Salir
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;