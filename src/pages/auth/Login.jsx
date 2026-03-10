import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
// CAMBIO 1: Importamos 'Beer' en lugar de 'Store'
import { Beer, Loader2, AlertCircle, ArrowRight, Lock, Mail, Check } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { loginManual } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if(!email || !password) return setError("Complete todos los campos");
    
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/'); 
      
    } catch (firebaseError) {
      console.log("No es admin de firebase, buscando en empleados...");
      
      try {
        const q = query(
            collection(db, "employees"), 
            where("email", "==", email),
            where("password", "==", password)
        );
        
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const empDoc = querySnapshot.docs[0];
            const employeeData = { id: empDoc.id, ...empDoc.data() };
            
            loginManual(employeeData);
            
            if (employeeData.role === 'admin') navigate('/');
            else navigate('/pos');
            
        } else {
            setError('Correo o contraseña incorrectos.');
        }
      } catch (dbError) {
        console.error(dbError);
        setError('Error al conectar con la base de datos.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen font-sans text-slate-900 bg-white">
        
        <style>{`
            .subtle-pattern { background-color: #22C55E; }
            .input-underline { position: relative; }
            .input-underline::after {
                content: '';
                position: absolute;
                bottom: -1px;
                left: 0;
                width: 0;
                height: 2px;
                background-color: #22C55E;
                transition: width 0.3s ease;
            }
            .input-underline:focus-within::after { width: 100%; }
        `}</style>

        {/* COLUMNA IZQUIERDA (DESKTOP) */}
        <div className="hidden lg:flex w-1/2 subtle-pattern relative overflow-hidden flex-col justify-center items-center p-12">
            <div className="relative z-10 text-center">
                <div className="mb-8 flex justify-center">
                    <div className="bg-white/20 backdrop-blur-md p-8 rounded-[2rem] shadow-2xl">
                        {/* CAMBIO 2: Ícono de Cerveza Grande */}
                        <Beer size={80} className="text-white" strokeWidth={1.5} />
                    </div>
                </div>
                <h1 className="text-7xl font-extrabold text-white tracking-tight leading-none drop-shadow-sm">
                    Bodega<br/>El Grifo
                </h1>
                <p className="text-green-100 text-lg mt-6 font-medium">Versión V1.6</p>
            </div>
            
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-green-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-green-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        </div>

        {/* COLUMNA DERECHA - FORMULARIO */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 md:p-24 bg-white relative">
            <div className="w-full max-w-md">
                
                {/* HEADER MÓVIL */}
                <div className="lg:hidden flex flex-col items-center mb-12">
                    <div className="bg-[#22C55E] p-4 rounded-2xl mb-4 shadow-lg shadow-green-200">
                        {/* CAMBIO 3: Ícono de Cerveza Pequeño */}
                        <Beer size={40} className="text-white" />
                    </div>
                    <h2 className="text-3xl font-bold text-slate-800">Bodega El Grifo</h2>
                </div>

                <div className="mb-10 text-center lg:text-left">
                    <h3 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-green-400">
                        Bienvenido
                    </h3>
                    <p className="text-slate-400 text-lg">Inicia sesión para continuar.</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-10">
                    
                    <div className="input-underline border-b border-slate-200 pb-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Email</label>
                        <div className="flex items-center">
                            <Mail className="text-slate-400 mr-3" size={20} />
                            <input 
                                type="email" 
                                className="w-full bg-transparent border-none p-0 text-lg placeholder-slate-300 focus:ring-0 text-slate-900 focus:outline-none"
                                placeholder="tu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="input-underline border-b border-slate-200 pb-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Contraseña</label>
                        <div className="flex items-center">
                            <Lock className="text-slate-400 mr-3" size={20} />
                            <input 
                                type="password" 
                                className="w-full bg-transparent border-none p-0 text-lg placeholder-slate-300 focus:ring-0 text-slate-900 font-mono focus:outline-none"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center">
                        <label className="flex items-center cursor-pointer group">
                            <div className="relative">
                                <input type="checkbox" className="peer sr-only" />
                                <div className="w-5 h-5 border-2 border-slate-300 rounded bg-white peer-checked:bg-[#22C55E] peer-checked:border-[#22C55E] transition-all"></div>
                                <Check size={12} className="absolute top-1 left-1 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
                            </div>
                            <span className="ml-2 text-sm text-slate-500 group-hover:text-slate-700 transition-colors">Recordarme</span>
                        </label>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-500 p-4 rounded-xl text-sm flex items-center gap-3 animate-pulse border border-red-100">
                            <AlertCircle size={20} /> {error}
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full py-4 bg-[#22C55E] hover:bg-green-600 active:scale-[0.99] transition-all text-white font-bold rounded-xl shadow-xl shadow-green-500/30 flex items-center justify-center gap-3 group tracking-wide text-lg disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="animate-spin"/> : 'INGRESAR'}
                        {!loading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
                    </button>

                </form>
            </div>
        </div>
    </div>
  );
}