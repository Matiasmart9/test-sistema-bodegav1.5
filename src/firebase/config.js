// src/firebase/config.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // Base de datos
import { getAuth } from "firebase/auth"; // Autenticación

const firebaseConfig = {
  apiKey: "AIzaSyAE5T4J8pLtzRimrLvWu2yzUtPwfy4woA4",
  authDomain: "sistema-web-bodegav2.firebaseapp.com",
  projectId: "sistema-web-bodegav2",
  storageBucket: "sistema-web-bodegav2.firebasestorage.app",
  messagingSenderId: "521168832700",
  appId: "1:521168832700:web:003a9706521ce0f7e4a8b9",
  measurementId: "G-P6NWQJ6PJR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app); // Exportamos la BD
export const auth = getAuth(app);    // Exportamos la Auth