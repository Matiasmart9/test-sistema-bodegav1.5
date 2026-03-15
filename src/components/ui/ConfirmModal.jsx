import React from 'react';
import { AlertTriangle, Trash2, X, Ban, LogOut } from 'lucide-react';

// ─── Íconos y colores por variante ───────────────────────────────────────────
const VARIANTS = {
  danger: {
    icon:       <Trash2 size={28} />,
    iconBg:     'bg-red-100',
    iconColor:  'text-red-600',
    border:     'border-red-100',
    confirmCls: 'bg-red-600 hover:bg-red-700 shadow-red-200',
  },
  warning: {
    icon:       <AlertTriangle size={28} />,
    iconBg:     'bg-amber-100',
    iconColor:  'text-amber-600',
    border:     'border-amber-100',
    confirmCls: 'bg-amber-500 hover:bg-amber-600 shadow-amber-200',
  },
  void: {
    icon:       <Ban size={28} />,
    iconBg:     'bg-rose-100',
    iconColor:  'text-rose-600',
    border:     'border-rose-100',
    confirmCls: 'bg-rose-600 hover:bg-rose-700 shadow-rose-200',
  },
  logout: {
    icon:       <LogOut size={28} />,
    iconBg:     'bg-gray-100',
    iconColor:  'text-gray-700',
    border:     'border-gray-200',
    confirmCls: 'bg-gray-800 hover:bg-black shadow-gray-300',
  },
};

/**
 * ConfirmModal — reemplaza window.confirm() para acciones destructivas.
 *
 * Props:
 *  - title: string (requerido)
 *  - description: string (opcional)
 *  - confirmText: string (default: "Confirmar")
 *  - cancelText: string (default: "Cancelar")
 *  - variant: 'danger' | 'warning' | 'void' | 'logout' (default: 'danger')
 *  - onConfirm: () => void
 *  - onClose: () => void
 *
 * Uso:
 *   const [modal, setModal] = useState(null);
 *
 *   // Abrir:
 *   setModal({
 *     title: '¿Eliminar producto?',
 *     description: 'Esta acción no se puede deshacer.',
 *     onConfirm: () => handleDelete(id),
 *   });
 *
 *   // En JSX:
 *   {modal && <ConfirmModal {...modal} onClose={() => setModal(null)} />}
 */
export default function ConfirmModal({
  title,
  description,
  confirmText = 'Confirmar',
  cancelText  = 'Cancelar',
  variant     = 'danger',
  onConfirm,
  onClose,
}) {
  const v = VARIANTS[variant] || VARIANTS.danger;

  const handleConfirm = () => {
    onConfirm?.();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm border ${v.border} animate-fadeIn`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-4">
            <div className={`${v.iconBg} ${v.iconColor} p-3 rounded-xl`}>
              {v.icon}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <h3 className="text-lg font-bold text-gray-900 leading-tight mb-2">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-gray-500 leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {/* Botones */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 font-bold
                       rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 px-4 py-2.5 text-white font-bold rounded-xl shadow-lg
                        transition-all active:scale-95 text-sm ${v.confirmCls}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}