import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';
import { ToastContainer } from './components/ui/Toast';

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
import ProductSalesReport from './pages/pos/ProductSalesReport';
import ManualSaleEntry from './pages/pos/ManualSaleEntry';
import CashierReport from './pages/pos/CashierReport';
import StockEntry from './pages/inventory/StockEntry';

// ── Pantalla de carga global ─────────────────────────────────────────────────
const LoadingScreen = () => (
  <div className="h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-400 gap-3">
    <Loader2 className="animate-spin text-primary" size={48} />
    <p className="text-sm font-medium">Cargando sistema...</p>
  </div>
);

// ── Ruta pública ─────────────────────────────────────────────────────────────
const PublicRoute = ({ children }) => {
  const { user, userData, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user && userData) {
    if (userData.role === 'admin')   return <Navigate to="/"    replace />;
    if (userData.role === 'cashier') return <Navigate to="/pos" replace />;
  }
  return children;
};

// ── Ruta protegida ───────────────────────────────────────────────────────────
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, userData, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user)   return <Navigate to="/login" replace />;
  if (allowedRoles && userData) {
    if (userData.role === 'cashier' && !allowedRoles.includes('cashier'))
      return <Navigate to="/pos" replace />;
    if (userData.role === 'admin'   && !allowedRoles.includes('admin'))
      return <Navigate to="/"    replace />;
  }
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Toast container — disponible en toda la app */}
        <ToastContainer />

        <Routes>

          {/* LOGIN */}
          <Route path="/login" element={
            <PublicRoute><Login /></PublicRoute>
          } />

          {/* ── ZONA ADMIN (CON SIDEBAR) ────────────────────────────────── */}
          <Route path="/" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<DashboardHome />} />

            {/* Productos */}
            <Route path="productos"                element={<ItemsList />} />
            <Route path="productos/nuevo"          element={<NewProduct />} />
            <Route path="productos/editar/:id"     element={<NewProduct />} />
            <Route path="/articulos/historial"     element={<InventoryHistoryGlobal />} />
            <Route path="/articulos/entrada"       element={<StockEntry />} />

            {/* Gastos directo admin */}
            <Route path="gastos"                   element={<ExpensesHistory />} />

            {/* Descuentos */}
            <Route path="descuentos"               element={<DiscountsList />} />
            <Route path="descuentos/nuevo"         element={<DiscountForm />} />
            <Route path="descuentos/editar/:id"    element={<DiscountForm />} />

            {/* Empleados */}
            <Route path="empleados"                element={<EmployeesList />} />
            <Route path="empleados/nuevo"          element={<EmployeeForm />} />
            <Route path="empleados/editar/:id"     element={<EmployeeForm />} />
            <Route path="empleados/horas"          element={<WorkHoursList />} />

            {/* Otras secciones */}
            <Route path="cajas"                    element={<ShiftHistory />} />
            <Route path="clientes"                 element={<ClientsList />} />
            <Route path="config"                   element={<Settings />} />
          </Route>

          {/* ── TERMINAL TPV (pantalla completa, sin sidebar) ────────────── */}
          <Route path="/pos" element={
            <ProtectedRoute allowedRoles={['admin', 'cashier']}>
              <PosTerminal />
            </ProtectedRoute>
          } />

          {/* ── SECCIÓN VENTAS CON LAYOUT (admin) ───────────────────────── */}
          <Route element={
            <ProtectedRoute allowedRoles={['admin']}>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route path="/pos/history"           element={<SalesHistory />} />
            <Route path="/pos/gastos"            element={<ExpensesHistory />} />
            <Route path="/pos/reporte-productos" element={<ProductSalesReport />} />
            <Route path="/pos/registro-manual"   element={<ManualSaleEntry />} />
            <Route path="/pos/reporte-cajeros"   element={<CashierReport />} />
          </Route>

          {/* Redirecciones */}
          <Route path="/ventas" element={<Navigate to="/pos" replace />} />
          <Route path="*"       element={<Navigate to="/"   replace />} />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;