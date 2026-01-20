import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';

// Layouts y Pages
import MainLayout from './components/layout/MainLayout';
import DashboardHome from './pages/dashboard/DashboardHome';
import ItemsList from './pages/inventory/ItemsList';
import NewProduct from './pages/inventory/NewProduct';
import EmployeesList from './pages/employees/EmployeesList';
import EmployeeForm from './pages/employees/EmployeeForm'; 
import WorkHoursList from './pages/employees/WorkHoursList';
import PosTerminal from './pages/pos/PosTerminal';
import Login from './pages/auth/Login';
import SalesHistory from './pages/pos/SalesHistory';
import InventoryHistoryGlobal from './pages/inventory/InventoryHistoryGlobal';
import ClientsList from './pages/clients/ClientsList';
import Settings from './pages/config/Settings';
import ShiftHistory from './pages/pos/ShiftHistory';
import DiscountsList from './pages/discounts/DiscountsList'; 
import DiscountForm from './pages/discounts/DiscountForm';   
import ExpensesHistory from './pages/pos/ExpensesHistory';

// --- PANTALLA DE CARGA GLOBAL ---
const LoadingScreen = () => (
  <div className="h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-400 gap-3">
    <Loader2 className="animate-spin text-primary" size={48}/>
    <p className="text-sm font-medium">Cargando sistema...</p>
  </div>
);

// --- COMPONENTE RUTA PÚBLICA (Para el Login) ---
const PublicRoute = ({ children }) => {
  const { user, userData, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  
  if (user && userData) {
    if (userData.role === 'admin') return <Navigate to="/" replace />;
    if (userData.role === 'cashier') return <Navigate to="/pos" replace />;
  }

  return children;
};

// --- COMPONENTE RUTA PROTEGIDA ---
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, userData, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  // 1. Si no hay usuario -> Login
  if (!user) return <Navigate to="/login" replace />;

  // 2. Control de Roles
  if (allowedRoles && userData) {
    if (userData.role === 'cashier' && !allowedRoles.includes('cashier')) {
        return <Navigate to="/pos" replace />;
    }
    if (userData.role === 'admin' && !allowedRoles.includes('admin')) {
        return <Navigate to="/" replace />;
    }
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          
          {/* LOGIN */}
          <Route path="/login" element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } />

          {/* --- ZONA ADMIN (CON SIDEBAR) --- */}
          <Route path="/" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<DashboardHome />} />
            
            {/* PRODUCTOS */}
            <Route path="productos" element={<ItemsList />} />
            <Route path="productos/nuevo" element={<NewProduct />} />
            <Route path="productos/editar/:id" element={<NewProduct />} />
            <Route path="/articulos/historial" element={<InventoryHistoryGlobal />} />
            
            {/* Si quieres que el admin vea gastos también en la ruta raíz, puedes dejar esta línea, 
                pero la importante es la de abajo en la sección de ventas */}
            <Route path="gastos" element={<ExpensesHistory />} />
            
            {/* DESCUENTOS */}
            <Route path="descuentos" element={<DiscountsList />} />
            <Route path="descuentos/nuevo" element={<DiscountForm />} />
            <Route path="descuentos/editar/:id" element={<DiscountForm />} />

            {/* EMPLEADOS */}
            <Route path="empleados" element={<EmployeesList />} />
            <Route path="empleados/nuevo" element={<EmployeeForm />} />
            <Route path="empleados/editar/:id" element={<EmployeeForm />} />
            <Route path="empleados/horas" element={<WorkHoursList />} />
            
            {/* CAJAS Y CLIENTES */}
            <Route path="cajas" element={<ShiftHistory />} />
            <Route path="clientes" element={<ClientsList />} />
            <Route path="config" element={<Settings />} />
          </Route>

          {/* --- ZONA TPV (PANTALLA COMPLETA) --- */}
          <Route path="/pos" element={
            <ProtectedRoute allowedRoles={['admin', 'cashier']}>
               <PosTerminal />
            </ProtectedRoute>
          } />

          {/* --- HISTORIALES DE VENTAS Y GASTOS (CON LAYOUT) --- */}
          {/* Esta sección arregla el problema de la pantalla blanca al usar MainLayout como wrapper */}
          <Route element={
            <ProtectedRoute allowedRoles={['admin', 'cashier']}>
                <MainLayout /> 
            </ProtectedRoute>
          }>
              <Route path="/pos/history" element={<SalesHistory />} />
              <Route path="/pos/gastos" element={<ExpensesHistory />} />
          </Route>

          {/* REDIRECCIONES */}
          <Route path="/ventas" element={<Navigate to="/pos" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;