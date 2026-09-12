import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { sileo } from 'sileo';
import { HandCoins, Search, X, Loader2, Check, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatGuaranies, parseGuaraniesStr } from '../../utils/moneyUtils';
import { fetchClientCredit, registerCreditPayment, voidCreditPayment } from '../../utils/creditUtils';
import CreditHistoryList from '../../components/credit/CreditHistoryList';
import ConfirmModal from '../../components/ui/ConfirmModal';

export default function CreditClientsList() {
  const { userData } = useAuth();
  const [loading,  setLoading]  = useState(true);
  const [rows,     setRows]     = useState([]); // [{ client, credit }]
  const [search,   setSearch]   = useState('');
  const [showAll,  setShowAll]  = useState(false); // incluir clientes con saldo en 0

  const [selected,      setSelected]      = useState(null); // { client, credit }
  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [voidingId, setVoidingId] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const salesSnap = await getDocs(query(collection(db, 'sales'), where('paymentMethod', '==', 'fiado')));
      const clientIds = [...new Set(salesSnap.docs.map(d => d.data().clientId).filter(Boolean))];

      const clientsSnap = await getDocs(collection(db, 'clients'));
      const clientsMap = {};
      clientsSnap.docs.forEach(d => { clientsMap[d.id] = { id: d.id, ...d.data() }; });

      const credits = await Promise.all(clientIds.map(id => fetchClientCredit(id)));
      const built = clientIds
        .map((id, idx) => ({ client: clientsMap[id], credit: credits[idx] }))
        .filter(r => r.client);

      built.sort((a, b) => b.credit.balance - a.credit.balance);
      setRows(built);
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al cargar clientes fiados.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredRows = rows.filter(r => {
    const matchesSearch = !search ||
      (r.client.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.client.ruc  || '').includes(search);
    const matchesBalance = showAll || r.credit.balance > 0;
    return matchesSearch && matchesBalance;
  });

  const totalDebt = rows.reduce((acc, r) => acc + Math.max(0, r.credit.balance), 0);

  const openDetail = (row) => {
    setSelected(row);
    setAmount('');
    setNote('');
  };

  const refreshSelected = async () => {
    const refreshed = await fetchClientCredit(selected.client.id);
    setSelected(prev => ({ ...prev, credit: refreshed }));
    setRows(prev => prev.map(r => r.client.id === selected.client.id ? { ...r, credit: refreshed } : r));
  };

  const numericAmount = parseFloat(amount) || 0;
  const isValidAmount = numericAmount > 0 && numericAmount <= (selected?.credit.balance || 0);

  const handleRegisterPayment = async () => {
    if (!isValidAmount) return;
    setSaving(true);
    try {
      await registerCreditPayment({
        clientId:    selected.client.id,
        clientName:  selected.client.name,
        amount:      numericAmount,
        note,
        cashierId:   userData?.id,
        cashierName: userData?.name || 'Admin',
      });
      sileo.success({ title: 'Pago registrado correctamente.' });
      await refreshSelected();
      setAmount('');
      setNote('');
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al registrar el pago.' });
    } finally {
      setSaving(false);
    }
  };

  const handleVoidPayment = (payment) => {
    setConfirmModal({
      title: '¿Anular este pago?',
      description: `Se va a sumar nuevamente ₲ ${parseFloat(payment.amount || 0).toLocaleString('es-PY')} a la deuda del cliente. Esta acción queda registrada en el historial.`,
      confirmText: 'Sí, anular pago',
      variant: 'danger',
      onConfirm: async () => {
        setVoidingId(payment.id);
        try {
          await voidCreditPayment(payment.id, { voidedBy: userData?.name || 'Admin' });
          sileo.success({ title: 'Pago anulado.' });
          await refreshSelected();
        } catch (e) {
          console.error(e);
          sileo.error({ title: 'Error al anular el pago.' });
        } finally {
          setVoidingId(null);
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={40}/>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {confirmModal && <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <HandCoins className="text-amber-600" size={26}/>
            Clientes Fiados
          </h1>
          <p className="text-sm text-gray-500 mt-1">Deuda total pendiente de todos los clientes: <strong className="text-amber-700">₲ {totalDebt.toLocaleString('es-PY')}</strong></p>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18}/>
          <input
            type="text"
            placeholder="Buscar cliente por nombre o RUC/CI..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-primary text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 font-medium cursor-pointer select-none">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="accent-primary"/>
          Mostrar también los saldados
        </label>
      </div>

      {/* LISTA */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {filteredRows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <HandCoins size={32} className="mx-auto mb-2 opacity-30"/>
            No hay clientes fiados con estos filtros.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredRows.map(row => (
              <button
                key={row.client.id}
                onClick={() => openDetail(row)}
                className="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                    <User size={16}/>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{row.client.name}</p>
                    <p className="text-xs text-gray-500">RUC/CI: {row.client.ruc || 'Sin RUC'}</p>
                  </div>
                </div>
                {row.credit.balance > 0 ? (
                  <span className="font-black text-amber-700">₲ {row.credit.balance.toLocaleString('es-PY')}</span>
                ) : (
                  <span className="text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">AL DÍA</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* DETALLE / MODAL */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 bg-amber-600 text-white flex items-center justify-between shrink-0">
              <h2 className="font-black text-lg flex items-center gap-2">
                <HandCoins size={20}/> {selected.client.name}
              </h2>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <X size={20}/>
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-xs font-bold text-amber-700 uppercase">Saldo pendiente</p>
                <p className="text-3xl font-black text-amber-800">₲ {selected.credit.balance.toLocaleString('es-PY')}</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Comprado a fiado: ₲ {selected.credit.totalSold.toLocaleString('es-PY')} · Pagado: ₲ {selected.credit.totalPaid.toLocaleString('es-PY')}
                </p>
              </div>

              {selected.credit.balance > 0 && (
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Registrar pago</label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-amber-600 font-bold">₲</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatGuaranies(amount)}
                        onChange={e => setAmount(parseGuaraniesStr(e.target.value))}
                        placeholder={selected.credit.balance.toString()}
                        className="w-full pl-8 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    {numericAmount > selected.credit.balance && (
                      <p className="text-red-500 text-xs font-bold mt-1">El monto no puede superar la deuda.</p>
                    )}
                  </div>
                  <input
                    type="text"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Nota (opcional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={handleRegisterPayment}
                    disabled={!isValidAmount || saving}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl
                               disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    {saving ? <Loader2 size={18} className="animate-spin"/> : <Check size={18}/>}
                    Registrar Pago
                  </button>
                </div>
              )}

              <CreditHistoryList
                credit={selected.credit}
                canVoid
                voidingId={voidingId}
                onVoidPayment={handleVoidPayment}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
