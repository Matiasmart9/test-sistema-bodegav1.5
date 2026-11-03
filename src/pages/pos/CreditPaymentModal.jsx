import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { sileo } from 'sileo';
import { X, Search, User, HandCoins, Loader2, Check } from 'lucide-react';
import { formatGuaranies, parseGuaraniesStr } from '../../utils/moneyUtils';
import {
  fetchClientCredit,
  registerCreditPayment,
  toggleSalePaidItem,
  markSalePaidItems,
} from '../../utils/creditUtils';
import CreditHistoryList from '../../components/credit/CreditHistoryList';

export default function CreditPaymentModal({ onClose, cashier, shiftId }) {
  const [searchTerm,     setSearchTerm]     = useState('');
  const [clients,        setClients]        = useState([]);
  const [debtMap,        setDebtMap]        = useState({}); // { [clientId]: balance }
  const [loadingList,    setLoadingList]    = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [credit,         setCredit]         = useState(null);
  const [loadingCredit,  setLoadingCredit]  = useState(false);

  const [amount,          setAmount]          = useState('');
  const [note,            setNote]            = useState('');
  const [saving,          setSaving]          = useState(false);
  const [selectedToPay,   setSelectedToPay]   = useState({});
  const [togglingItemKey, setTogglingItemKey] = useState(null);

  useEffect(() => {
    const fetchClientsAndDebts = async () => {
      setLoadingList(true);
      try {
        const [clientsSnap, salesSnap, chargesSnap, paymentsSnap] = await Promise.all([
          getDocs(collection(db, 'clients')),
          getDocs(query(collection(db, 'sales'), where('paymentMethod', '==', 'fiado'))),
          getDocs(collection(db, 'credit_charges')),
          getDocs(collection(db, 'credit_payments')),
        ]);

        const allClients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const balances = {};

        salesSnap.docs.forEach(d => {
          const s = d.data();
          if (s.status === 'canceled' || !s.clientId) return;
          balances[s.clientId] = (balances[s.clientId] || 0) + (parseFloat(s.total) || 0);
        });
        chargesSnap.docs.forEach(d => {
          const c = d.data();
          if (c.status === 'voided' || !c.clientId) return;
          balances[c.clientId] = (balances[c.clientId] || 0) + (parseFloat(c.amount) || 0);
        });
        paymentsSnap.docs.forEach(d => {
          const p = d.data();
          if (p.status === 'voided' || !p.clientId) return;
          balances[p.clientId] = (balances[p.clientId] || 0) - (parseFloat(p.amount) || 0);
        });

        setClients(allClients);
        setDebtMap(balances);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingList(false);
      }
    };
    fetchClientsAndDebts();
  }, []);

  // Si no buscó nada, mostrar directamente los clientes con deuda pendiente (ordenados de mayor a menor deuda)
  const displayedClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return clients
        .filter(c => (debtMap[c.id] || 0) > 0)
        .sort((a, b) => (debtMap[b.id] || 0) - (debtMap[a.id] || 0));
    }
    return clients
      .filter(c =>
        (c.name || '').toLowerCase().includes(term) ||
        (c.ruc  || '').includes(term)
      )
      .sort((a, b) => (debtMap[b.id] || 0) - (debtMap[a.id] || 0))
      .slice(0, 15);
  }, [clients, debtMap, searchTerm]);

  const handleSelectClient = async (client) => {
    setSelectedClient(client);
    setSelectedToPay({});
    setAmount('');
    setNote('');
    setLoadingCredit(true);
    try {
      const data = await fetchClientCredit(client.id);
      setCredit(data);
      setDebtMap(prev => ({ ...prev, [client.id]: data.balance }));
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al cargar la cuenta del cliente.' });
    } finally {
      setLoadingCredit(false);
    }
  };

  const refreshCredit = async () => {
    if (!selectedClient) return;
    const refreshed = await fetchClientCredit(selectedClient.id);
    setCredit(refreshed);
    setDebtMap(prev => ({ ...prev, [selectedClient.id]: refreshed.balance }));
  };

  const handleBack = () => {
    setSelectedClient(null);
    setCredit(null);
    setAmount('');
    setNote('');
    setSelectedToPay({});
  };

  const selectedItemsSummary = useMemo(() => {
    if (!credit?.sales) return { count: 0, total: 0, names: [] };
    let count = 0;
    let total = 0;
    const names = [];
    for (const sale of credit.sales) {
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
  }, [credit, selectedToPay]);

  const handleToggleSelectItemToPay = (sale, item) => {
    setSelectedToPay(prev => {
      const current = prev[sale.id] || [];
      const exists = current.includes(item.idx);
      const nextForSale = exists ? current.filter(i => i !== item.idx) : [...current, item.idx];
      const nextMap = { ...prev, [sale.id]: nextForSale };

      let sum = 0;
      for (const s of (credit?.sales || [])) {
        const idxs = nextMap[s.id] || [];
        const items = s.creditStatus?.items || [];
        idxs.forEach(idx => {
          const it = items.find(x => x.idx === idx);
          if (it) sum += it.pendingAmount || it.effectiveLine || 0;
        });
      }
      const capped = Math.min(sum, credit?.balance || sum);
      setAmount(capped > 0 ? String(Math.round(capped)) : '');
      return nextMap;
    });
  };

  const handleToggleManualItemPaid = async (sale, itemIdx) => {
    const key = `${sale.id}-${itemIdx}`;
    setTogglingItemKey(key);
    try {
      await toggleSalePaidItem(sale.id, itemIdx, sale.paidItemIndices || []);
      await refreshCredit();
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al actualizar el estado del producto.' });
    } finally {
      setTogglingItemKey(null);
    }
  };

  const numericAmount = parseFloat(amount) || 0;
  const isValidAmount = numericAmount > 0 && numericAmount <= (credit?.balance || 0);

  const handleRegisterPayment = async () => {
    if (!isValidAmount) return;
    setSaving(true);
    try {
      const autoNote = !note.trim() && selectedItemsSummary.names.length > 0
        ? `Canceló: ${selectedItemsSummary.names.join(', ')}`
        : note;

      await markSalePaidItems(selectedToPay, credit?.sales || []);

      await registerCreditPayment({
        clientId:    selectedClient.id,
        clientName:  selectedClient.name,
        amount:      numericAmount,
        note:        autoNote,
        cashierId:   cashier?.id,
        cashierName: cashier?.name,
        shiftId,
      });
      sileo.success({ title: 'Pago registrado correctamente.' });
      await refreshCredit();
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

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">

        {/* HEADER */}
        <div className="px-5 py-4 bg-amber-600 text-white flex items-center justify-between shrink-0">
          <h2 className="font-black text-lg flex items-center gap-2">
            <HandCoins size={20}/> Cobrar Fiado / Consultar Cuenta
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <X size={20}/>
          </button>
        </div>

        <div className="p-5 overflow-y-auto">

          {!selectedClient ? (
            <>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Buscar cliente</label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                <input
                  type="text"
                  autoFocus
                  placeholder="Nombre o RUC/CI..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              {!searchTerm.trim() && (
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">
                  Clientes con saldo pendiente
                </p>
              )}

              {loadingList ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin text-amber-500" size={26}/>
                </div>
              ) : displayedClients.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">
                  {searchTerm.trim() ? 'No se encontraron clientes.' : 'No hay clientes con deuda pendiente.'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
                  {displayedClients.map(client => {
                    const bal = Math.max(0, debtMap[client.id] || 0);
                    return (
                      <button
                        key={client.id}
                        onClick={() => handleSelectClient(client)}
                        className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-colors flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                            <User size={15}/>
                          </div>
                          <div>
                            <p className="font-bold text-gray-800 text-sm">{client.name}</p>
                            <p className="text-xs text-gray-500">RUC/CI: {client.ruc || 'Sin RUC'}</p>
                          </div>
                        </div>
                        {bal > 0 ? (
                          <span className="font-black text-amber-700 text-sm">
                            ₲ {bal.toLocaleString('es-PY')}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                            AL DÍA
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <button onClick={handleBack} className="text-xs font-bold text-gray-500 hover:text-gray-800 mb-3 flex items-center gap-1">
                ← Volver a la lista de clientes
              </button>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="font-bold text-gray-800">{selectedClient.name}</p>
                <p className="text-xs text-gray-500 mb-3">RUC/CI: {selectedClient.ruc || 'Sin RUC'}</p>

                {loadingCredit ? (
                  <div className="flex justify-center py-4"><Loader2 className="animate-spin text-amber-500" size={24}/></div>
                ) : (
                  <>
                    <p className="text-xs font-bold text-amber-700 uppercase">Saldo pendiente</p>
                    <p className="text-3xl font-black text-amber-800">₲ {(credit?.balance || 0).toLocaleString('es-PY')}</p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Comprado a fiado: ₲ {(credit?.totalSold || 0).toLocaleString('es-PY')} · Pagado: ₲ {(credit?.totalPaid || 0).toLocaleString('es-PY')}
                    </p>
                  </>
                )}
              </div>

              {!loadingCredit && credit?.balance > 0 && (
                <div className="space-y-3 mb-5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase">
                        Monto a cobrar (total, parcial o marcando productos abajo)
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
                        placeholder={credit.balance.toString()}
                        className="w-full pl-8 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    {numericAmount > (credit?.balance || 0) && (
                      <p className="text-red-500 text-xs font-bold mt-1">El monto no puede superar la deuda.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nota (opcional)</label>
                    <input
                      type="text"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder={
                        selectedItemsSummary.names.length > 0
                          ? `Canceló: ${selectedItemsSummary.names.join(', ')}`
                          : 'Ej: Pagó en efectivo'
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
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

              {!loadingCredit && (
                <CreditHistoryList
                  credit={credit}
                  canVoid={false}
                  previewPaymentAmount={isValidAmount ? numericAmount : 0}
                  selectedToPay={selectedToPay}
                  onToggleSelectItemToPay={handleToggleSelectItemToPay}
                  onToggleManualItemPaid={handleToggleManualItemPaid}
                  togglingItemKey={togglingItemKey}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
