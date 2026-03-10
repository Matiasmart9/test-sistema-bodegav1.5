import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL STORE  (no context needed — call toast.success() from anywhere)
// ─────────────────────────────────────────────────────────────────────────────
let _listeners = new Set();
let _toasts    = [];
let _idCounter = 0;

function _notify() {
  _listeners.forEach(fn => fn([..._toasts]));
}

function _add(message, type, duration = 3500) {
  const id = ++_idCounter;
  _toasts = [..._toasts, { id, message, type, duration }];
  _notify();
  return id;
}

export function _remove(id) {
  _toasts = _toasts.filter(t => t.id !== id);
  _notify();
}

/** Call from any file: toast.success("Guardado"), toast.error("Falló"), etc. */
export const toast = {
  success: (msg, duration)       => _add(msg, 'success', duration),
  error:   (msg, duration = 4500) => _add(msg, 'error',   duration),
  warning: (msg, duration)       => _add(msg, 'warning',  duration),
  info:    (msg, duration)       => _add(msg, 'info',     duration),
};

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL TOAST ITEM
// ─────────────────────────────────────────────────────────────────────────────
const STYLES = {
  success: {
    wrapper: 'bg-green-50  border-green-200',
    icon:    'text-green-500',
    text:    'text-green-900',
    Ico:     CheckCircle,
  },
  error: {
    wrapper: 'bg-red-50    border-red-200',
    icon:    'text-red-500',
    text:    'text-red-900',
    Ico:     XCircle,
  },
  warning: {
    wrapper: 'bg-yellow-50 border-yellow-200',
    icon:    'text-yellow-500',
    text:    'text-yellow-900',
    Ico:     AlertTriangle,
  },
  info: {
    wrapper: 'bg-blue-50   border-blue-200',
    icon:    'text-blue-500',
    text:    'text-blue-900',
    Ico:     Info,
  },
};

function ToastItem({ toast: t, onClose }) {
  const [visible, setVisible] = useState(false);

  // Mount → visible (enter animation)
  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, t.duration);
    return () => { cancelAnimationFrame(show); clearTimeout(hide); };
  }, []); // eslint-disable-line

  const s = STYLES[t.type] || STYLES.info;
  const Icon = s.Ico;

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-xl border shadow-xl
        min-w-[280px] max-w-[380px] w-full
        transition-all duration-300 ease-out
        ${s.wrapper}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}
      `}
    >
      <Icon size={20} className={`shrink-0 mt-0.5 ${s.icon}`} />
      <p className={`text-sm font-semibold flex-1 leading-snug ${s.text}`}>
        {t.message}
      </p>
      <button
        onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
        className="text-gray-400 hover:text-gray-600 p-0.5 rounded shrink-0 transition-colors"
      >
        <X size={15} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTAINER  — render once in App.jsx
// ─────────────────────────────────────────────────────────────────────────────
export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _listeners.add(setToasts);
    setToasts([..._toasts]);
    return () => _listeners.delete(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onClose={() => _remove(t.id)} />
        </div>
      ))}
    </div>
  );
}