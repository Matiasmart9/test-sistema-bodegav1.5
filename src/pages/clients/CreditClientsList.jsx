import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { sileo } from 'sileo';
import { HandCoins, Search, X, Loader2, Check, User, UserPlus, BookOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatGuaranies, parseGuaraniesStr } from '../../utils/moneyUtils';
import {
  fetchClientCredit,
  registerCreditPayment,
  voidCreditPayment,
  voidManualCharge,
  toggleSalePaidItem,
  markSalePaidItems,
} from '../../utils/creditUtils';
import CreditHistoryList from '../../components/credit/CreditHistoryList';
import ManualDebtModal from '../../components/credit/ManualDebtModal';
import ManualDebtForm from '../../components/credit/ManualDebtForm';
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
  const [showManualModal, setShowManualModal] = useState(false); // "Agregar Cliente" (deuda anterior)
  const [showManualForm,  setShowManualForm]  = useState(false); // deuda manual dentro del detalle
  const [selectedToPay,   setSelectedToPay]   = useState({});    // { [saleId]: number[] }
  const [togglingItemKey, setTogglingItemKey] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [salesSnap, chargesSnap] = await Promise.all([
        getDocs(query(collection(db, 'sales'), where('paymentMethod', '==', 'fiado'))),
        getDocs(collection(db, 'credit_charges')),
      ]);
      const clientIds = [...new Set([
        ...salesSnap.docs.map(d => d.data().clientId),
        ...chargesSnap.docs.map(d => d.data().clientId),
      ].filter(Boolean))];

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
    setSelectedToPay({});
    setShowManualForm(false);
  };

  const refreshSelected = async () => {
    const refreshed = await fetchClientCredit(selected.client.id);
    setSelected(prev => ({ ...prev, credit: refreshed }));
    setRows(prev => prev.map(r => r.client.id === selected.client.id ? { ...r, credit: refreshed } : r));
  };

  // Calcula la suma y nombres de los productos marcados con tilde para cobrar ahora
  const selectedItemsSummary = React.useMemo(() => {
    if (!selected?.credit?.sales) return { count: 0, total: 0, names: [] };
    let count = 0;
    let total = 0;
    const names = [];
    for (const sale of selected.credit.sales) {
      const idxs = selectedToPay[sale.id] || [];
      if (!idxs.length) continue;
      const items = sale.creditStatus?.items || [];
      idxs.forEach(idx => {
        const it = items.find(x => x.idx === idx);
        if (it) {
          count += 1;
          total += it.pendingAmount || it.effectiveLine || 0;
          names.push(it.name);
        }
      });
    }
    return { count, total, names };
  }, [selected, selectedToPay]);

  const handleToggleSelectItemToPay = (sale, item) => {
    setSelectedToPay(prev => {
      const current = prev[sale.id] || [];
      const exists = current.includes(item.idx);
      const nextForSale = exists ? current.filter(i => i !== item.idx) : [...current, item.idx];
      const nextMap = { ...prev, [sale.id]: nextForSale };

      // Recalcular el total seleccionado para actualizar el input de monto a cobrar
      let sum = 0;
      for (const s of (selected?.credit?.sales || [])) {
        const idxs = nextMap[s.id] || [];
        const items = s.creditStatus?.items || [];
        idxs.forEach(idx => {
          const it = items.find(x => x.idx === idx);
          if (it) sum += it.pendingAmount || it.effectiveLine || 0;
        });
      }
      const capped = Math.min(sum, selected?.credit?.balance || sum);
      setAmount(capped > 0 ? String(Math.round(capped)) : '');
      return nextMap;
    });
  };

  const handleToggleManualItemPaid = async (sale, itemIdx) => {
    const key = `${sale.id}-${itemIdx}`;
    setTogglingItemKey(key);
    try {
      await toggleSalePaidItem(sale.id, itemIdx, sale.paidItemIndices || []);
      await refreshSelected();
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al actualizar el estado del producto.' });
    } finally {
      setTogglingItemKey(null);
    }
  };

  const numericAmount = parseFloat(amount) || 0;
  const isValidAmount = numericAmount > 0 && numericAmount <= (selected?.credit.balance || 0);

  const handleRegisterPayment = async () => {
    if (!isValidAmount) return;
    setSaving(true);
    try {
      const autoNote = !note.trim() && selectedItemsSummary.names.length > 0
        ? `Canceló: ${selectedItemsSummary.names.join(', ')}`
        : note;

      await markSalePaidItems(selectedToPay, selected.credit.sales || []);

      await registerCreditPayment({
        clientId:    selected.client.id,
        clientName:  selected.client.name,
        amount:      numericAmount,
        note:        autoNote,
        cashierId:   userData?.id,
        cashierName: userData?.name || 'Admin',
      });
      sileo.success({ title: 'Pago registrado correctamente.' });
      await refreshSelected();
      setAmount('');
      setNote('');
      setSelectedToPay({});
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
          await voidCreditPayment(payment.id, { voidedBy: userData?.name || 'Admin', shiftId: payment.shiftId, amount: payment.amount });
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

  const handleVoidCharge = (charge) => {
    setConfirmModal({
      title: '¿Anular esta deuda anterior?',
      description: `Se va a quitar ₲ ${parseFloat(charge.amount || 0).toLocaleString('es-PY')} de la deuda del cliente. Queda registrada como anulada en el historial.`,
      confirmText: 'Sí, anular deuda',
      variant: 'danger',
      onConfirm: async () => {
        setVoidingId(charge.id);
        try {
          await voidManualCharge(charge.id, { voidedBy: userData?.name || 'Admin' });
          sileo.success({ title: 'Deuda anulada.' });
          await refreshSelected();
        } catch (e) {
          console.error(e);
          sileo.error({ title: 'Error al anular la deuda.' });
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
        <button
          onClick={() => setShowManualModal(true)}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all active:scale-95"
        >
          <UserPlus size={18}/> Agregar Cliente
        </button>
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
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
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
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase">
                        Registrar pago (total, parcial o marcando productos abajo)
                      </label>
                      {selectedItemsSummary.count > 0 && (
                        <button
                          type="button"
                          onClick={() => { setSelectedToPay({}); setAmount(''); }}
                          className="text-[11px] font-bold text-amber-700 hover:underline"
                        >
                          Limpiar selección ({selectedItemsSummary.count})
                        </button>
                      )}
                    </div>

                    {selectedItemsSummary.count > 0 && (
                      <div className="mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
                        <span className="truncate">
                          <strong>{selectedItemsSummary.count} prod. marcados:</strong> {selectedItemsSummary.names.join(', ')}
                        </span>
                        <span className="font-black shrink-0">₲ {selectedItemsSummary.total.toLocaleString('es-PY')}</span>
                      </div>
                    )}

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
                    placeholder={
                      selectedItemsSummary.names.length > 0
                        ? `Canceló: ${selectedItemsSummary.names.join(', ')}`
                        : 'Nota (opcional)'
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={handleRegisterPayment}
                    disabled={!isValidAmount || saving}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl
                               disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    {saving ? <Loader2 size={18} className="animate-spin"/> : <Check size={18}/>}
                    Registrar Pago {numericAmount > 0 && isValidAmount ? `(₲ ${numericAmount.toLocaleString('es-PY')})` : ''}
                  </button>
                </div>
              )}

              {showManualForm ? (
                <div className="mb-5 p-4 rounded-xl border border-amber-200 bg-amber-50/40">
                  <p className="text-xs font-bold text-amber-800 uppercase mb-3 flex items-center gap-1.5">
                    <BookOpen size={14}/> Agregar deuda manual a {selected.client.name}
                  </p>
                  <ManualDebtForm
                    client={selected.client}
                    user={userData}
                    onCancel={() => setShowManualForm(false)}
                    onSaved={async () => { setShowManualForm(false); await refreshSelected(); }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowManualForm(true)}
                  className="w-full mb-5 flex items-center justify-center gap-2 text-sm font-bold text-amber-700 border-2 border-dashed border-amber-300 rounded-xl py-2.5 hover:bg-amber-50 transition-colors"
                >
                  <BookOpen size={16}/> Agregar deuda manual
                </button>
              )}

              <CreditHistoryList
                credit={selected.credit}
                canVoid
                voidingId={voidingId}
                onVoidPayment={handleVoidPayment}
                onVoidCharge={handleVoidCharge}
                previewPaymentAmount={isValidAmount ? numericAmount : 0}
                selectedToPay={selectedToPay}
                onToggleSelectItemToPay={handleToggleSelectItemToPay}
                onToggleManualItemPaid={handleToggleManualItemPaid}
                togglingItemKey={togglingItemKey}
              />
            </div>
          </div>
        </div>
      )}

      {showManualModal && (
        <ManualDebtModal
          title="Agregar Cliente"
          user={userData}
          onClose={() => setShowManualModal(false)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
