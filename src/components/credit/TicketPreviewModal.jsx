import React from 'react';
import { X, Printer } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import TicketInvoice from '../../pages/pos/TicketInvoice';
import { printTicketService } from '../../utils/printUtils';

export default function TicketPreviewModal({ sale, onClose, copyLabel = 'COPIA: CONSULTA' }) {
  if (!sale) return null;

  const saleDate = sale.dateObj instanceof Date
    ? sale.dateObj
    : sale.date?.toDate
      ? sale.date.toDate()
      : new Date(sale.date || Date.now());

  const handlePrint = async () => {
    let storeData = {};
    try {
      const snap = await getDoc(doc(db, 'settings', 'general'));
      if (snap.exists()) storeData = snap.data();
    } catch (e) { /* usar defaults */ }

    const tData = {
      cart:             sale.items || [],
      total:            sale.total,
      amountPaid:       sale.amountReceived || sale.total,
      change:           sale.change || 0,
      paymentMethod:    sale.paymentMethod,
      ticketId:         sale.ticketId,
      date:             saleDate.toISOString?.() || saleDate,
      client:           sale.client,
      cashierName:      sale.userName,
      subTotal:         sale.subTotal,
      discountTotal:    sale.discountTotal,
      appliedDiscounts: sale.appliedDiscounts,
    };

    const printed = await printTicketService(tData, storeData);
    if (!printed) {
      const ticketEl = document.getElementById('printable-credit-ticket-content');
      if (!ticketEl) return;

      const win = window.open('', '_blank', 'width=350,height=650,toolbar=no,menubar=no,scrollbars=no');
      if (!win) {
        alert('Habilitá los pop-ups para este sitio.');
        return;
      }

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
  <div class="footer-label">${copyLabel}</div>
</body>
</html>`);
      win.document.close();
      setTimeout(() => {
        win.focus();
        win.print();
        setTimeout(() => win.close(), 500);
      }, 1000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-gray-800">Ticket #{sale.ticketId}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-200 p-4 flex justify-center">
          <div className="bg-white shadow-xl w-[300px]">
            <TicketInvoice
              cart={sale.items || []}
              total={sale.total}
              amountPaid={sale.amountReceived}
              change={sale.change}
              paymentMethod={sale.paymentMethod}
              ticketId={sale.ticketId}
              date={saleDate}
              client={sale.client}
              cashierName={sale.userName}
              copyLabel={copyLabel}
              subTotal={sale.subTotal}
              discountTotal={sale.discountTotal}
              appliedDiscounts={sale.appliedDiscounts}
              creditStatus={sale.creditStatus}
            />
          </div>
        </div>

        <div className="p-4 bg-white border-t flex gap-2">
          <button
            onClick={handlePrint}
            className="flex-1 bg-black text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors"
          >
            <Printer size={18} /> IMPRIMIR
          </button>
        </div>
      </div>

      {/* Área de impresión oculta */}
      <div
        id="printable-credit-ticket-content"
        style={{ position: 'fixed', left: '-9999px', top: 0, width: '80mm', background: 'white' }}
      >
        <TicketInvoice
          cart={sale.items || []}
          total={sale.total}
          amountPaid={sale.amountReceived}
          change={sale.change}
          paymentMethod={sale.paymentMethod}
          ticketId={sale.ticketId}
          date={saleDate}
          client={sale.client}
          cashierName={sale.userName}
          subTotal={sale.subTotal}
          discountTotal={sale.discountTotal}
          appliedDiscounts={sale.appliedDiscounts}
          creditStatus={sale.creditStatus}
          copyLabel="__HIDE_FOOTER__"
        />
      </div>
    </div>
  );
}

