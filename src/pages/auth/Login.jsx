import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { Store, Loader2, AlertCircle, ArrowRight, Lock, User } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { loginManual } = useAuth(); // Usamos la función nueva del contexto
  
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
      // 1. INTENTAR LOGIN COMO ADMINISTRADOR (FIREBASE AUTH)
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/'); // El AuthContext detectará el cambio y redirigirá
      
    } catch (firebaseError) {
      console.log("No es admin de firebase, buscando en empleados...");
      
      // 2. SI FALLA, BUSCAR EN COLECCIÓN DE EMPLEADOS (FIRESTORE)
      try {
        const q = query(
            collection(db, "employees"), 
            where("email", "==", email),
            where("password", "==", password) // Buscamos coincidencia exacta
        );
        
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // ¡ENCONTRADO!
            const empDoc = querySnapshot.docs[0];
            const employeeData = { id: empDoc.id, ...empDoc.data() };
            
            // Activamos la sesión manual
            loginManual(employeeData);
            
            // Redirigir según rol
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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden">
        
        {/* HEADER */}
        <div className="bg-white p-8 pb-0 text-center">
            <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-green-600 shadow-sm">
                <Store size={32} />
            </div>
            <h1 className="text-2xl font-black text-gray-800 tracking-tight">Bodega El Grifo</h1>
            <p className="text-gray-400 text-sm mt-1">Inicia sesión para continuar</p>
        </div>

        {/* FORM */}
        <div className="p-8">
            <form onSubmit={handleLogin} className="space-y-5">
                
                {/* EMAIL */}
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Email</label>
                    <div className="relative">
                        <User className="absolute left-3 top-3.5 text-gray-400" size={18}/>
                        <input 
                            type="email" 
                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all text-gray-700 bg-gray-50 focus:bg-white"
                            placeholder="juan@gmail.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                </div>

                {/* PASS */}
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Contraseña</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3.5 text-gray-400" size={18}/>
                        <input 
                            type="password" 
                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-50 transition-all text-gray-700 bg-gray-50 focus:bg-white font-mono" // font-mono para ver mejor los puntos
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                </div>

                {/* ERROR */}
                {error && (
                    <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm flex items-center gap-2 animate-shake border border-red-100">
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-green-200 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {loading ? <Loader2 className="animate-spin"/> : 'INGRESAR'}
                    {!loading && <ArrowRight size={18} strokeWidth={3} />}
                </button>

            </form>
        </div>
      </div>
    </div>
  );
}