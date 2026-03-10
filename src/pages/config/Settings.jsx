import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  Save, Store, Receipt, MapPin, Phone, FileText,
  Loader2, Hash, ListOrdered, Info, CheckCircle, XCircle
} from 'lucide-react';

// ─── Calcula el próximo número de ticket dado el actual ──────────────────────
function getNextTicketNumber(current) {
  if (!current || current.trim() === '') return '';
  const str      = current.trim();
  const lastDash = str.lastIndexOf('-');
  if (lastDash === -1) {
    const num = parseInt(str) || 0;
    return String(num + 1).padStart(str.length, '0');
  }
  const prefix = str.substring(0, lastDash + 1); // incluye el guión
  const numStr = str.substring(lastDash + 1);
  const num    = parseInt(numStr) || 0;
  return prefix + String(num + 1).padStart(numStr.length, '0');
}

export default function Settings() {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [feedback, setFeedback] = useState(null); // { type, msg }

  const [config, setConfig] = useState({
    storeName:       '',
    storeRuc:        '',
    timbrado:        '',
    address:         '',
    phone:           '',
    ticketFooter:    '*** GRACIAS POR SU PREFERENCIA ***',
    ticketNumbering: '',
  });

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'general'));
        if (docSnap.exists()) {
          setConfig(prev => ({ ...prev, ...docSnap.data() }));
        } else {
          setConfig({
            storeName:       'BODEGA EL GRIFO',
            storeRuc:        '1234567-9',
            timbrado:        '12345678',
            address:         'Ruta 1 - San Ignacio Misiones',
            phone:           '0981 123 456',
            ticketFooter:    '*** GRACIAS POR SU PREFERENCIA ***',
            ticketNumbering: '',
          });
        }
      } catch (e) {
        console.error('Error cargando configuración:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  // ── Guardar ───────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await setDoc(doc(db, 'settings', 'general'), config);
      setFeedback({ type: 'success', msg: 'Configuración guardada correctamente.' });
    } catch (error) {
      console.error(error);
      setFeedback({ type: 'error', msg: 'Error al guardar. Intente nuevamente.' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4500);
    }
  };

  const nextTicket = getNextTicketNumber(config.ticketNumbering);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Configuración</h1>
        <p className="text-sm text-gray-500">Datos fiscales, diseño del ticket y numeración de facturas.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* ── FILA 1: Datos empresa + Diseño ticket ─────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* TARJETA 1: DATOS DEL NEGOCIO */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Store className="text-primary" size={20} /> Datos de la Empresa
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Nombre de Fantasía
                </label>
                <input
                  type="text"
                  value={config.storeName}
                  onChange={e => setConfig({ ...config, storeName: e.target.value })}
                  className="w-full border rounded-lg p-2.5 focus:outline-none focus:border-primary font-bold text-gray-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">RUC</label>
                  <input
                    type="text"
                    value={config.storeRuc}
                    onChange={e => setConfig({ ...config, storeRuc: e.target.value })}
                    className="w-full border rounded-lg p-2.5 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Timbrado</label>
                  <input
                    type="text"
                    value={config.timbrado}
                    onChange={e => setConfig({ ...config, timbrado: e.target.value })}
                    className="w-full border rounded-lg p-2.5 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1">
                  <MapPin size={12}/> Dirección
                </label>
                <input
                  type="text"
                  value={config.address}
                  onChange={e => setConfig({ ...config, address: e.target.value })}
                  className="w-full border rounded-lg p-2.5 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1">
                  <Phone size={12}/> Teléfono
                </label>
                <input
                  type="text"
                  value={config.phone}
                  onChange={e => setConfig({ ...config, phone: e.target.value })}
                  className="w-full border rounded-lg p-2.5 focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* TARJETA 2: DISEÑO DEL TICKET */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Receipt className="text-purple-600" size={20} /> Diseño del Ticket
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1">
                  <FileText size={12}/> Mensaje Pie de Página
                </label>
                <textarea
                  rows="3"
                  value={config.ticketFooter}
                  onChange={e => setConfig({ ...config, ticketFooter: e.target.value })}
                  className="w-full border rounded-lg p-2.5 focus:outline-none focus:border-primary text-sm font-mono"
                />
              </div>
              <div className="bg-gray-100 p-4 rounded-lg border border-gray-200 flex justify-center">
                <div className="bg-white p-4 border border-gray-300 shadow-sm font-mono text-[10px] text-center w-48">
                  <p className="font-black text-sm">{config.storeName || 'NOMBRE NEGOCIO'}</p>
                  <p>RUC: {config.storeRuc}</p>
                  <p>Timbrado: {config.timbrado}</p>
                  <p>{config.address}</p>
                  <p>Tel: {config.phone}</p>
                  <div className="border-b border-dashed border-gray-400 my-2"/>
                  <p className="text-gray-400 py-2">[...ITEMS...]</p>
                  <div className="border-b border-dashed border-gray-400 my-2"/>
                  <p className="whitespace-pre-wrap">{config.ticketFooter}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── TARJETA 3: NUMERACIÓN DE FACTURAS (ancho completo) ────────── */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
          <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
            <ListOrdered className="text-blue-600" size={20} />
            Numeración de Facturas / Tickets
          </h3>
          <p className="text-xs text-gray-500 mb-5">
            Ingrese el <strong>último número utilizado</strong>. El sistema generará el siguiente de
            forma automática y segura con cada venta. Cuando cambie de timbrado, actualice este
            campo y guarde.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

            {/* INPUT */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1">
                <Hash size={12}/> Numeración Actual (Último Número Usado)
              </label>
              <input
                type="text"
                placeholder="Ej: 001-0067"
                value={config.ticketNumbering}
                onChange={e => setConfig({ ...config, ticketNumbering: e.target.value })}
                className="w-full border-2 border-blue-200 rounded-xl p-3.5 text-xl font-mono
                           font-bold text-blue-800 focus:outline-none focus:border-blue-500
                           focus:ring-2 focus:ring-blue-500/20 bg-blue-50
                           placeholder:text-blue-200 placeholder:font-normal placeholder:text-base
                           tracking-widest transition-all"
              />
              <p className="text-[11px] text-gray-400 mt-2 flex items-start gap-1">
                <Info size={11} className="shrink-0 mt-0.5"/>
                Formatos válidos:
                <span className="font-mono bg-gray-100 px-1 rounded mx-0.5">001-0067</span>
                <span className="font-mono bg-gray-100 px-1 rounded mx-0.5">1-0067</span>
                <span className="font-mono bg-gray-100 px-1 rounded mx-0.5">00500</span>
              </p>
            </div>

            {/* PREVIEW */}
            <div className="space-y-3">
              <div className={`p-5 rounded-xl border-2 text-center transition-all
                ${nextTicket ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
              >
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Próximo Ticket Generado
                </p>
                {nextTicket ? (
                  <p className="text-4xl font-black text-green-700 font-mono tracking-widest">
                    {nextTicket}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 italic py-2">
                    Ingrese un número para ver la preview
                  </p>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-[11px] text-blue-700 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5 text-blue-800">
                  <Info size={13}/> ¿Cómo funciona?
                </p>
                <p>• Cada venta incrementa automáticamente el contador.</p>
                <p>• El prefijo (ej. <code className="bg-blue-100 px-1 rounded">001-</code>) queda fijo hasta que lo cambie aquí.</p>
                <p>• Usa <strong>transacción atómica</strong> en Firebase para evitar duplicados.</p>
                <p>• Si hoy estás en <code className="bg-blue-100 px-1 rounded">1-0067</code>, ingrese eso y la próxima venta será <code className="bg-blue-100 px-1 rounded">1-0068</code>.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── FEEDBACK INLINE ───────────────────────────────────────────── */}
        {feedback && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm font-semibold transition-all
            ${feedback.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'}`}
          >
            {feedback.type === 'success'
              ? <CheckCircle size={18} className="text-green-500 shrink-0"/>
              : <XCircle    size={18} className="text-red-500 shrink-0"/>}
            {feedback.msg}
          </div>
        )}

        {/* ── BOTÓN GUARDAR ─────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-white px-8 py-3 rounded-xl font-bold hover:bg-green-600
                       shadow-lg shadow-green-200 flex items-center gap-2 disabled:opacity-50
                       transition-all active:scale-95"
          >
            {saving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
            GUARDAR CONFIGURACIÓN
          </button>
        </div>

      </form>
    </div>
  );
}