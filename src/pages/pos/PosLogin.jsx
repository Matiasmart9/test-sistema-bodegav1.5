import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, UserCheck, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from '../../firebase/config';

export default function PosLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    
    if (!password) {
        setError('Ingrese su contraseña');
        return;
    }

    setLoading(true);
    setError('');

    try {
      // Buscamos por campo 'password'
      // NOTA: Si tienes usuarios viejos solo con PIN, podrías necesitar una migración o buscar por ambos campos.
      // Aquí asumimos que ya usas 'password'.
      const q = query(collection(db, "employees"), where("password", "==", password));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const employeeDoc = querySnapshot.docs[0];
        const employeeData = { id: employeeDoc.id, ...employeeDoc.data() };
        
        localStorage.setItem('pos_user', JSON.stringify(employeeData));
        navigate('/pos/terminal'); 
      } else {
        setError('Contraseña incorrecta.');
        setPassword('');
      }
    } catch (e) {
      console.error(e);
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden">
        
        <div className="bg-primary p-8 text-center text-white">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                <Lock size={32} />
            </div>
            <h1 className="text-2xl font-bold">Punto de Venta</h1>
            <p className="text-primary-100 mt-1">Acceso Seguro</p>
        </div>

        <div className="p-8">
            <form onSubmit={handleLogin}>
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Contraseña de Empleado
                    </label>
                    
                    <div className="relative">
                        <input 
                            type={showPassword ? "text" : "password"}
                            autoFocus
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setError('');
                            }}
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-primary focus:outline-none transition-colors text-lg"
                            placeholder="Ingrese su clave..."
                        />
                        <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                        >
                            {showPassword ? <EyeOff size={20}/> : <Eye size={20}/>}
                        </button>
                    </div>
                </div>

                <div className="h-6 mb-6 text-center">
                    {error && (
                        <p className="text-red-500 text-sm font-medium flex items-center justify-center gap-2 animate-shake">
                            <AlertCircle size={16}/> {error}
                        </p>
                    )}
                    {loading && (
                        <p className="text-primary text-sm font-medium flex items-center justify-center gap-2">
                            <UserCheck size={16} className="animate-bounce"/> Verificando...
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={loading || !password}
                    className="w-full bg-primary hover:bg-green-600 text-white font-bold py-3 rounded-lg shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                    INGRESAR <ArrowRight size={20} />
                </button>
            </form>

            <div className="mt-6 text-center">
                <button 
                    onClick={() => navigate('/')}
                    className="text-gray-400 text-sm hover:text-gray-600 underline"
                >
                    Volver al Dashboard
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}