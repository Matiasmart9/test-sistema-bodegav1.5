import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, UserCheck, AlertCircle, Eye, EyeOff, ShieldOff } from 'lucide-react';
import { collection, query, where, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../firebase/config';

const MAX_ATTEMPTS = 3;

export default function PosLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!password) { setError('Ingrese su contraseña'); return; }

    setLoading(true);
    setError('');

    try {
      const snap = await getDocs(
        query(collection(db, 'employees'), where('password', '==', password))
      );

      if (!snap.empty) {
        const empDoc = snap.docs[0];
        const employeeData = { id: empDoc.id, ...empDoc.data() };

        // ── Verificar bloqueo ─────────────────────────────────────────
        if (employeeData.isBlocked) {
          setError('Cuenta bloqueada. Contactá al administrador.');
          setPassword('');
          setLoading(false);
          return;
        }

        // ── Login exitoso: resetear intentos ──────────────────────────
        await updateDoc(doc(db, 'employees', empDoc.id), {
          loginAttempts: 0,
          isBlocked: false,
          lastLogin: new Date(),
        });

        localStorage.setItem('pos_user', JSON.stringify(employeeData));
        navigate('/pos');

      } else {
        // Contraseña incorrecta — intentar incrementar en la sesión local previa
        const localUser = JSON.parse(localStorage.getItem('pos_user') || 'null');
        if (localUser?.id) {
          try {
            const localSnap = await getDocs(
              query(collection(db, 'employees'), where('__name__', '==', localUser.id))
            );
            if (!localSnap.empty) {
              const current = localSnap.docs[0].data();
              const newAttempts = (current.loginAttempts || 0) + 1;
              const shouldBlock = newAttempts >= MAX_ATTEMPTS;
              await updateDoc(doc(db, 'employees', localUser.id), {
                loginAttempts: increment(1),
                ...(shouldBlock ? { isBlocked: true } : {}),
              });
              if (shouldBlock) {
                setError(`Cuenta bloqueada por ${MAX_ATTEMPTS} intentos. Contactá al administrador.`);
                localStorage.removeItem('pos_user');
                setPassword('');
                setLoading(false);
                return;
              }
              setError(`Contraseña incorrecta. Intentos restantes: ${MAX_ATTEMPTS - newAttempts}`);
            } else {
              setError('Contraseña incorrecta.');
            }
          } catch (_) {
            setError('Contraseña incorrecta.');
          }
        } else {
          setError('Contraseña incorrecta.');
        }
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
          <h1 className="text-2xl font-bold">Punto de Venta V2.0</h1>
          <p className="opacity-80 mt-1 text-sm">Acceso Seguro</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleLogin}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña de Empleado
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-primary focus:outline-none transition-colors text-lg"
                  placeholder="Ingrese su clave..."
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div className={`mb-4 p-3 rounded-xl text-sm flex items-start gap-2 border
                ${error.includes('bloqueada') || error.includes('bloqueado')
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                {error.includes('bloqueada') || error.includes('bloqueado')
                  ? <ShieldOff size={18} className="shrink-0 mt-0.5" />
                  : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary hover:bg-green-600 text-white font-bold rounded-xl
                         shadow-lg shadow-green-500/20 flex items-center justify-center gap-2
                         transition-all active:scale-95 disabled:opacity-70"
            >
              {loading
                ? <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-5 h-5" />
                : <><UserCheck size={20} /> INGRESAR</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}