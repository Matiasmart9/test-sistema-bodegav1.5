import { sileo } from 'sileo';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { User, Mail, Shield, Save, ArrowLeft, Loader2, Lock, Eye, EyeOff, TrendingDown, ClipboardList, ClipboardCheck } from 'lucide-react';

export default function EmployeeForm() {
  const navigate = useNavigate();
  const { id } = useParams(); 
  const isEditMode = !!id;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditMode);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'cashier',
    password: '',
    canRegisterExpenses: false, // <--- NUEVO CAMPO DE PERMISO
    canManageInventorySummarized: false,
    canCheckCashierInventory: false
  });

  // CARGAR DATOS
  useEffect(() => {
    if (isEditMode) {
      const fetchEmployee = async () => {
        try {
          const docRef = doc(db, "employees", id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setFormData({
                ...data,
                password: data.password || data.pin || '',
                canRegisterExpenses: data.canRegisterExpenses || false, // Cargar el permiso existente o false
                canManageInventorySummarized: data.canManageInventorySummarized || false,
                canCheckCashierInventory: data.canCheckCashierInventory || false
            });
          } else {
            sileo.error({ title: 'Empleado no encontrado.' });
            navigate('/empleados');
          }
        } catch (error) {
          console.error(error);
        } finally {
          setFetching(false);
        }
      };
      fetchEmployee();
    }
  }, [id, isEditMode, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.password) {
      return sileo.warning({ title: "Nombre, Correo y Contraseña son obligatorios" });
    }
    if (formData.password.length < 4) return sileo.warning({ title: 'La contraseña debe tener al menos 4 caracteres.' });

    setLoading(true);
    try {
      const employeeData = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          password: formData.password,
          pin: null,
          canRegisterExpenses: formData.canRegisterExpenses, // Guardamos el permiso
          canManageInventorySummarized: formData.canManageInventorySummarized || false,
          canCheckCashierInventory: formData.canCheckCashierInventory || false
      };

      if (isEditMode) {
        await updateDoc(doc(db, "employees", id), employeeData);
        sileo.success({ title: "Empleado actualizado correctamente." });
      } else {
        await addDoc(collection(db, "employees"), {
            ...employeeData,
            createdAt: new Date()
        });
        sileo.success({ title: "Empleado creado con éxito." });
      }
      navigate('/empleados');
    } catch (error) {
      console.error("Error guardando:", error);
      sileo.error({ title: "Error al guardar." });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="max-w-2xl mx-auto pb-20 pt-10 px-4">
      
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/empleados')} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
            <ArrowLeft size={20}/>
        </button>
        <div>
            <h1 className="text-2xl font-bold text-gray-800">{isEditMode ? 'Editar Empleado' : 'Nuevo Empleado'}</h1>
            <p className="text-gray-500 text-sm">Configure los datos de acceso y permisos.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
            
            {/* DATOS PERSONALES */}
            <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><User size={16}/> Nombre Completo</label>
                <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary transition-all"
                    placeholder="Ej: Juan Pérez"
                />
            </div>

            <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><Mail size={16}/> Correo</label>
                <input 
                    type="email" 
                    required
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary transition-all"
                    placeholder="ejemplo@correo.com"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><Shield size={16}/> Rol</label>
                    <select 
                        value={formData.role}
                        onChange={e => setFormData({...formData, role: e.target.value})}
                        className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:border-primary bg-white cursor-pointer"
                    >
                        <option value="cashier">Cajero (Ventas)</option>
                        <option value="admin">Administrador (Total)</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><Lock size={16}/> Contraseña de Acceso</label>
                    <div className="relative">
                        <input 
                            type={showPassword ? "text" : "password"} 
                            required
                            value={formData.password}
                            onChange={e => setFormData({...formData, password: e.target.value})}
                            className="w-full pl-4 pr-12 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary transition-all"
                            placeholder="Contraseña..."
                        />
                        <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                        >
                            {showPassword ? <EyeOff size={20}/> : <Eye size={20}/>}
                        </button>
                    </div>
                </div>
            </div>

            {/* --- SECCIÓN PERMISOS ESPECIALES (NUEVO) --- */}
            {/* Solo mostramos esto si el rol es Cajero, porque el Admin tiene todo permitido */}
            {formData.role === 'cashier' && (
                <div className="pt-4 border-t border-gray-100 animate-fadeIn space-y-4">
                    <label className="text-sm font-bold text-gray-700 block">Permisos Adicionales</label>
                    
                    {/* SWITCH VISUAL PARA REGISTRO DE EGRESOS */}
                    <div 
                        className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-all ${formData.canRegisterExpenses ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`} 
                        onClick={() => setFormData({...formData, canRegisterExpenses: !formData.canRegisterExpenses})}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${formData.canRegisterExpenses ? 'bg-white text-green-600 shadow-sm' : 'bg-gray-200 text-gray-500'}`}>
                                <TrendingDown size={20} />
                            </div>
                            <div>
                                <p className={`font-bold text-sm ${formData.canRegisterExpenses ? 'text-green-800' : 'text-gray-700'}`}>Permitir Registro de Egresos</p>
                                <p className="text-xs text-gray-500">El cajero podrá registrar gastos/retiros de caja.</p>
                            </div>
                        </div>
                        
                        {/* TOGGLE SWITCH */}
                        <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${formData.canRegisterExpenses ? 'bg-green-500' : 'bg-gray-300'}`}>
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${formData.canRegisterExpenses ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </div>
                    </div>

                    {/* SWITCH VISUAL PARA INVENTARIO RESUMIDO */}
                    <div 
                        className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-all ${formData.canManageInventorySummarized ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`} 
                        onClick={() => setFormData({...formData, canManageInventorySummarized: !formData.canManageInventorySummarized})}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${formData.canManageInventorySummarized ? 'bg-white text-green-600 shadow-sm' : 'bg-gray-200 text-gray-500'}`}>
                                <ClipboardList size={20} />
                            </div>
                            <div>
                                <p className={`font-bold text-sm ${formData.canManageInventorySummarized ? 'text-green-800' : 'text-gray-700'}`}>Habilitar Inventario Resumido</p>
                                <p className="text-xs text-gray-500">Permite ver y editar stock de productos de manera resumida.</p>
                            </div>
                        </div>
                        
                        {/* TOGGLE SWITCH */}
                        <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${formData.canManageInventorySummarized ? 'bg-green-500' : 'bg-gray-300'}`}>
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${formData.canManageInventorySummarized ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </div>
                    </div>

                    {/* SWITCH VISUAL PARA INVENTARIO CAJERO */}
                    <div 
                        className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-all ${formData.canCheckCashierInventory ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`} 
                        onClick={() => setFormData({...formData, canCheckCashierInventory: !formData.canCheckCashierInventory})}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${formData.canCheckCashierInventory ? 'bg-white text-green-600 shadow-sm' : 'bg-gray-200 text-gray-500'}`}>
                                <ClipboardCheck size={20} />
                            </div>
                            <div>
                                <p className={`font-bold text-sm ${formData.canCheckCashierInventory ? 'text-green-800' : 'text-gray-700'}`}>Habilitar Inventario Cajero</p>
                                <p className="text-xs text-gray-500">Permite al cajero realizar el cruzamiento semanal de stock físico en el local.</p>
                            </div>
                        </div>
                        
                        {/* TOGGLE SWITCH */}
                        <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${formData.canCheckCashierInventory ? 'bg-green-500' : 'bg-gray-300'}`}>
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${formData.canCheckCashierInventory ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </div>
                    </div>
                </div>
            )}

            <div className="pt-4 border-t border-gray-50 flex justify-end">
                <button 
                    type="submit" 
                    disabled={loading}
                    className="bg-primary text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg shadow-green-200 hover:bg-green-700 transition-transform active:scale-95 flex items-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
                    {isEditMode ? 'Guardar Cambios' : 'Registrar Empleado'}
                </button>
            </div>

        </form>
      </div>
    </div>
  );
}