import React from 'react';
import { X, BookOpen } from 'lucide-react';
import ManualDebtForm from './ManualDebtForm';

/**
 * Ventana para cargar una deuda anterior (ej.: de un cuaderno) a un cliente
 * nuevo o existente. La usan el admin ("Agregar Cliente") y la cajera con el
 * permiso "Habilitar carga manual Fiado".
 */
export default function ManualDebtModal({ title = 'Carga Manual de Fiado', user, onClose, onSaved }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 bg-amber-600 text-white flex items-center justify-between shrink-0">
          <h2 className="font-black text-lg flex items-center gap-2">
            <BookOpen size={20}/> {title}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <X size={20}/>
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <p className="text-xs text-gray-500 mb-4">
            Para cargar deudas que ya existían antes del sistema. No se cuentan como ventas del día ni entran en la caja.
          </p>
          <ManualDebtForm
            user={user}
            onCancel={onClose}
            onSaved={(client) => { onSaved?.(client); onClose(); }}
          />
        </div>
      </div>
    </div>
  );
}
