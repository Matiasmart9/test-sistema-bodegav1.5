// src/firebase/config.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // Base de datos
import { getAuth } from "firebase/auth"; // Autenticación

const firebaseConfig = {
  apiKey: "AIzaSyD2A6WXSLAD6GxkHbGxKfaMGxu8vbPhUYE",
  authDomain: "bodega-el-grifo.firebaseapp.com",
  projectId: "bodega-el-grifo",
  storageBucket: "bodega-el-grifo.firebasestorage.app",
  messagingSenderId: "544195531336",
  appId: "1:544195531336:web:6b75c7b93f96f0dce27e7d",
  measurementId: "G-J53678G86R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app); // Exportamos la BD
export const auth = getAuth(app);    // Exportamos la Auth
