import React, { useState, useEffect } from 'react';
import { X, Check, Search, UserPlus, User, Mail, Printer, AlertTriangle, MapPin, Hash, Phone } from 'lucide-react';
import { collection, getDocs, addDoc, query, where } from 'firebase/firestore'; 
import { db } from '../../firebase/config';
import TicketInvoice from './TicketInvoice';

export default function PaymentModal({ total, cart, onClose, onProcessPayment, onFinalize }) {
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [step, setStep] = useState(1); 
  const [ticketData, setTicketData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // ESTADOS CLIENTE
  const [clientMode, setClientMode] = useState('final'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [foundClients, setFoundClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  
  const [newClientData, setNewClientData] = useState({ name: '', ruc: '', address: '', email: '', phone: '', dv: '' });

  // VALORES NUMÉRICOS
  const numericReceived = parseFloat(amountPaid) || 0;
  const isValidPayment = paymentMethod === 'cash' ? (amountPaid === '' || numericReceived >= total) : true;
  const changeAmount = paymentMethod === 'cash' && numericReceived > total ? numericReceived - total : 0;

  // BUSCAR CLIENTES
  useEffect(() => {
    const searchClients = async () => {
        if (searchTerm.length < 2) {
            setFoundClients([]);
            return;
        }
        try {
            const q = query(collection(db, "clients")); 
            const snap = await getDocs(q);
            const clients = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
            
            const filtered = clients.filter(c => 
                c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                c.ruc.includes(searchTerm)
            );
            setFoundClients(filtered.slice(0, 5));
        } catch (error) { console.error(error); }
    };
    const timer = setTimeout(() => { if(clientMode === 'search') searchClients(); }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, clientMode]);

  // GUARDAR NUEVO CLIENTE
  const handleSaveNewClient = async () => {
      if(!newClientData.name || !newClientData.ruc) return alert("Nombre y RUC obligatorios");
      setLoading(true);
      try {
          // Si completó el guión (dígito verificador), concatenamos "ruc-dv"
          const finalRuc = newClientData.dv 
              ? `${newClientData.ruc.trim()}-${newClientData.dv}`
              : newClientData.ruc.trim();

          const clientToSave = {
              name: newClientData.name.trim(),
              ruc: finalRuc,
              address: newClientData.address.trim(),
              email: newClientData.email.trim(),
              phone: newClientData.phone.trim()
          };

          const docRef = await addDoc(collection(db, "clients"), clientToSave);
          const newClient = { id: docRef.id, ...clientToSave };
          setSelectedClient(newClient);
          setClientMode('search'); 
          setIsCreatingClient(false);
      } catch (error) { console.error(error); alert("Error al guardar cliente"); } 
      finally { setLoading(false); }
  };

  // PROCESAR VENTA
  const handleConfirmPayment = async () => {
      setLoading(true);
      const finalClient = clientMode === 'final' ? { name: 'CONSUMIDOR FINAL', ruc: 'X', address: '' } : selectedClient;
      
      const paymentDetails = {
          method: paymentMethod,
          amountPaid: paymentMethod === 'cash' ? (amountPaid || total) : total,
          change: changeAmount,
          client: finalClient || { name: 'CONSUMIDOR FINAL', ruc: 'X' }
      };

      const result = await onProcessPayment(paymentDetails);
      if (result && result.success) {
          setTicketData(result);
          setStep(2); 
      } else {
          alert("Error al procesar la venta");
      }
      setLoading(false);
  };

  // ── Impresión independiente por copia ────────────────────────────────────
  // Abre una ventana nueva con el HTML del ticket ya renderizado + Tailwind CDN
  // y dispara window.print() — cada ventana = un trabajo de impresión = un corte Epson
  const printTicket = (footerLabel) => {
    const ticketEl = document.getElementById('ticket-data');
    if (!ticketEl) return;

    const win = window.open('', '_blank', 'width=350,height=650,toolbar=no,menubar=no,scrollbars=no');
    if (!win) { alert('El navegador bloqueó la ventana emergente. Habilitá los pop-ups para este sitio.'); return; }

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Courier New',monospace; width:80mm; background:white; }
    @page { size:80mm auto; margin:0; }
    .footer-label {
      text-align:center; font-weight:900; font-size:12px;
      text-transform:uppercase; letter-spacing:2px;
      border-top:1px dashed #555; padding-top:6px;
      margin:8px 8px 10px; font-family:'Courier New',monospace;
    }
  </style>
</head>
<body>
  ${ticketEl.innerHTML}
  <div class="footer-label">${footerLabel}</div>
</body>
</html>`);
    win.document.close();

    // Tailwind CDN necesita ~1s para procesar las clases antes de imprimir
    setTimeout(() => {
      win.focus();
      win.print();
      setTimeout(() => win.close(), 500);
    }, 1000);
  };

  return (
    <>
      {/* --- DATOS DEL TICKET para impresión (oculto en pantalla) --- */}
      {step === 2 && ticketData && (
        <div id="ticket-data" style={{position:'absolute',left:'-9999px',top:0,width:'80mm',background:'white'}}>
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
                subTotal={ticketData.subTotal} 
                discountTotal={ticketData.discountTotal}
                appliedDiscounts={ticketData.appliedDiscounts}
                copyLabel="__HIDE_FOOTER__"
            />
        </div>
      )}

      {/* --- MODAL VISIBLE --- */}
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
          
          {/* COLUMNA IZQUIERDA: RESUMEN */}
          <div className="w-full md:w-1/3 bg-gray-50 border-r border-gray-200 p-5 flex flex-col overflow-y-auto">
              <h2 className="text-lg font-black text-gray-800 mb-4">Confirmar Pago</h2>
              
              <div className="mb-6">
                  <p className="text-gray-500 text-xs font-bold uppercase mb-1">Total a cobrar</p>
                  <p className="text-3xl font-black text-green-600">₲ {total.toLocaleString()}</p>
              </div>

              <div className="space-y-2 flex-1">
                  <p className="text-gray-500 text-[10px] font-bold uppercase">Método de Pago</p>
                  {[
                      { id: 'cash', label: 'Efectivo', icon: '💵' },
                      { id: 'qr', label: 'QR Simple', icon: '📱' },
                      { id: 'card', label: 'Tarjeta', icon: '💳' },
                      { id: 'transfer', label: 'Transf.', icon: '🏦' }
                  ].map((m) => (
                      <button
                          key={m.id}
                          onClick={() => setPaymentMethod(m.id)}
                          className={`w-full p-3 rounded-xl flex items-center gap-3 font-bold transition-all border
                              ${paymentMethod === m.id 
                                  ? 'border-green-500 bg-green-50 text-green-700 shadow-sm' 
                                  : 'border-transparent bg-white text-gray-500 hover:bg-gray-100'}`}
                      >
                          <span className="text-lg">{m.icon}</span> <span className="text-sm">{m.label}</span>
                      </button>
                  ))}
              </div>

              <button onClick={onClose} className="mt-4 text-gray-400 hover:text-gray-600 text-xs font-bold py-2">Cancelar Operación</button>
          </div>

          {/* COLUMNA DERECHA: DETALLES Y CLIENTE */}
          <div className="w-full md:w-2/3 bg-white flex flex-col min-h-0">
              
              {step === 1 ? (
                  <div className="flex flex-col h-full">
                      {/* CONTENIDO SCROLLEABLE */}
                      <div className="flex-1 overflow-y-auto p-6">
                          
                          {/* SELECCIÓN DE CLIENTE */}
                          <div className="mb-6">
                              <div className="flex justify-between items-center mb-3">
                                  <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm">
                                      <User size={18} className="text-green-600"/> Datos de Facturación
                                  </h3>
                                  <div className="flex bg-gray-100 p-1 rounded-lg">
                                      <button 
                                          onClick={() => { setClientMode('final'); setSelectedClient(null); setIsCreatingClient(false); }}
                                          className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${clientMode === 'final' ? 'bg-white shadow text-green-700' : 'text-gray-500'}`}
                                      >
                                          Ticket
                                      </button>
                                      <button 
                                          onClick={() => setClientMode('search')}
                                          className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${clientMode === 'search' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
                                      >
                                          Factura
                                      </button>
                                  </div>
                              </div>

                              {/* MODO: CONSUMIDOR FINAL */}
                              {clientMode === 'final' && (
                                  <div className="p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center text-gray-500 text-xs font-medium">
                                      Se emitirá ticket a: <span className="font-bold text-gray-700">CONSUMIDOR FINAL</span>
                                  </div>
                              )}

                              {/* MODO: BUSCAR */}
                              {clientMode === 'search' && !isCreatingClient && !selectedClient && (
                                  <div className="space-y-2">
                                      <div className="flex gap-2">
                                          <div className="relative flex-1">
                                              <Search className="absolute left-3 top-2.5 text-gray-400" size={16}/>
                                              <input 
                                                  type="text" 
                                                  placeholder="Buscar Cliente..." 
                                                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                                                  value={searchTerm}
                                                  onChange={(e) => setSearchTerm(e.target.value)}
                                                  autoFocus
                                              />
                                          </div>
                                          <button
                                              type="button"
                                              onClick={() => {
                                                  setNewClientData({ name: '', ruc: '', address: '', email: '', phone: '', dv: '' });
                                                  setIsCreatingClient(true);
                                              }}
                                              title="Agregar Cliente"
                                              className="p-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors flex items-center justify-center shrink-0 shadow-sm"
                                          >
                                              <UserPlus size={18} />
                                          </button>
                                      </div>
                                      
                                      {searchTerm.length > 1 && foundClients.length === 0 ? (
                                          <button 
                                              onClick={() => setIsCreatingClient(true)}
                                              className="w-full py-3 border-2 border-dashed border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 font-bold flex items-center justify-center gap-2 text-xs"
                                          >
                                              <UserPlus size={16}/> Registrar Nuevo Cliente
                                          </button>
                                      ) : (
                                          <div className="space-y-1">
                                              {foundClients.map(client => (
                                                  <div 
                                                      key={client.id} 
                                                      onClick={() => setSelectedClient(client)}
                                                      className="p-2 hover:bg-blue-50 border border-transparent hover:border-blue-100 rounded-lg cursor-pointer flex justify-between items-center text-sm"
                                                  >
                                                      <div>
                                                          <p className="font-bold text-gray-800">{client.name}</p>
                                                          <p className="text-[10px] text-gray-500">RUC: {client.ruc}</p>
                                                      </div>
                                                      <Check size={14} className="text-blue-600"/>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              )}

                              {/* MODO: CREAR CLIENTE */}
                              {isCreatingClient && (
                                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 animate-fadeIn">
                                      <div className="flex justify-between items-center mb-3">
                                          <h4 className="font-bold text-gray-700 text-sm">Nuevo Cliente</h4>
                                          <button onClick={() => setIsCreatingClient(false)}><X size={16} className="text-gray-400"/></button>
                                      </div>
                                      <div className="space-y-2">
                                          <div className="relative">
                                              <User className="absolute left-3 top-2.5 text-gray-400" size={14}/>
                                              <input 
                                                  type="text" placeholder="Razón Social / Nombre" 
                                                  className="w-full pl-9 p-2 rounded border text-sm"
                                                  value={newClientData.name} onChange={e => setNewClientData({...newClientData, name: e.target.value})}
                                              />
                                          </div>
                                          <div className="grid grid-cols-2 gap-2">
                                              <div className="flex gap-1">
                                                  <div className="relative flex-1">
                                                      <Hash className="absolute left-2.5 top-2.5 text-gray-400" size={14}/>
                                                      <input 
                                                          type="text" placeholder="RUC / CI" 
                                                          className="w-full pl-8 p-2 rounded border text-sm"
                                                          value={newClientData.ruc} onChange={e => setNewClientData({...newClientData, ruc: e.target.value})}
                                                      />
                                                  </div>
                                                  <div className="w-16 shrink-0">
                                                      <input 
                                                          type="text" placeholder="Guión" 
                                                          maxLength={1}
                                                          className="w-full p-2 rounded border text-sm text-center font-bold focus:border-blue-500 focus:outline-none"
                                                          value={newClientData.dv || ''} 
                                                          onChange={e => {
                                                              const val = e.target.value;
                                                              if (val === '' || /^[0-9]$/.test(val)) {
                                                                  setNewClientData({...newClientData, dv: val});
                                                              }
                                                          }}
                                                      />
                                                  </div>
                                              </div>
                                              <div className="relative">
                                                  <MapPin className="absolute left-3 top-2.5 text-gray-400" size={14}/>
                                                  <input 
                                                      type="text" placeholder="Dirección" 
                                                      className="w-full pl-9 p-2 rounded border text-sm"
                                                      value={newClientData.address} onChange={e => setNewClientData({...newClientData, address: e.target.value})}
                                                  />
                                              </div>
                                          </div>
                                          <div className="relative">
                                              <Mail className="absolute left-3 top-2.5 text-gray-400" size={14}/>
                                              <input 
                                                  type="email" placeholder="Correo Electrónico (Opcional)" 
                                                  className="w-full pl-9 p-2 rounded border text-sm"
                                                  value={newClientData.email} onChange={e => setNewClientData({...newClientData, email: e.target.value})}
                                              />
                                          </div>
                                          <div className="relative">
                                              <Phone className="absolute left-3 top-2.5 text-gray-400" size={14}/>
                                              <input 
                                                  type="tel" placeholder="Número Celular (Opcional)" 
                                                  className="w-full pl-9 p-2 rounded border text-sm"
                                                  value={newClientData.phone || ''} onChange={e => setNewClientData({...newClientData, phone: e.target.value})}
                                              />
                                          </div>
                                          <button onClick={handleSaveNewClient} className="w-full bg-blue-600 text-white font-bold py-2 rounded text-xs hover:bg-blue-700">Guardar</button>
                                      </div>
                                  </div>
                              )}

                              {/* CLIENTE SELECCIONADO */}
                              {selectedClient && (
                                  <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                      <div>
                                          <p className="font-bold text-blue-900 text-sm">{selectedClient.name}</p>
                                          <p className="text-xs text-blue-700">RUC: {selectedClient.ruc}</p>
                                      </div>
                                      <button onClick={() => setSelectedClient(null)} className="p-1 bg-white rounded-full text-gray-400 hover:text-red-500 shadow-sm"><X size={14}/></button>
                                  </div>
                              )}
                          </div>

                          <hr className="border-gray-100 mb-6"/>

                          {/* INPUT PAGO EFECTIVO */}
                          {paymentMethod === 'cash' && (
                              <div>
                                  <label className="block text-gray-500 font-bold text-[10px] uppercase mb-1">Monto Recibido</label>
                                  <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">₲</span>
                                      <input 
                                          type="number" 
                                          autoFocus
                                          placeholder={total.toLocaleString()} 
                                          value={amountPaid}
                                          onChange={(e) => setAmountPaid(e.target.value)}
                                          className={`w-full pl-8 pr-4 py-3 text-2xl font-black text-gray-800 bg-gray-50 border-2 rounded-xl outline-none transition-colors ${!isValidPayment ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-green-500 focus:bg-white'}`}
                                      />
                                  </div>
                                  
                                  {!isValidPayment && (
                                      <p className="text-red-500 text-xs font-bold mt-1 flex items-center gap-1"><AlertTriangle size={12}/> Monto insuficiente</p>
                                  )}

                                  {numericReceived > total && (
                                      <div className="mt-3 p-3 bg-green-100 rounded-lg flex justify-between items-center animate-fadeIn">
                                          <span className="text-green-700 font-bold text-xs">VUELTO:</span>
                                          <span className="text-xl font-black text-green-800">₲ {changeAmount.toLocaleString()}</span>
                                      </div>
                                  )}
                              </div>
                          )}
                      </div>

                      {/* BOTÓN FINAL */}
                      <div className="p-4 border-t border-gray-100 bg-white">
                          <button 
                              onClick={handleConfirmPayment}
                              disabled={!isValidPayment || loading || isCreatingClient}
                              className="w-full bg-black hover:bg-gray-800 text-white font-bold py-4 rounded-xl text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex justify-center items-center gap-2"
                          >
                              {loading ? '...' : 'CONFIRMAR COBRO'} <Check strokeWidth={3} size={20}/>
                          </button>
                      </div>
                  </div>
              ) : (
                  /* PASO 2: TICKET GENERADO */
                  <div className="flex flex-col h-full bg-gray-100">
                      <div className="flex-1 overflow-y-auto p-6 flex justify-center items-start">
                          <div className="shadow-lg">
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
                                  subTotal={ticketData.subTotal}
                                  discountTotal={ticketData.discountTotal}
                                  appliedDiscounts={ticketData.appliedDiscounts}
                              />
                          </div>
                      </div>

                      <div className="p-4 bg-white border-t border-gray-200 flex gap-2 shadow-up">
                          <button 
                            onClick={() => printTicket('ORIGINAL — CLIENTE')} 
                            className="flex-1 bg-gray-900 hover:bg-black text-white py-3 rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs">
                              <Printer size={16} /> ORIG.
                          </button>
                          <button 
                            onClick={() => printTicket('COPIA — TICKET')} 
                            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs">
                              <Printer size={16} /> COPIA
                          </button>
                          <button onClick={() => onFinalize(ticketData?.items)} className="flex-1 bg-green-100 text-green-700 hover:bg-green-200 rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs whitespace-nowrap">
                              <Check size={16} /> NUEVA VENTA
                          </button>
                      </div>
                  </div>
              )}
          </div>
        </div>
      </div>
    </>
  );
}