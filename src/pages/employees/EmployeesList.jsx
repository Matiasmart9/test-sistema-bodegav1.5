import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { sileo } from 'sileo';
import ConfirmModal from '../../components/ui/ConfirmModal';
import {
  Plus, Shield, User, Trash2, Edit, Lock,
  Calendar, ShieldOff, ShieldCheck, AlertTriangle
} from 'lucide-react';

export default function EmployeesList() {
  const navigate = useNavigate();
  const [employees,    setEmployees]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [confirmModal, setConfirmModal] = useState(null);

  useEffect(() => { fetchEmployees(); }, []);

  const fetchEmployees = async () => {
    try {
      const snap = await getDocs(collection(db, 'employees'));
      const data = snap.docs.map(d => {
        const emp = d.data();
        let createdAt = new Date();
        if (emp.createdAt?.toDate) createdAt = emp.createdAt.toDate();
        return { id: d.id, ...emp, createdAt };
      });
      setEmployees(data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const handleDelete = (id, name) => {
    setConfirmModal({
      title:       `¿Eliminar a ${name}?`,
      description: 'El empleado perderá acceso al sistema. Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
      variant:     'danger',
      onConfirm:   async () => {
        try {
          await deleteDoc(doc(db, 'employees', id));
          fetchEmployees();
          sileo.success({ title: `Empleado ${name} eliminado.` });
        } catch { sileo.error({ title: 'Error al eliminar empleado.' }); }
      },
    });
  };

  const handleUnblock = async (id, name) => {
    try {
      await updateDoc(doc(db, 'employees', id), {
        isBlocked:     false,
        loginAttempts: 0,
      });
      sileo.success({ title: `${name} desbloqueado correctamente.` });
      fetchEmployees();
    } catch { sileo.error({ title: 'Error al desbloquear.' }); }
  };

  const blockedCount = employees.filter(e => e.isBlocked).length;

  return (
    <div className="max-w-6xl mx-auto pb-20">

      {confirmModal && (
        <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
      )}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Lista de Empleados</h1>
          <p className="text-gray-500 text-sm">Gestión de perfiles y contraseñas.</p>
        </div>
        <button
          onClick={() => navigate('/empleados/nuevo')}
          className="bg-primary text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-green-200 hover:bg-green-700 transition-all active:scale-95"
        >
          <Plus size={20}/> Nuevo Empleado
        </button>
      </div>

      {/* Banner empleados bloqueados */}
      {blockedCount > 0 && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-500"/>
          <div>
            <p className="font-bold">
              {blockedCount} empleado{blockedCount > 1 ? 's bloqueados' : ' bloqueado'} por intentos fallidos
            </p>
            <p className="text-red-600 text-xs mt-0.5">
              Hacé clic en "Desbloquear" en la tarjeta del empleado para restaurar su acceso.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {employees.map(emp => (
          <div key={emp.id}
            className={`bg-white p-6 rounded-2xl border shadow-sm hover:shadow-md transition-all relative group
              ${emp.isBlocked ? 'border-red-200' : 'border-gray-100'}`}>

            {emp.isBlocked && (
              <div className="absolute top-3 left-3 flex items-center gap-1 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded-full border border-red-200">
                <ShieldOff size={10}/> BLOQUEADO
              </div>
            )}

            <div className="flex items-start justify-between mb-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-inner
                ${emp.isBlocked ? 'bg-red-100 text-red-400'
                  : emp.role === 'admin' ? 'bg-purple-100 text-purple-600'
                  : 'bg-blue-100 text-blue-600'}`}>
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border
                ${emp.role === 'admin'
                  ? 'bg-purple-50 text-purple-700 border-purple-100'
                  : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                {emp.role === 'admin' ? <Shield size={10}/> : <User size={10}/>}
                {emp.role === 'admin' ? 'Admin' : 'Cajero'}
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-800">{emp.name}</h3>
            <p className="text-sm text-gray-400 mb-4">{emp.email || 'Sin correo registrado'}</p>

            <div className="space-y-2 pt-4 border-t border-gray-50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-1"><Lock size={14}/> Acceso:</span>
                {emp.isBlocked ? (
                  <span className="font-bold text-red-500 text-xs flex items-center gap-1">
                    <ShieldOff size={11}/> Bloqueado ({emp.loginAttempts || 3} intentos)
                  </span>
                ) : (
                  <span className="font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-xs">
                    Contraseña configurada
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-1"><Calendar size={14}/> Registrado:</span>
                <span className="text-gray-600">{emp.createdAt.toLocaleDateString()}</span>
              </div>
              {emp.lastLogin && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Último acceso:</span>
                  <span className="text-gray-500 text-xs">
                    {emp.lastLogin?.toDate
                      ? emp.lastLogin.toDate().toLocaleString()
                      : new Date(emp.lastLogin).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Botón desbloquear */}
            {emp.isBlocked && (
              <button
                onClick={() => handleUnblock(emp.id, emp.name)}
                className="mt-4 w-full flex items-center justify-center gap-2 py-2.5
                           bg-green-600 hover:bg-green-700 text-white font-bold text-sm
                           rounded-xl transition-all active:scale-95 shadow-sm"
              >
                <ShieldCheck size={16}/> Desbloquear acceso
              </button>
            )}

            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => navigate(`/empleados/editar/${emp.id}`)}
                className="p-2 bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 rounded-lg shadow-sm"
                title="Editar"
              >
                <Edit size={16}/>
              </button>
              <button
                onClick={() => handleDelete(emp.id, emp.name)}
                className="p-2 bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 rounded-lg shadow-sm"
                title="Eliminar"
              >
                <Trash2 size={16}/>
              </button>
            </div>
          </div>
        ))}

        {employees.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50">
            <p className="text-gray-400 font-medium">No hay empleados registrados.</p>
          </div>
        )}
      </div>
    </div>
  );
}