import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { collection, getDocs, doc, updateDoc, addDoc, writeBatch, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { 
  Coins, Calendar, Search, FileSpreadsheet, Loader2, User, 
  XCircle, ChevronLeft, ChevronRight, Filter, ChevronsLeft, 
  ChevronsRight, Plus, CheckCircle, RefreshCcw, X, Info, ArrowLeft,
  UserPlus, UserCheck, ClipboardList, Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { todayStrPY } from '../../utils/dateUtils';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { sileo } from 'sileo';
import { formatGuaranies, parseGuaranies } from '../../utils/moneyUtils';

// --- UTILIDADES LOCALES DE FORMATO DE FECHA/HORA ---
const formatDatePY = (date) => {
  if (!date) return '-';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Asuncion'
  }).format(d);
};

const formatTime24 = (date) => {
  if (!date) return '-';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat('es-PY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Asuncion'
  }).format(d);
};

const getCurrentMonthStr = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export default function InvestmentsList() {
  const { userData } = useAuth();
  
  // --- ESTADOS ---
  const [investors, setInvestors] = useState([]);
  const [allInvestments, setAllInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState(null);
  
  // Modales
  const [showAddInvestorModal, setShowAddInvestorModal] = useState(false);
  const [showAddInvestmentModal, setShowAddInvestmentModal] = useState(false);
  
  // Navegación interna (Nivel 1: null = Lista de Inversores, Nivel 2: objeto = Detalle del Inversor)
  const [selectedInvestor, setSelectedInvestor] = useState(null);

  // Formulario nuevo inversor
  const [newInvestorName, setNewInvestorName] = useState('');
  
  // Formulario nueva inversión
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    reason: '',
    date: todayStrPY()
  });

  const handleAmountChange = (e) => {
    const rawVal = e.target.value;
    const formatted = formatGuaranies(rawVal);
    setFormData(prev => ({ ...prev, amount: formatted }));
  };

  // Filtros de tabla (Nivel 2)
  const [periodFilter, setPeriodFilter] = useState('all'); // 'all', 'current-month', 'last-month', 'month-year', 'custom-range'
  const [selectedMonthYear, setSelectedMonthYear] = useState(getCurrentMonthStr());
  const [dateRange, setDateRange] = useState({
    start: todayStrPY(),
    end:   todayStrPY()
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Paginación (Nivel 2)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // --- CARGAR DATOS GENERALES ---
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Obtener inversores
      const invSnapshot = await getDocs(collection(db, "investors"));
      const invList = invSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // 2. Obtener inversiones (todas, para calcular balances históricos en tarjetas)
      const snap = await getDocs(collection(db, "investments"));
      const investmentsList = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        dateObj: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date)
      }));

      setInvestors(invList);
      setAllInvestments(investmentsList);
    } catch (error) {
      console.error("Error al cargar datos:", error);
      sileo.error({ title: "Error al cargar la información." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- REGISTRAR NUEVO INVERSOR ---
  const handleAddInvestor = async (e) => {
    e.preventDefault();
    if (!newInvestorName.trim()) {
      return sileo.warning({ title: "El nombre no puede estar vacío." });
    }

    setFormLoading(true);
    try {
      await addDoc(collection(db, "investors"), {
        name: newInvestorName.trim(),
        createdAt: new Date(),
        createdBy: userData?.name || 'Administrador'
      });

      sileo.success({ title: "Inversor creado con éxito." });
      setNewInvestorName('');
      setShowAddInvestorModal(false);
      fetchData();
    } catch (error) {
      console.error("Error creando inversor:", error);
      sileo.error({ title: "No se pudo registrar al inversor." });
    } finally {
      setFormLoading(false);
    }
  };

  // --- REGISTRAR NUEVA INVERSION ---
  const handleAddInvestment = async (e) => {
    e.preventDefault();
    if (!formData.amount || !formData.reason.trim()) {
      return sileo.warning({ title: "Completa todos los campos obligatorios." });
    }

    setFormLoading(true);
    try {
      const now = new Date();
      const [year, month, day] = formData.date.split('-').map(Number);
      const investmentDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());

      await addDoc(collection(db, "investments"), {
        investorId: selectedInvestor.id,
        investorName: selectedInvestor.name,
        amount: parseGuaranies(formData.amount),
        reason: formData.reason.trim(),
        date: investmentDate,
        status: 'pending',
        user: userData?.name || 'Administrador',
        createdAt: new Date()
      });

      sileo.success({ title: "Inversión registrada correctamente." });
      setShowAddInvestmentModal(false);
      setFormData({
        amount: '',
        reason: '',
        date: todayStrPY()
      });
      fetchData();
    } catch (error) {
      console.error("Error registrando inversión:", error);
      sileo.error({ title: "Error al registrar la inversión." });
    } finally {
      setFormLoading(false);
    }
  };

  // --- MARCAR COMO REPUESTO (REPONER) ---
  const handleRepay = (id, amount) => {
    setConfirmModal({
      title: '¿Confirmar reposición de inversión?',
      description: `Monto: ₲ ${amount.toLocaleString()}. Se marcará como devuelta al inversor.`,
      confirmText: 'Sí, reponer',
      variant: 'success',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'investments', id), {
            status: 'repaid',
            repaidBy: userData?.name || 'Administrador',
            repaidAt: new Date()
          });
          sileo.success({ title: 'Inversión repuesta con éxito.' });
          fetchData();
        } catch (error) {
          console.error(error);
          sileo.error({ title: 'No se pudo registrar la reposición.' });
        }
      },
    });
  };

  // --- ANULAR REGISTRO ---
  const handleCancel = (id, amount) => {
    setConfirmModal({
      title: '¿Anular este registro de inversión?',
      description: `Monto: ₲ ${amount.toLocaleString()}. El registro quedará anulado permanentemente.`,
      confirmText: 'Sí, anular',
      variant: 'warning',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'investments', id), {
            status: 'canceled',
            canceledBy: userData?.name || 'Administrador',
            canceledAt: new Date()
          });
          sileo.success({ title: 'Inversión anulada con éxito.' });
          fetchData();
        } catch (error) {
          console.error(error);
          sileo.error({ title: 'No se pudo anular el registro.' });
        }
      },
    });
  };

  // --- ELIMINAR INVERSOR Y TODAS SUS INVERSIONES ---
  const handleDeleteInvestor = () => {
    if (!selectedInvestor) return;

    setConfirmModal({
      title: `¿Eliminar inversor "${selectedInvestor.name}"?`,
      description: `Esta acción borrará permanentemente al inversor y TODAS sus inversiones asociadas. Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar todo',
      variant: 'danger',
      onConfirm: async () => {
        setLoading(true);
        try {
          // 1. Obtener todas las inversiones asociadas a este inversor
          const q = query(
            collection(db, "investments"),
            where("investorId", "==", selectedInvestor.id)
          );
          const snap = await getDocs(q);

          // 2. Usar writeBatch para hacer el borrado atómico
          const batch = writeBatch(db);

          // Agregar borrado de cada inversión al batch
          snap.docs.forEach(docSnap => {
            batch.delete(docSnap.ref);
          });

          // Agregar borrado del inversor al batch
          batch.delete(doc(db, "investors", selectedInvestor.id));

          // Confirmar batch
          await batch.commit();

          sileo.success({ title: "Inversor y sus inversiones eliminados correctamente." });
          setSelectedInvestor(null);
          fetchData();
        } catch (error) {
          console.error("Error al eliminar inversor:", error);
          sileo.error({ title: "Error al intentar eliminar el inversor." });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // --- EXPORTAR EXCEL ---
  const handleExportExcel = () => {
    const dataToExport = filteredInvestments.map(item => ({
      'Fecha': formatDatePY(item.dateObj),
      'Hora': formatTime24(item.dateObj),
      'Descripción / Concepto': item.reason,
      'Monto': item.amount,
      'Estado': item.status === 'canceled' ? 'ANULADO' : item.status === 'repaid' ? 'REPUESTO' : 'PENDIENTE',
      'Registrado Por': item.user,
      'Repuesto Por': item.repaidBy || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inversiones");
    XLSX.writeFile(wb, `Inversiones_${selectedInvestor.name}_${dateRange.start}_al_${dateRange.end}.xlsx`);
  };

  // --- CALCULOS DE INVERSIONES POR INVERSOR ---
  const getInvestorStats = (investorId) => {
    const list = allInvestments.filter(item => item.investorId === investorId);

    const active = list
      .filter(e => e.status !== 'canceled')
      .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    const pending = list
      .filter(e => e.status === 'pending')
      .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    const repaid = list
      .filter(e => e.status === 'repaid')
      .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    return { active, pending, repaid, count: list.length };
  };



  // Filtrado de inversiones del inversor seleccionado (Nivel 2)
  const getFilteredInvestments = () => {
    if (!selectedInvestor) return [];
    
    // 1. Filtrar por inversor
    let list = allInvestments.filter(item => item.investorId === selectedInvestor.id);

    // 2. Filtrar por rango de fechas / periodo
    if (periodFilter !== 'all') {
      let startDate, endDate;

      if (periodFilter === 'current-month') {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (periodFilter === 'last-month') {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      } else if (periodFilter === 'month-year' && selectedMonthYear) {
        const [year, month] = selectedMonthYear.split('-').map(Number);
        startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
        endDate = new Date(year, month, 0, 23, 59, 59, 999);
      } else if (periodFilter === 'custom-range') {
        const [startYear, startMonth, startDay] = dateRange.start.split('-').map(Number);
        const [endYear, endMonth, endDay] = dateRange.end.split('-').map(Number);
        startDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
        endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
      }

      if (startDate && endDate) {
        list = list.filter(item => item.dateObj >= startDate && item.dateObj <= endDate);
      }
    }

    // 3. Filtrar por concepto/motivo (búsqueda de texto)
    if (searchTerm.trim()) {
      list = list.filter(item => item.reason.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    // 4. Filtrar por estado
    if (statusFilter !== 'all') {
      list = list.filter(item => item.status === statusFilter);
    }

    // Ordenar por fecha descendente
    list.sort((a, b) => b.dateObj - a.dateObj);

    return list;
  };

  const filteredInvestments = getFilteredInvestments();

  // Paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredInvestments.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredInvestments.length / itemsPerPage);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Totales en el detalle del inversor seleccionado
  const selectedStats = selectedInvestor ? getInvestorStats(selectedInvestor.id) : { active: 0, pending: 0, repaid: 0 };

  return (
    <div className="max-w-6xl mx-auto pb-20 pt-4 px-2">
      
      {/* Modal de confirmación */}
      {confirmModal && (
        <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
      )}

      {/* --- NIVEL 1: VISTA GENERAL (LISTA DE INVERSORES) --- */}
      {!selectedInvestor && (
        <div className="space-y-8 animate-fadeIn">
          
          {/* HEADER LISTA INVERSORES */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                <Coins className="text-emerald-500 animate-bounce-slow" size={32} /> Inversores del Negocio
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                Administra los fondos invertidos de forma personal e independiente de la caja diaria por cada socio.
              </p>
            </div>

            <button 
              onClick={() => setShowAddInvestorModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm md:text-base shrink-0 active:scale-95"
            >
              <UserPlus size={18} /> Registrar Inversor
            </button>
          </div>

          {/* GRID DE INVERSORES */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="animate-spin text-emerald-500" size={44}/>
              <p className="text-sm text-slate-400 font-medium">Cargando inversionistas...</p>
            </div>
          ) : investors.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-400 flex flex-col items-center gap-3">
              <User size={48} className="opacity-20 text-emerald-500"/>
              <p className="font-semibold text-lg text-slate-700">No hay inversores registrados</p>
              <p className="text-sm text-slate-400 max-w-sm">Registra a las personas que aportan capital al negocio para comenzar a gestionar sus inversiones.</p>
              <button 
                onClick={() => setShowAddInvestorModal(true)}
                className="mt-2 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 font-bold px-4 py-2 rounded-xl transition-all"
              >
                Crear Primer Inversor
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              


              {/* Tarjetas de Inversores */}
              {investors.map(inv => {
                const stats = getInvestorStats(inv.id);
                return (
                  <div 
                    key={inv.id}
                    onClick={() => {
                      setSelectedInvestor(inv);
                      setPeriodFilter('all'); // Mostrar todos por defecto
                      setSelectedMonthYear(getCurrentMonthStr());
                      setDateRange({ start: todayStrPY(), end: todayStrPY() });
                    }}
                    className="bg-white border border-slate-200 hover:border-emerald-400 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between h-48 relative overflow-hidden"
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-600 flex items-center justify-center shrink-0 transition-colors">
                          <User size={20} />
                        </div>
                        <div>
                          <h3 className="font-black text-slate-800 tracking-tight group-hover:text-emerald-600 transition-colors truncate max-w-[170px]" title={inv.name}>{inv.name}</h3>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Inversionista</p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1.5 text-xs text-slate-600 font-semibold">
                        <div className="flex justify-between">
                          <span>Pendiente Reponer:</span>
                          <span className="text-orange-600 font-black">₲ {stats.pending.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Repuesto:</span>
                          <span className="text-emerald-600 font-black">₲ {stats.repaid.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-100 pt-1">
                          <span>Total Invertido:</span>
                          <span className="text-slate-900 font-black">₲ {stats.active.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3 mt-3 flex justify-between items-center text-xs font-bold text-slate-400 group-hover:text-emerald-600 transition-colors">
                      <span>{stats.count} registros</span>
                      <span>Ver Detalles &rarr;</span>
                    </div>
                  </div>
                );
              })}

            </div>
          )}

        </div>
      )}

      {/* --- NIVEL 2: DETALLE DE INVERSIONES DEL INVERSOR --- */}
      {selectedInvestor && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* HEADER DETALLE */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-2 border-b border-slate-150">
            <div>
              <button 
                onClick={() => {
                  setSelectedInvestor(null);
                  fetchData();
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-600 transition-colors mb-2 cursor-pointer bg-slate-100 hover:bg-emerald-50 px-3 py-1.5 rounded-lg w-fit"
              >
                <ArrowLeft size={14} /> Volver a Inversores
              </button>
              
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {selectedInvestor.name}
                </h1>
                <button
                  onClick={handleDeleteInvestor}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer inline-flex items-center justify-center shrink-0 self-center active:scale-95"
                  title="Eliminar Inversor y todas sus inversiones"
                >
                  <Trash2 size={20} />
                </button>
              </div>
              <p className="text-slate-500 text-sm mt-1">Historial detallado de inversiones y gastos personales aportados por este inversor.</p>
            </div>

            <button 
              onClick={() => setShowAddInvestmentModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm md:text-base shrink-0 active:scale-95"
            >
              <Plus size={18} /> Registrar Inversión
            </button>
          </div>

          {/* TARJETAS RESUMEN DEL INVERSOR */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Total Invertido */}
            <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl shadow-sm border border-slate-800 flex items-center gap-4">
              <div className="p-3.5 bg-slate-800 rounded-xl text-emerald-400"><Coins size={24}/></div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Acumulado</p>
                <p className="text-2xl font-black mt-0.5">₲ {selectedStats.active.toLocaleString()}</p>
              </div>
            </div>

            {/* Pendiente Reposición */}
            <div className="bg-orange-50/50 border border-orange-100 p-5 rounded-2xl shadow-sm flex items-center gap-4">
              <div className="p-3.5 bg-orange-100/60 rounded-xl text-orange-600"><RefreshCcw size={24} className="animate-spin-slow"/></div>
              <div>
                <p className="text-xs font-bold text-orange-400 uppercase tracking-wider">Pendiente de Reposición</p>
                <p className="text-2xl font-black text-orange-700 mt-0.5">₲ {selectedStats.pending.toLocaleString()}</p>
              </div>
            </div>

            {/* Total Repuesto */}
            <div className="bg-emerald-50/50 border border-emerald-100 p-5 rounded-2xl shadow-sm flex items-center gap-4">
              <div className="p-3.5 bg-emerald-100/60 rounded-xl text-emerald-600"><CheckCircle size={24}/></div>
              <div>
                <p className="text-xs font-bold text-emerald-400/90 uppercase tracking-wider">Total Repuesto</p>
                <p className="text-2xl font-black text-emerald-700 mt-0.5">₲ {selectedStats.repaid.toLocaleString()}</p>
              </div>
            </div>

          </div>

          {/* BARRA FILTROS */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-4 items-center">
            
            {/* Filtro de Periodo */}
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-xs md:text-sm bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 font-bold cursor-pointer"
              >
                <option value="all">Ver Todos</option>
                <option value="current-month">Este Mes</option>
                <option value="last-month">Mes Anterior</option>
                <option value="month-year">Filtrar por Mes/Año</option>
                <option value="custom-range">Rango de Fechas</option>
              </select>

              {/* Input específico según tipo de filtro */}
              {periodFilter === 'month-year' && (
                <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 w-full sm:w-auto animate-fadeIn">
                  <Calendar size={18} className="text-slate-400"/>
                  <input 
                    type="month" 
                    value={selectedMonthYear} 
                    onChange={(e) => setSelectedMonthYear(e.target.value)} 
                    className="bg-transparent text-xs md:text-sm font-bold focus:outline-none text-slate-700 cursor-pointer"
                  />
                </div>
              )}

              {periodFilter === 'custom-range' && (
                <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 w-full sm:w-auto animate-fadeIn">
                  <Calendar size={18} className="text-slate-400"/>
                  <input type="date" value={dateRange.start} onChange={(e)=>setDateRange({...dateRange, start:e.target.value})} className="bg-transparent text-xs md:text-sm font-bold focus:outline-none text-slate-700 cursor-pointer"/>
                  <span className="text-slate-400 font-bold">-</span>
                  <input type="date" value={dateRange.end} onChange={(e)=>setDateRange({...dateRange, end:e.target.value})} className="bg-transparent text-xs md:text-sm font-bold focus:outline-none text-slate-700 cursor-pointer"/>
                </div>
              )}
            </div>

            {/* Motivo */}
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-3 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por motivo / descripción..." 
                value={searchTerm} 
                onChange={(e)=>setSearchTerm(e.target.value)} 
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs md:text-sm bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>

            {/* Estado */}
            <div className="w-full lg:w-36">
              <select
                value={statusFilter}
                onChange={(e)=>setStatusFilter(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs md:text-sm bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 font-bold cursor-pointer"
              >
                <option value="all">Todos</option>
                <option value="pending">Pendientes</option>
                <option value="repaid">Repuestos</option>
                <option value="canceled">Anulados</option>
              </select>
            </div>

            {/* Botón Excel */}
            <button 
              onClick={handleExportExcel}
              disabled={filteredInvestments.length === 0}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm w-full lg:w-auto justify-center active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet size={18}/> Excel
            </button>
          </div>

          {/* TABLA DE REGISTROS */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[300px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 gap-2">
                <Loader2 className="animate-spin text-emerald-500" size={40}/>
                <p className="text-sm text-slate-400 font-medium">Cargando...</p>
              </div>
            ) : filteredInvestments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                <Filter size={40} className="opacity-20"/>
                <p className="font-semibold text-sm">No se encontraron inversiones en este periodo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-900 border-b border-slate-800 text-xs font-bold text-slate-200 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4">Concepto / Descripción</th>
                      <th className="px-6 py-4 text-right">Monto</th>
                      <th className="px-6 py-4 text-center">Estado</th>
                      <th className="px-6 py-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {currentItems.map((item) => {
                      const isPending = item.status === 'pending';
                      const isRepaid = item.status === 'repaid';
                      const isCanceled = item.status === 'canceled';

                      return (
                        <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors ${isCanceled ? 'bg-slate-50 opacity-60' : ''}`}>
                          <td className="px-6 py-4 text-slate-600 whitespace-nowrap font-medium">
                            {formatDatePY(item.dateObj)}
                            <span className="text-xs text-slate-400 ml-2.5 font-bold bg-slate-100 px-2 py-0.5 rounded-md">
                              {formatTime24(item.dateObj)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-700 font-semibold max-w-[320px] truncate" title={item.reason}>
                            {item.reason}
                          </td>
                          <td className={`px-6 py-4 text-right font-black text-base whitespace-nowrap ${isCanceled ? 'text-slate-400 line-through' : isRepaid ? 'text-slate-600' : 'text-emerald-600'}`}>
                            ₲ {item.amount.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            {isPending && (
                              <span className="text-[10px] bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full border border-orange-200 font-bold uppercase tracking-wide">
                                Pendiente
                              </span>
                            )}
                            {isRepaid && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200 font-bold uppercase tracking-wide">
                                Repuesto
                              </span>
                            )}
                            {isCanceled && (
                              <span className="text-[10px] bg-red-100 text-red-700 px-2.5 py-1 rounded-full border border-red-200 font-bold uppercase tracking-wide">
                                Anulado
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              
                              {/* Botón reponer */}
                              {isPending && (
                                <button
                                  onClick={() => handleRepay(item.id, item.amount)}
                                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 p-2 rounded-lg transition-colors cursor-pointer"
                                  title="Marcar como Repuesto"
                                >
                                  <CheckCircle size={18}/>
                                </button>
                              )}

                              {/* Botón anular */}
                              {!isCanceled && (
                                <button 
                                  onClick={() => handleCancel(item.id, item.amount)}
                                  className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors cursor-pointer"
                                  title="Anular Registro"
                                >
                                  <XCircle size={18}/>
                                </button>
                              )}

                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* PAGINACIÓN */}
            {filteredInvestments.length > 0 && (
              <div className="border-t border-slate-100 bg-white px-5 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-3">
                <p className="text-xs text-slate-400 whitespace-nowrap font-medium">
                  Mostrando <span className="font-semibold text-slate-600">{indexOfFirstItem + 1}</span>–<span className="font-semibold text-slate-600">{Math.min(indexOfLastItem, filteredInvestments.length)}</span> de <span className="font-semibold text-slate-600">{filteredInvestments.length}</span> registros
                </p>
                
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="Primera página"
                  ><ChevronsLeft size={14} /></button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="Página anterior"
                  ><ChevronLeft size={14} /></button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1))
                    .reduce((acc, p, idx, arr) => {
                      if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === '...' ? (
                        <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-slate-400 text-sm">…</span>
                      ) : (
                        <button
                          type="button"
                          key={item}
                          onClick={() => setCurrentPage(item)}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-all border cursor-pointer ${
                            currentPage === item
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-100'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300'
                          }`}
                        >{item}</button>
                      )
                    )
                  }

                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="Página siguiente"
                  ><ChevronRight size={14} /></button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="Última página"
                  ><ChevronsRight size={14} /></button>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* --- MODAL REGISTRAR NUEVO INVERSOR --- */}
      {showAddInvestorModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
            
            <div className="px-6 py-4 bg-slate-900 flex justify-between items-center text-slate-100">
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                <UserPlus size={20} className="text-emerald-400" /> Registrar Inversor
              </h2>
              <button 
                onClick={() => setShowAddInvestorModal(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddInvestor} className="p-6 space-y-4">
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Nombre Completo *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Dueña, Socio A, etc."
                  value={newInvestorName}
                  onChange={e => setNewInvestorName(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-slate-50 focus:bg-white text-sm font-semibold transition-all text-slate-800"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddInvestorModal(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {formLoading ? <Loader2 className="animate-spin" size={16}/> : 'Crear Inversor'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* --- MODAL REGISTRAR NUEVA INVERSIÓN (ASOCIADO A INVERSOR) --- */}
      {showAddInvestmentModal && selectedInvestor && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
            
            <div className="px-6 py-4 bg-slate-900 flex justify-between items-center text-slate-100">
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                <Coins size={20} className="text-emerald-400" /> Registrar Inversión
              </h2>
              <button 
                onClick={() => setShowAddInvestmentModal(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddInvestment} className="p-6 space-y-4">
              
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-xs flex gap-2 font-medium leading-relaxed mb-1">
                <Info size={16} className="shrink-0 text-blue-600 mt-0.5"/>
                <div>
                  <p>Inversor: <span className="font-bold text-slate-900">{selectedInvestor.name}</span></p>
                  <p className="mt-0.5">La inversión se guardará en un registro independiente sin restar saldos de las cajas diarias.</p>
                </div>
              </div>

              {/* Monto */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Monto (Gs.) *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: 150.000"
                  value={formData.amount}
                  onChange={handleAmountChange}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-slate-50 focus:bg-white text-sm font-bold transition-all text-slate-800"
                />
              </div>

              {/* Fecha */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Fecha de la Inversión *</label>
                <input 
                  type="date" 
                  required
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-slate-50 focus:bg-white text-sm font-bold transition-all cursor-pointer text-slate-800"
                />
              </div>

              {/* Concepto / Descripción */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Concepto / Descripción *</label>
                <textarea 
                  required
                  rows={3}
                  placeholder="Escribe el motivo detallado de la inversión..."
                  value={formData.reason}
                  onChange={e => setFormData({...formData, reason: e.target.value})}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-slate-50 focus:bg-white text-sm font-semibold transition-all resize-none text-slate-800"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddInvestmentModal(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {formLoading ? <Loader2 className="animate-spin" size={16}/> : 'Registrar'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
