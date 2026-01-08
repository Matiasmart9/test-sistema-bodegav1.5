import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { User, Mail, Shield, Save, ArrowLeft, Loader2, Lock, Eye, EyeOff } from 'lucide-react';

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
    password: '' // Antes era 'pin'
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
            // Mapeamos 'pin' a 'password' por si existen registros viejos
            setFormData({
                ...data,
                password: data.password || data.pin || '' 
            });
          } else {
            alert("Empleado no encontrado");
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
    
    if (!formData.name || !formData.password) return alert("Nombre y Contraseña son obligatorios");
    if (formData.password.length < 4) return alert("La contraseña debe tener al menos 4 caracteres");

    setLoading(true);
    try {
      const employeeData = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          password: formData.password, // Guardamos como password
          pin: null // Eliminamos el pin si existía
      };

      if (isEditMode) {
        await updateDoc(doc(db, "employees", id), employeeData);
        alert("Empleado actualizado correctamente.");
      } else {
        await addDoc(collection(db, "employees"), {
            ...employeeData,
            createdAt: new Date()
        });
        alert("Empleado creado con éxito.");
      }
      navigate('/empleados');
    } catch (error) {
      console.error("Error guardando:", error);
      alert("Error al guardar.");
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
                <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><Mail size={16}/> Correo (Opcional)</label>
                <input 
                    type="email" 
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