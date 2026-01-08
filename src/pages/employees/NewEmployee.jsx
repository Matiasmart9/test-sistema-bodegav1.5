import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Shield, User, KeyRound } from 'lucide-react';
import { collection, addDoc, doc, getDoc, updateDoc } from "firebase/firestore"; 
import { db } from '../../firebase/config';

export default function NewEmployee() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'cashier', // 'admin' o 'cashier'
    pin: '', // 4 dígitos
    // Permisos granulares (Opcional, para futuro)
    permissions: {
        can_sell: true,
        can_edit_items: false,
        can_view_reports: false
    }
  });

  // Cargar datos si editamos
  useEffect(() => {
    if (isEditing) {
      const fetchEmp = async () => {
        const docRef = doc(db, "employees", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) setFormData(docSnap.data());
      };
      fetchEmp();
    }
  }, [id, isEditing]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Manejo de Checkboxes de permisos
  const handlePermissionChange = (e) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
        ...prev,
        permissions: { ...prev.permissions, [name]: checked }
    }));
  };

  const handleSave = async () => {
    if (!formData.name || !formData.pin) return alert("Nombre y PIN son obligatorios");
    if (formData.pin.length !== 4) return alert("El PIN debe tener 4 dígitos");

    try {
      setLoading(true);
      if (isEditing) {
        await updateDoc(doc(db, "employees", id), formData);
        alert("Empleado actualizado");
      } else {
        await addDoc(collection(db, "employees"), { ...formData, createdAt: new Date() });
        alert("Empleado creado");
      }
      navigate('/empleados');
    } catch (e) {
      console.error(e);
      alert("Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/empleados')} className="p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft size={24} className="text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEditing ? 'Editar Empleado' : 'Nuevo Empleado'}
          </h1>
        </div>
        <button onClick={handleSave} disabled={loading} className="px-6 py-2 bg-primary text-white font-medium rounded-lg flex items-center gap-2 shadow-sm hover:bg-green-600">
            <Save size={18} /> Guardar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* COLUMNA IZQUIERDA: DATOS */}
        <div className="md:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Datos Personales</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo *</label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"/>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"/>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECCIÓN DE PERMISOS */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Acceso y Permisos</h3>
                
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Rol del sistema</label>
                    <div className="grid grid-cols-2 gap-4">
                        <label className={`border rounded-lg p-4 flex flex-col items-center cursor-pointer transition-all ${formData.role === 'admin' ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500' : 'hover:bg-gray-50'}`}>
                            <input type="radio" name="role" value="admin" checked={formData.role === 'admin'} onChange={handleChange} className="sr-only"/>
                            <Shield className={`mb-2 ${formData.role === 'admin' ? 'text-purple-600' : 'text-gray-400'}`} />
                            <span className="font-bold text-sm">Administrador</span>
                            <span className="text-xs text-center text-gray-500 mt-1">Acceso total a configuración e inventario</span>
                        </label>

                        <label className={`border rounded-lg p-4 flex flex-col items-center cursor-pointer transition-all ${formData.role === 'cashier' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'hover:bg-gray-50'}`}>
                            <input type="radio" name="role" value="cashier" checked={formData.role === 'cashier'} onChange={handleChange} className="sr-only"/>
                            <User className={`mb-2 ${formData.role === 'cashier' ? 'text-blue-600' : 'text-gray-400'}`} />
                            <span className="font-bold text-sm">Cajero</span>
                            <span className="text-xs text-center text-gray-500 mt-1">Solo puede realizar ventas y ver turno</span>
                        </label>
                    </div>
                </div>

                {/* Si es Cajero, mostramos permisos finos */}
                {formData.role === 'cashier' && (
                    <div className="border-t pt-4 animate-fadeIn">
                        <p className="text-sm font-bold text-gray-700 mb-3">Permisos específicos</p>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2">
                                <input type="checkbox" name="can_edit_items" checked={formData.permissions.can_edit_items} onChange={handlePermissionChange} className="rounded text-primary focus:ring-primary"/>
                                <span className="text-sm text-gray-700">Puede modificar artículos</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" name="can_view_reports" checked={formData.permissions.can_view_reports} onChange={handlePermissionChange} className="rounded text-primary focus:ring-primary"/>
                                <span className="text-sm text-gray-700">Puede ver reportes de venta</span>
                            </label>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* COLUMNA DERECHA: PIN */}
        <div className="md:col-span-1">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 sticky top-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <KeyRound size={20} className="text-primary"/> Seguridad
                </h3>
                
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">PIN de Acceso (4 dígitos)</label>
                    <input 
                        type="text" 
                        maxLength="4"
                        name="pin" 
                        value={formData.pin} 
                        onChange={(e) => {
                            // Solo permitir números
                            const val = e.target.value;
                            if (/^\d*$/.test(val)) handleChange(e);
                        }} 
                        className="w-full text-center text-2xl tracking-widest font-bold px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="0000"
                    />
                    <p className="text-xs text-gray-500 mt-2 text-center">Este PIN se usará para iniciar sesión en la caja.</p>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}