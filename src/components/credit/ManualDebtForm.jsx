import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { sileo } from 'sileo';
import { Search, User, UserPlus, Loader2, Check } from 'lucide-react';
import { formatGuaranies, parseGuaraniesStr } from '../../utils/moneyUtils';
import { todayStrPY } from '../../utils/dateUtils';
import { registerManualCharge, createQuickClient, dateFromInputPY } from '../../utils/creditUtils';

/**
 * Carga una deuda anterior (ej.: anotada en un cuaderno) con la fecha real de
 * la compra. Si recibe `client` la carga a ese cliente; si no, deja elegir un
 * cliente existente o crear uno nuevo.
 */
export default function ManualDebtForm({ client, user, onSaved, onCancel }) {
  const [clients,  setClients]  = useState([]);
  const [search,   setSearch]   = useState('');
  const [picked,   setPicked]   = useState(client || null);
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState('');
  const [newRuc,   setNewRuc]   = useState('');
  const [newPhone, setNewPhone] = useState('');

  const [date,   setDate]   = useState(todayStrPY());
  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client) return;
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'clients'));
        setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
    };
    load();
  }, [client]);

  const matches = search.length < 2 ? [] : clients.filter(c =>
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.ruc  || '').includes(search)
  ).slice(0, 6);

  const duplicate = creating && newName.trim()
    ? clients.find(c => (c.name || '').trim().toLowerCase() === newName.trim().toLowerCase())
    : null;

  const numericAmount = parseFloat(amount) || 0;
  const hasClient = !!picked || (creating && newName.trim() && !duplicate);
  const dateOk    = !!date && date <= todayStrPY();
  const canSave   = hasClient && numericAmount > 0 && dateOk && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let target = picked;
      if (!target) {
        target = await createQuickClient({ name: newName, ruc: newRuc, phone: newPhone });
        setPicked(target);
        setCreating(false);
      }
      await registerManualCharge({
        clientId:      target.id,
        clientName:    target.name,
        amount:        numericAmount,
        date:          dateFromInputPY(date),
        note,
        createdById:   user?.id,
        createdByName: user?.name,
      });
      sileo.success({ title: 'Deuda cargada correctamente.' });
      onSaved?.(target);
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al cargar la deuda.' });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400';

  return (
    <div className="space-y-4">

      {/* ── CLIENTE ─────────────────────────────────────────────── */}
      {!client && (
        <div>
          <p className="block text-xs font-bold text-gray-500 uppercase mb-2">Cliente</p>

          {picked ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div>
                <p className="font-bold text-gray-800 text-sm">{picked.name}</p>
                <p className="text-xs text-gray-500">RUC/CI: {picked.ruc || 'Sin RUC'}</p>
              </div>
              <button type="button" onClick={() => setPicked(null)} className="text-xs font-bold text-amber-700 hover:underline">
                Cambiar
              </button>
            </div>
          ) : !creating ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                <input
                  id="md-search"
                  type="text"
                  placeholder="Buscar cliente por nombre o RUC/CI..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className={`${inputCls} pl-10`}
                />
              </div>
              <div className="space-y-1.5 mt-2">
                {matches.map(c => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setPicked(c)}
                    className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{c.name}</p>
                      <p className="text-xs text-gray-500">RUC/CI: {c.ruc || 'Sin RUC'}</p>
                    </div>
                    <User size={16} className="text-amber-500"/>
                  </button>
                ))}
              </div>
              {search.length >= 2 && matches.length === 0 && (
                <p className="text-xs text-gray-400 mt-2">No se encontró ese cliente.</p>
              )}
              <button
                type="button"
                onClick={() => { setCreating(true); setNewName(search); }}
                className="mt-2 w-full flex items-center justify-center gap-2 text-sm font-bold text-amber-700 border-2 border-dashed border-amber-300 rounded-xl py-2.5 hover:bg-amber-50 transition-colors"
              >
                <UserPlus size={16}/> Es un cliente nuevo
              </button>
            </>
          ) : (
            <div className="space-y-2 p-3 rounded-xl border border-amber-200 bg-amber-50/40">
              <input
                id="md-new-name"
                type="text"
                autoFocus
                placeholder="Nombre del cliente *"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className={inputCls}
              />
              {duplicate && (
                <p className="text-xs font-bold text-red-600">
                  Ya existe un cliente con ese nombre.{' '}
                  <button type="button" className="underline" onClick={() => { setPicked(duplicate); setCreating(false); }}>
                    Usar ese cliente
                  </button>
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  id="md-new-ruc"
                  type="text"
                  placeholder="RUC / CI (opcional)"
                  value={newRuc}
                  onChange={e => setNewRuc(e.target.value)}
                  className={inputCls}
                />
                <input
                  id="md-new-phone"
                  type="tel"
                  placeholder="Celular (opcional)"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  className={inputCls}
                />
              </div>
              <button type="button" onClick={() => setCreating(false)} className="text-xs font-bold text-gray-500 hover:underline">
                ← Elegir un cliente existente
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── DATOS DE LA DEUDA ───────────────────────────────────── */}
      <div>
        <label htmlFor="md-date" className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha de la compra</label>
        <input
          id="md-date"
          type="date"
          value={date}
          max={todayStrPY()}
          onChange={e => setDate(e.target.value)}
          className={inputCls}
        />
        <p className="text-[11px] text-gray-400 mt-1">El día en que el cliente se llevó la mercadería (por ejemplo, la fecha anotada en el cuaderno).</p>
      </div>

      <div>
        <label htmlFor="md-amount" className="block text-xs font-bold text-gray-500 uppercase mb-1">Monto de la deuda</label>
        <div className="relative">
          <span className="absolute left-3 top-3 text-amber-600 font-bold">₲</span>
          <input
            id="md-amount"
            type="text"
            inputMode="numeric"
            value={formatGuaranies(amount)}
            onChange={e => setAmount(parseGuaraniesStr(e.target.value))}
            placeholder="0"
            className="w-full pl-8 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:border-amber-400"
          />
        </div>
      </div>

      <div>
        <label htmlFor="md-note" className="block text-xs font-bold text-gray-500 uppercase mb-1">Nota (opcional)</label>
        <input
          id="md-note"
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Ej: Cuaderno, página 3"
          className={inputCls}
        />
      </div>

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-3 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl
                     disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          {saving ? <Loader2 size={18} className="animate-spin"/> : <Check size={18}/>}
          Registrar deuda
        </button>
      </div>
    </div>
  );
}
