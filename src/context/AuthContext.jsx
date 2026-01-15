import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Función para cerrar sesión (Borra Firebase y LocalStorage)
  const logout = async () => {
    try {
      await signOut(auth); // Salir de Firebase
      localStorage.removeItem('pos_user'); // Borrar sesión local
      setUser(null);
      setUserData(null);
    } catch (error) {
      console.error("Error al salir:", error);
    }
  };

  // Función para forzar login manual (para empleados de base de datos)
  const loginManual = (employeeData) => {
    localStorage.setItem('pos_user', JSON.stringify(employeeData));
    setUser({ uid: employeeData.id, email: employeeData.email }); // Simular objeto user
    setUserData(employeeData);
  };

  useEffect(() => {
    // 1. Escuchar a Firebase Auth (Administradores Reales)
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
            const docRef = doc(db, "users", currentUser.uid);
            const docSnap = await getDoc(docRef);
            if(docSnap.exists()) {
                // CORRECCIÓN: Agregamos 'id: currentUser.uid'
                setUserData({ id: currentUser.uid, ...docSnap.data(), role: 'admin' });
            } else {
                // CORRECCIÓN: Agregamos 'id: currentUser.uid'
                setUserData({ id: currentUser.uid, name: currentUser.email, role: 'admin' });
            }
        } catch (e) {
            // CORRECCIÓN: Agregamos 'id: currentUser.uid'
            setUserData({ id: currentUser.uid, name: 'Admin', role: 'admin' });
        }
        setLoading(false);
      } else {
        // 2. Si no hay Firebase User, buscar en LocalStorage (Empleados)
        const localUser = localStorage.getItem('pos_user');
        if (localUser) {
            const parsedUser = JSON.parse(localUser);
            setUser({ uid: parsedUser.id, email: parsedUser.email });
            setUserData(parsedUser);
        } else {
            setUser(null);
            setUserData(null);
        }
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading, logout, loginManual }}>
      {children}
    </AuthContext.Provider>
  );
}