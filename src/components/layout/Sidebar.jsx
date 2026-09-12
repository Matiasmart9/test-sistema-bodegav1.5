import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import WeatherWidget from '../ui/WeatherWidget';
import ConfirmModal from '../ui/ConfirmModal';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Settings,
  Briefcase,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
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
  Beer,
  X,
  Coins,
  ClipboardCheck,
  BookOpen,
  HandCoins,
} from 'lucide-react';

const Sidebar = ({ isOpen, onClose, isCollapsed, onToggleCollapse }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userData, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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

    // GRUPO INVERSIONES
    {
      path: '/inversiones-section',
      icon: <Coins size={20} />,
      label: 'Inversiones',
      subItems: [
        { path: '/inversiones',           label: 'Lista de Inversiones', icon: <ClipboardList size={16} /> },
      ],
    },

    // GRUPO ARTÍCULOS
    {
      path: '/productos-section',
      icon: <Package size={20} />,
      label: 'Inventario',
      subItems: [
        { path: '/productos',           label: 'Lista de Productos',   icon: <Package size={16} /> },
        { path: '/articulos/historial', label: 'Historial Inventario', icon: <History size={16} /> },
        { path: '/articulos/entrada',   label: 'Entrada Mercadería',   icon: <Truck size={16} /> },
        { path: '/articulos/ficha-mercaderias', label: 'Ficha de Mercaderías', icon: <BookOpen size={16} /> },
        { path: '/articulos/proveedores', label: 'Proveedores',        icon: <Users size={16} /> },
        { path: '/descuentos',          label: 'Descuentos',           icon: <Tag size={16} /> },
        { path: '/inventario-cajero',   label: 'Inventario Cajero',    icon: <ClipboardCheck size={16} /> },
      ],
    },

    { path: '/fiados', icon: <HandCoins size={20} />, label: 'Clientes Fiados' },

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

  const [expandedMenus, setExpandedMenus] = useState(() => {
    const initial = {};
    menuItems.forEach(item => {
      if (item.subItems && item.subItems.some(sub => location.pathname === sub.path)) {
        initial[item.path] = true;
      }
    });
    return initial;
  });

  const toggleMenu = (path) => {
    setExpandedMenus(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const isAdmin = userData?.role === 'admin';
  const hasInventoryAccess = userData?.canManageInventorySummarized;
  const hasCashierInventoryAccess = userData?.canCheckCashierInventory;

  const filteredMenuItems = menuItems.map(item => {
    if (item.subItems) {
      const allowedSubItems = item.subItems.filter(sub => {
        if (!isAdmin) {
          if (item.path === '/pos-section') {
            return sub.path === '/pos';
          }
          if (item.path === '/productos-section') {
            if (sub.path === '/productos') return hasInventoryAccess;
            if (sub.path === '/inventario-cajero') return hasCashierInventoryAccess;
            return false;
          }
          return false;
        }
        return true;
      });
      if (allowedSubItems.length === 0) return null;
      return { ...item, subItems: allowedSubItems };
    }
    if (!isAdmin) {
      return null;
    }
    return item;
  }).filter(Boolean);

  return (
    <aside className={`bg-gradient-to-b from-slate-900 to-slate-950 h-screen border-r border-slate-800 flex flex-col fixed left-0 top-0 z-50 shadow-xl select-none transition-all duration-300 md:translate-x-0 ${isCollapsed ? 'w-20' : 'w-64'} ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>

      {/* HEADER PREMIUM */}
      <div className={`h-16 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-4 border-b border-slate-800 bg-slate-900 transition-all duration-300`}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div 
            onClick={isCollapsed ? onToggleCollapse : undefined}
            className={`w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-950/50 shrink-0 animate-pulse ${isCollapsed ? 'cursor-pointer' : ''}`}
            title={isCollapsed ? "Expandir menú" : undefined}
          >
            <Beer size={16} className="text-white fill-white/20" />
          </div>
          {!isCollapsed && (
            <span className="text-lg font-black tracking-tight text-white whitespace-nowrap">
              Bodega <span className="bg-gradient-to-r from-emerald-400 to-green-300 bg-clip-text text-transparent">el Grifo</span>
            </span>
          )}
        </div>
        
        {/* Botón para colapsar/expandir en desktop */}
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
          title={isCollapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        
        {/* Botón de cerrar visible solo en mobile */}
        <button 
          onClick={onClose}
          className="md:hidden p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Cerrar barra lateral"
        >
          <X size={18} />
        </button>
      </div>

      {/* WIDGET CLIMA */}
      {!isCollapsed && (
        <div className="px-3 pt-3">
          <WeatherWidget dark={true} />
        </div>
      )}

      {/* MENÚ DE NAVEGACIÓN */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {filteredMenuItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.subItems && item.subItems.some(sub => location.pathname === sub.path));

          const isExpanded = expandedMenus[item.path];

          return (
            <div key={item.path} className="mb-0.5">
              <div
                onClick={() => {
                  if (isCollapsed) {
                    onToggleCollapse();
                    if (item.subItems) {
                      setExpandedMenus(prev => ({ ...prev, [item.path]: true }));
                    }
                  } else if (item.subItems) {
                    toggleMenu(item.path);
                  }
                }}
                className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-3'} py-2.5 rounded-lg
                            transition-all duration-200 cursor-pointer group
                            ${isActive && !item.subItems
                              ? 'bg-emerald-600 text-white font-bold border-l-4 border-emerald-400 pl-3 shadow-md'
                              : 'text-slate-400 hover:bg-slate-800/60 hover:text-white hover:pl-4'}
                            ${isActive && item.subItems ? 'text-emerald-400 font-bold' : ''}`}
              >
                {item.subItems ? (
                  <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full`}>
                    <span className={`transition-colors duration-200 ${isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-emerald-400'}`}>
                      {item.icon}
                    </span>
                    {!isCollapsed && <span className="text-sm tracking-wide">{item.label}</span>}
                  </div>
                ) : (
                  <Link to={item.path} className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full`} onClick={onClose}>
                    <span className={`transition-colors duration-200 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`}>
                      {item.icon}
                    </span>
                    {!isCollapsed && <span className="text-sm tracking-wide">{item.label}</span>}
                  </Link>
                )}

                {!isCollapsed && item.subItems && (
                  <span className={`transition-transform duration-200 ${isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-emerald-400'}`}>
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </span>
                )}
              </div>

              {item.subItems && isExpanded && !isCollapsed && (
                <div className="pl-4 ml-4 border-l border-slate-800 space-y-1 mt-1 animate-fadeIn">
                  {item.subItems.map(sub => {
                    const isManual  = sub.path === '/pos/registro-manual';
                    const isGastos  = sub.path === '/pos/gastos';
                    const isSubActive = location.pathname === sub.path;
                    return (
                      <Link
                        key={sub.path}
                        to={sub.path}
                        onClick={onClose}
                        className={`py-2 px-3 text-xs rounded-md transition-all duration-200 flex items-center gap-2.5
                          ${isSubActive
                            ? isGastos
                              ? 'text-red-400 bg-gradient-to-r from-red-600/20 to-red-600/5 font-bold border-l-2 border-red-500 pl-4 shadow-sm'
                              : 'text-white bg-gradient-to-r from-emerald-600/20 to-emerald-600/5 font-bold border-l-2 border-emerald-500 pl-4 shadow-sm'
                            : isGastos
                              ? 'text-red-400 hover:text-red-300 hover:bg-red-950/20 hover:pl-4'
                              : isManual
                                ? 'text-indigo-400 border border-dashed border-indigo-900/60 hover:bg-indigo-950/30 hover:text-indigo-300 font-semibold'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/40 hover:pl-4'}`}
                      >
                        {sub.icon && (
                          <span className={`transition-colors duration-200 ${
                            isSubActive
                              ? isGastos
                                ? 'text-red-500'
                                : 'text-emerald-400'
                              : isGastos
                                ? 'text-red-400 group-hover:text-red-300'
                                : isManual
                                  ? 'text-indigo-400'
                                  : 'text-slate-500 group-hover:text-emerald-400'
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
      <div className={`p-4 border-t border-slate-800 mt-auto bg-slate-950/20 ${isCollapsed ? 'flex flex-col items-center gap-3' : ''}`}>
        <div className={`bg-slate-900 border border-slate-800/80 rounded-xl p-3 shadow-xs flex items-center ${isCollapsed ? 'justify-center w-12 h-12 p-0' : 'gap-3 mb-3'} hover:shadow-sm transition-shadow`} title={isCollapsed ? userData?.name || 'Usuario' : undefined}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-xs shrink-0
            ${userData?.role === 'admin' ? 'bg-gradient-to-tr from-purple-600 to-indigo-500' : 'bg-gradient-to-tr from-blue-600 to-sky-500'}`}>
            {userData?.name ? userData.name.substring(0, 2).toUpperCase() : 'U'}
          </div>
          {!isCollapsed && (
            <div className="text-sm overflow-hidden flex-1">
              <p className="font-bold text-slate-200 truncate leading-none mb-1">{userData?.name || 'Usuario'}</p>
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider leading-none">
                {userData?.role === 'admin' ? 'Administrador' : 'Cajero'}
              </p>
            </div>
          )}
        </div>

        {isAdmin ? (
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={`w-full flex items-center justify-center ${isCollapsed ? 'w-10 h-10 p-0' : 'gap-2 px-3 py-2.5'} text-sm
                       text-red-400 bg-slate-900/50 border border-red-950/80 rounded-lg
                       hover:bg-red-600 hover:text-white hover:border-red-600 transition-all shadow-xs font-bold`}
            title={isCollapsed ? "Salir" : undefined}
          >
            <LogOut size={16} /> {!isCollapsed && "Salir"}
          </button>
        ) : (
          <button
            onClick={() => { navigate('/pos'); onClose(); }}
            className={`w-full flex items-center justify-center ${isCollapsed ? 'w-10 h-10 p-0' : 'gap-2 px-3 py-2.5'} text-sm
                       text-emerald-400 bg-slate-900/50 border border-emerald-950/80 rounded-lg
                       hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all shadow-xs font-bold`}
            title={isCollapsed ? "Ir a Caja" : undefined}
          >
            <Monitor size={16} /> {!isCollapsed && "Ir a Caja"}
          </button>
        )}
      </div>

      {showLogoutConfirm && (
        <ConfirmModal
          variant="logout"
          title="¿Cerrar sesión?"
          description="Vas a salir del sistema y tendrás que volver a iniciar sesión para acceder."
          confirmText="Salir"
          cancelText="Cancelar"
          onConfirm={() => { logout(); onClose(); }}
          onClose={() => setShowLogoutConfirm(false)}
        />
      )}
    </aside>
  );
};

export default Sidebar;