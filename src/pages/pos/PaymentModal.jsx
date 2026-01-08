import React, { useState, useEffect } from 'react';
import { X, Check, Search, UserPlus, User, Mail, Printer, AlertTriangle } from 'lucide-react';
import { collection, getDocs, addDoc, query, where } from 'firebase/firestore'; 
import { db } from '../../firebase/config';
import TicketInvoice from './TicketInvoice';

export default function PaymentModal({ total, cart, onClose, onProcessPayment, onFinalize }) {
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [step, setStep] = useState(1); 
  const [ticketData, setTicketData] = useState(null);
  
  // ESTADOS CLIENTE
  const [clientMode, setClientMode] = useState('final'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [foundClients, setFoundClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  
  const [newClientData, setNewClientData] = useState({ name: '', ruc: '', address: '', email: '' });

  // VALORES NUMÉRICOS PARA VALIDACIÓN
  const numericReceived = parseFloat(amountPaid) || 0;
  // Validación: Si es efectivo, el monto debe ser mayor o igual al total. 
  // (Si el campo está vacío, asumimos que quiere pagar exacto, pero si escribe algo, validamos)
  const isInsufficient = paymentMethod === 'cash' && amountPaid !== '' && numericReceived < total;

  // CÁLCULO DE VUELTO
  const calculatedChange = Math.max(0, numericReceived - total);

  // BUSCAR CLIENTES
  useEffect(() => {
    if (searchTerm.length > 2) {
        const search = async () => {
            const q = query(collection(db, "clients"));
            const snap = await getDocs(q);
            const matches = snap.docs
                .map(d => ({id: d.id, ...d.data()}))
                .filter(c => c.ruc.includes(searchTerm) || c.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .slice(0, 3);
            setFoundClients(matches);
        };
        const timer = setTimeout(search, 500);
        return () => clearTimeout(timer);
    } else {
        setFoundClients([]);
    }
  }, [searchTerm]);

  // CONTROL DE MÉTODOS DE PAGO
  useEffect(() => {
      if (paymentMethod !== 'cash') {
          setAmountPaid(total.toString());
      } else {
          setAmountPaid(''); // Limpiamos para obligar o permitir entrada manual
      }
  }, [paymentMethod, total]);

  const handleCreateClient = async () => {
      if(!newClientData.name || !newClientData.ruc) return alert("Nombre y RUC requeridos");
      try {
          const docRef = await addDoc(collection(db, "clients"), newClientData);
          const newClient = { id: docRef.id, ...newClientData };
          setSelectedClient(newClient);
          setIsCreatingClient(false);
          setClientMode('named'); 
      } catch (e) { console.error(e); alert("Error creando cliente"); }
  };

  const handleNextStep = () => {
      if (clientMode === 'named' && !selectedClient) {
          alert("⚠️ ATENCIÓN: Debes seleccionar un cliente de la búsqueda o crear uno nuevo para continuar.");
          return;
      }
      setStep(2);
  };

  const handleConfirmSale = async () => {
    // 1. VALIDACIÓN DE SEGURIDAD (IMPIDE PROCESAR SI FALTA DINERO)
    if (paymentMethod === 'cash') {
        const received = parseFloat(amountPaid);
        // Si escribió algo y es menor al total -> ERROR
        if (!isNaN(received) && received < total) {
            return alert(`⚠️ Error: El monto recibido (₲ ${received.toLocaleString()}) es menor al total a cobrar.`);
        }
    }

    const finalClient = selectedClient || { name: 'SIN NOMBRE', ruc: 'SIN RUC', address: 'Mostrador' };
    
    // Si amountPaid está vacío en efectivo, asumimos pago exacto (total)
    const finalAmount = paymentMethod === 'cash' 
        ? (parseFloat(amountPaid) || total) 
        : total;

    const result = await onProcessPayment({
        amountPaid: finalAmount,
        method: paymentMethod,
        change: Math.max(0, finalAmount - total),
        client: finalClient
    });

    if (result && result.success) {
        setTicketData({ ...result, client: finalClient });
        setStep(3); 
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* HEADER */}
        <div className="bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center shrink-0">
            <h3 className="font-bold text-gray-800 text-lg">
                {step === 1 ? 'Datos de Facturación' : step === 2 ? 'Procesar Pago' : 'Venta Exitosa'}
            </h3>
            {step !== 3 && <button onClick={onClose}><X className="text-gray-400 hover:text-gray-600"/></button>}
        </div>

        {/* CONTENIDO SCROLLEABLE */}
        <div className="p-0 overflow-y-auto flex-1">
            
            {/* PASO 1: SELECCIÓN DE CLIENTE */}
            {step === 1 && (
                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-3 p-1 bg-gray-100 rounded-xl">
                        <button 
                            onClick={() => { setClientMode('final'); setSelectedClient(null); }}
                            className={`py-2 text-sm font-bold rounded-lg transition-all ${clientMode === 'final' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
                        >
                            Sin Nombre / C.F.
                        </button>
                        <button 
                            onClick={() => setClientMode('named')}
                            className={`py-2 text-sm font-bold rounded-lg transition-all ${clientMode === 'named' ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
                        >
                            Con RUC / Nombre
                        </button>
                    </div>

                    {clientMode === 'named' && !isCreatingClient && (
                        <div className="relative">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Buscar Cliente</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                                <input 
                                    type="text" 
                                    autoFocus
                                    placeholder="Escribe RUC o Nombre..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-green-100 outline-none"
                                />
                            </div>
                            
                            {foundClients.length > 0 && (
                                <div className="absolute top-full left-0 right-0 bg-white shadow-xl border border-gray-100 rounded-lg mt-1 z-10 divide-y">
                                    {foundClients.map(client => (
                                        <div 
                                            key={client.id} 
                                            onClick={() => { setSelectedClient(client); setSearchTerm(client.name); setFoundClients([]); }}
                                            className="p-3 hover:bg-gray-50 cursor-pointer"
                                        >
                                            <p className="font-bold text-gray-800 text-sm">{client.name}</p>
                                            <p className="text-xs text-gray-500">RUC: {client.ruc}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {selectedClient && (
                                <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-lg flex justify-between items-center animate-fadeIn">
                                    <div>
                                        <p className="font-bold text-green-800 text-sm">{selectedClient.name}</p>
                                        <p className="text-xs text-green-600">RUC: {selectedClient.ruc}</p>
                                    </div>
                                    <button onClick={() => {setSelectedClient(null); setSearchTerm('');}} className="text-green-400 hover:text-green-700"><X size={16}/></button>
                                </div>
                            )}

                            <button 
                                onClick={() => setIsCreatingClient(true)}
                                className="mt-4 w-full py-2 border border-dashed border-gray-300 text-gray-500 rounded-lg text-sm hover:bg-gray-50 hover:text-primary hover:border-primary transition-colors flex items-center justify-center gap-2"
                            >
                                <UserPlus size={16}/> Cliente no existe, crear nuevo
                            </button>
                        </div>
                    )}

                    {isCreatingClient && (
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3 animate-fadeIn">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-bold text-gray-700 text-sm">Nuevo Cliente</h4>
                                <button onClick={() => setIsCreatingClient(false)} className="text-xs text-red-500 hover:underline">Cancelar</button>
                            </div>
                            <input type="text" placeholder="Razón Social / Nombre *" className="w-full border rounded p-2 text-sm focus:border-primary outline-none" value={newClientData.name} onChange={e => setNewClientData({...newClientData, name: e.target.value})} />
                            <input type="text" placeholder="RUC / CI *" className="w-full border rounded p-2 text-sm focus:border-primary outline-none" value={newClientData.ruc} onChange={e => setNewClientData({...newClientData, ruc: e.target.value})} />
                            <input type="text" placeholder="Dirección" className="w-full border rounded p-2 text-sm focus:border-primary outline-none" value={newClientData.address} onChange={e => setNewClientData({...newClientData, address: e.target.value})} />
                            <button onClick={handleCreateClient} className="w-full bg-gray-800 text-white py-2 rounded text-sm font-bold hover:bg-gray-900 transition-colors">Guardar Cliente</button>
                        </div>
                    )}

                    <button 
                        onClick={handleNextStep}
                        className={`w-full py-3.5 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2
                            ${(clientMode === 'named' && !selectedClient) 
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                                : 'bg-primary text-white hover:bg-green-600 active:scale-95'
                            }`}
                    >
                        Continuar al Pago <User size={20}/>
                    </button>
                </div>
            )}

            {/* PASO 2: PAGO */}
            {step === 2 && (
                <div className="p-6 space-y-6">
                    <div className="text-center mb-6">
                        <p className="text-gray-500 text-sm mb-1">Total a cobrar</p>
                        <h2 className="text-4xl font-black text-gray-800">₲ {total.toLocaleString()}</h2>
                        <div className="text-xs text-gray-400 mt-2 bg-gray-100 inline-block px-3 py-1 rounded-full">
                            Cliente: {selectedClient ? selectedClient.name : 'SIN NOMBRE'}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                        {[
                            {id: 'cash', label: 'Efectivo', icon: '💵'},
                            {id: 'qr', label: 'QR', icon: '📱'},
                            {id: 'card', label: 'Tarjeta', icon: '💳'},
                            {id: 'transfer', label: 'Transf.', icon: '🏦'}
                        ].map(m => (
                            <button 
                                key={m.id}
                                onClick={() => setPaymentMethod(m.id)}
                                className={`p-2 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${paymentMethod === m.id ? 'border-primary bg-green-50 text-primary' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                            >
                                <span className="text-xl">{m.icon}</span>
                                <span className="text-[10px] font-bold uppercase">{m.label}</span>
                            </button>
                        ))}
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Monto Recibido</label>
                        <div className="relative">
                            <span className={`absolute left-4 top-3.5 font-bold ${paymentMethod === 'cash' ? 'text-gray-400' : 'text-gray-300'}`}>₲</span>
                            <input 
                                type="number" 
                                autoFocus={paymentMethod === 'cash'}
                                disabled={paymentMethod !== 'cash'}
                                value={amountPaid}
                                onChange={(e) => setAmountPaid(e.target.value)}
                                className={`w-full pl-10 pr-4 py-3 border-2 rounded-xl text-xl font-bold outline-none transition-colors
                                    ${paymentMethod === 'cash' 
                                        ? (isInsufficient ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-800 focus:border-primary') 
                                        : 'bg-gray-100 border-gray-100 text-gray-400 cursor-not-allowed'}`}
                                placeholder={total.toString()}
                            />
                        </div>
                        
                        {/* MENSAJE DE ERROR SI ES INSUFICIENTE */}
                        {isInsufficient && (
                            <p className="text-xs text-red-500 font-bold mt-2 flex items-center gap-1 animate-pulse">
                                <AlertTriangle size={14}/> Monto insuficiente. Faltan ₲ {(total - numericReceived).toLocaleString()}
                            </p>
                        )}

                        {paymentMethod !== 'cash' && (
                            <p className="text-[10px] text-blue-500 mt-1 font-bold text-center">* Monto automático para pagos electrónicos</p>
                        )}
                    </div>

                    {paymentMethod === 'cash' && !isInsufficient && (
                        <div className="mt-3 p-4 bg-gray-900 rounded-xl flex justify-between items-center text-white shadow-lg animate-fadeIn">
                            <span className="font-bold text-sm uppercase opacity-80">Su Vuelto:</span>
                            <span className="text-2xl font-mono font-bold text-green-400">
                                ₲ {calculatedChange.toLocaleString()}
                            </span>
                        </div>
                    )}

                    <button 
                        onClick={handleConfirmSale}
                        disabled={isInsufficient} // 2. BLOQUEO VISUAL
                        className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2
                            ${isInsufficient 
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                : 'bg-primary text-white shadow-lg shadow-green-200 hover:bg-green-600 active:scale-95'}`}
                    >
                        {isInsufficient ? 'Monto Insuficiente' : 'CONFIRMAR VENTA'}
                    </button>
                    
                    <button onClick={() => setStep(1)} className="w-full text-gray-400 text-sm py-2">Volver a datos de cliente</button>
                </div>
            )}

            {/* PASO 3: CONFIRMACIÓN Y TICKET */}
            {step === 3 && ticketData && (
                <div className="bg-gray-100 flex flex-col h-full">
                    
                    {/* VISUALIZACIÓN DEL TICKET */}
                    <div className="flex-1 overflow-y-auto p-4 flex justify-center">
                        <div className="bg-white shadow-xl w-full max-w-[320px] mx-auto">
                            <TicketInvoice 
                                cart={ticketData.items} 
                                total={ticketData.total}
                                amountPaid={ticketData.amountReceived}
                                change={ticketData.change}
                                paymentMethod={ticketData.paymentMethod}
                                ticketId={ticketData.ticketId}
                                date={ticketData.date}
                                client={ticketData.client} 
                                cashierName={ticketData.cashier}
                                copyLabel="ORIGINAL: CLIENTE"
                            />
                        </div>
                    </div>

                    {/* ÁREA DE IMPRESIÓN OCULTA */}
                    <div id="printable-ticket" className="hidden print:block">
                        <TicketInvoice 
                            cart={ticketData.items} 
                            total={ticketData.total} 
                            amountPaid={ticketData.amountReceived} 
                            change={ticketData.change} 
                            paymentMethod={ticketData.paymentMethod} 
                            ticketId={ticketData.ticketId} 
                            date={ticketData.date} 
                            client={ticketData.client}
                            cashierName={ticketData.cashier}
                        />
                    </div>

                    {/* BOTONES FINALES */}
                    <div className="p-4 bg-white border-t border-gray-200 flex gap-3 shadow-up">
                        <button 
                            onClick={() => window.print()} 
                            className="flex-1 bg-gray-900 hover:bg-black text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                            <Printer size={20} /> IMPRIMIR
                        </button>
                        <button 
                            onClick={onFinalize} 
                            className="px-6 py-3 bg-green-100 text-green-700 hover:bg-green-200 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                        >
                            <Check size={20} /> NUEVA VENTA
                        </button>
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
}