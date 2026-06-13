import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { sileo } from 'sileo';
import { Beer, Loader2, AlertCircle, ArrowRight, Lock, Mail, Check, ShieldOff } from 'lucide-react';

const MAX_ATTEMPTS = 3;

export default function Login() {
  const navigate = useNavigate();
  const { loginManual } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return setError("Complete todos los campos");

    setError('');
    setLoading(true);

    try {
      // 1. Intentar login de admin con Firebase Auth
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');

    } catch (firebaseError) {
      // 2. Buscar en empleados
      try {
        const q = query(
          collection(db, "employees"),
          where("email", "==", email),
        );

        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const empDoc = querySnapshot.docs[0];
          const employeeData = { id: empDoc.id, ...empDoc.data() };

          // ── Verificar si está bloqueado ───────────────────────────
          if (employeeData.isBlocked) {
            setError('Cuenta bloqueada por múltiples intentos fallidos. Contactá al administrador.');
            setLoading(false);
            return;
          }

          // ── Verificar contraseña ──────────────────────────────────
          if (employeeData.password !== password) {
            const newAttempts = (employeeData.loginAttempts || 0) + 1;
            const shouldBlock = newAttempts >= MAX_ATTEMPTS;

            await updateDoc(doc(db, 'employees', empDoc.id), {
              loginAttempts: increment(1),
              ...(shouldBlock ? { isBlocked: true } : {}),
            });

            if (shouldBlock) {
              setError(`Cuenta bloqueada por ${MAX_ATTEMPTS} intentos fallidos. Contactá al administrador.`);
            } else {
              setError(`Contraseña incorrecta. Intentos restantes: ${MAX_ATTEMPTS - newAttempts}`);
            }
            setLoading(false);
            return;
          }

          // ── Login exitoso — resetear intentos ─────────────────────
          await updateDoc(doc(db, 'employees', empDoc.id), {
            loginAttempts: 0,
            isBlocked: false,
            lastLogin: new Date(),
          });

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
    <div className="flex flex-col lg:flex-row min-h-screen font-sans bg-white overflow-hidden">

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap');

        * { font-family: 'Sora', sans-serif; }

        .login-gradient {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 35%, #0d9488 100%);
        }

        .glass-mug {
          background: rgba(255,255,255,0.18);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1.5px solid rgba(255,255,255,0.35);
          box-shadow: 0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4);
        }

        .input-field {
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          transition: border-color 0.2s, box-shadow 0.2s;
          background: #f8fafc;
        }
        .input-field:focus-within {
          border-color: #22c55e;
          box-shadow: 0 0 0 3px rgba(34,197,94,0.12);
          background: #fff;
        }

        .btn-ingresar {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 60%, #0d9488 100%);
          box-shadow: 0 8px 24px rgba(34,197,94,0.4), 0 2px 8px rgba(34,197,94,0.2);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .btn-ingresar:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 12px 32px rgba(34,197,94,0.5), 0 4px 12px rgba(34,197,94,0.25);
        }
        .btn-ingresar:active:not(:disabled) { transform: translateY(0); }

        .orb1 {
          position: absolute; width: 380px; height: 380px;
          border-radius: 50%; background: rgba(255,255,255,0.08);
          bottom: -120px; left: -120px; pointer-events: none;
        }
        .orb2 {
          position: absolute; width: 260px; height: 260px;
          border-radius: 50%; background: rgba(255,255,255,0.06);
          top: -80px; right: -80px; pointer-events: none;
        }
        .orb3 {
          position: absolute; width: 140px; height: 140px;
          border-radius: 50%; background: rgba(255,255,255,0.08);
          top: 40%; right: 10%; pointer-events: none;
        }

        .custom-checkbox { display: none; }
        .custom-checkbox + label .box {
          width: 18px; height: 18px;
          border: 2px solid #cbd5e1; border-radius: 5px;
          background: white; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .custom-checkbox:checked + label .box {
          background: #22c55e; border-color: #22c55e;
        }
      `}</style>

      {/* ── PANEL IZQUIERDO ──────────────────────────────────────────── */}
      <div className="hidden lg:flex w-1/2 login-gradient relative overflow-hidden flex-col justify-center items-center p-12">
        <div className="orb1" />
        <div className="orb2" />
        <div className="orb3" />

        <div className="relative z-10 text-center select-none">
          {/* Ícono cerveza glassmorphism */}
          <div className="flex justify-center mb-8">
            <div className="glass-mug p-7 rounded-[2.5rem]">
              <Beer size={88} className="text-white drop-shadow-lg" strokeWidth={1.4} />
            </div>
          </div>

          <h1 className="text-6xl font-extrabold text-white leading-none tracking-tight drop-shadow-sm">
            Bodega<br />
            <span className="text-white/90">El Grifo</span>
          </h1>
          <p className="text-green-100/80 text-base mt-5 font-medium tracking-wide">
            Bodega el grifo V2.1
          </p>
        </div>
      </div>

      {/* ── PANEL DERECHO — FORMULARIO ──────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 sm:px-12 md:px-20 xl:px-28 py-16 bg-white relative">

        {/* Header móvil */}
        <div className="lg:hidden flex flex-col items-center mb-10">
          <div className="login-gradient p-4 rounded-2xl mb-4 shadow-lg shadow-green-200">
            <Beer size={40} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Bodega El Grifo</h2>
        </div>

        <div className="w-full max-w-md">

          {/* Título */}
          <div className="mb-10">
            <h3 className="text-5xl font-extrabold text-slate-900 mb-2 tracking-tight">
              Bienvenido
            </h3>
            <p className="text-slate-400 text-base font-medium">
              Inicia sesión para continuar.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">

            {/* EMAIL */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Email
              </label>
              <div className="input-field flex items-center px-4 py-3.5 gap-3">
                <input
                  type="email"
                  className="w-full bg-transparent border-none p-0 text-base text-slate-800 placeholder-slate-300 focus:ring-0 focus:outline-none"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
                <Mail size={18} className="text-slate-300 shrink-0" />
              </div>
            </div>

            {/* CONTRASEÑA */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Contraseña
              </label>
              <div className="input-field flex items-center px-4 py-3.5 gap-3">
                <input
                  type="password"
                  className="w-full bg-transparent border-none p-0 text-base text-slate-800 placeholder-slate-300 focus:ring-0 focus:outline-none font-mono"
                  placeholder="••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <Lock size={18} className="text-slate-300 shrink-0" />
              </div>
            </div>

            {/* Recordarme */}
            <div className="flex items-center pt-1">
              <input
                type="checkbox"
                id="remember"
                className="custom-checkbox"
              />
              <label htmlFor="remember" className="flex items-center gap-2.5 cursor-pointer select-none group">
                <span className="box">
                  <Check size={11} className="text-white" />
                </span>
                <span className="text-sm text-slate-500 group-hover:text-slate-700 transition-colors font-medium">
                  Recordarme
                </span>
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3.5 rounded-xl text-sm flex items-center gap-3 border border-red-100">
                <AlertCircle size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Botón */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="btn-ingresar w-full py-4 text-white font-bold rounded-xl flex items-center justify-center gap-3 text-base tracking-widest uppercase disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading
                  ? <Loader2 className="animate-spin" size={20} />
                  : <>INGRESAR <ArrowRight size={18} /></>
                }
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}