import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { sileo } from 'sileo';
import { X, Search, User, HandCoins, Loader2, Check } from 'lucide-react';
import { formatGuaranies, parseGuaraniesStr } from '../../utils/moneyUtils';
import { fetchClientCredit, registerCreditPayment } from '../../utils/creditUtils';
import CreditHistoryList from '../../components/credit/CreditHistoryList';

export default function CreditPaymentModal({ onClose, cashier }) {
  const [searchTerm,     setSearchTerm]     = useState('');
  const [clients,        setClients]        = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [credit,         setCredit]         = useState(null);
  const [loadingCredit,  setLoadingCredit]  = useState(false);

  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const snap = await getDocs(collection(db, 'clients'));
        setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
    };
    fetchClients();
  }, []);

  const filteredClients = searchTerm.length < 2 ? [] : clients.filter(c =>
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.ruc  || '').includes(searchTerm)
  ).slice(0, 6);

  const handleSelectClient = async (client) => {
    setSelectedClient(client);
    setLoadingCredit(true);
    try {
      const data = await fetchClientCredit(client.id);
      setCredit(data);
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al cargar la cuenta del cliente.' });
    } finally {
      setLoadingCredit(false);
    }
  };

  const handleBack = () => {
    setSelectedClient(null);
    setCredit(null);
    setAmount('');
    setNote('');
  };

  const numericAmount = parseFloat(amount) || 0;
  const isValidAmount = numericAmount > 0 && numericAmount <= (credit?.balance || 0);

  const handleRegisterPayment = async () => {
    if (!isValidAmount) return;
    setSaving(true);
    try {
      await registerCreditPayment({
        clientId:    selectedClient.id,
        clientName:  selectedClient.name,
        amount:      numericAmount,
        note,
        cashierId:   cashier?.id,
        cashierName: cashier?.name,
      });
      sileo.success({ title: 'Pago registrado correctamente.' });
      const refreshed = await fetchClientCredit(selectedClient.id);
      setCredit(refreshed);
      setAmount('');
      setNote('');
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al registrar el pago.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* HEADER */}
        <div className="px-5 py-4 bg-amber-600 text-white flex items-center justify-between shrink-0">
          <h2 className="font-black text-lg flex items-center gap-2">
            <HandCoins size={20}/> Cobrar Fiado
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

              {searchTerm.length >= 2 && filteredClients.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-6">No se encontraron clientes.</p>
              )}

              <div className="space-y-1.5">
                {filteredClients.map(client => (
                  <button
                    key={client.id}
                    onClick={() => handleSelectClient(client)}
                    className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{client.name}</p>
                      <p className="text-xs text-gray-500">RUC/CI: {client.ruc || 'Sin RUC'}</p>
                    </div>
                    <User size={16} className="text-amber-500"/>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button onClick={handleBack} className="text-xs font-bold text-gray-400 hover:text-gray-600 mb-3">
                ← Buscar otro cliente
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
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Monto a cobrar</label>
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
                      placeholder="Ej: Pagó en efectivo"
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
                    Registrar Pago
                  </button>
                </div>
              )}

              {!loadingCredit && (
                <div className="max-h-48 overflow-y-auto">
                  <CreditHistoryList credit={credit} canVoid={false}/>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
