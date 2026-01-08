/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Un verde sobrio para "El Grifo" (Minimalista)
        primary: '#10B981', 
        secondary: '#334155',
        background: '#F8FAFC', // Gris muy claro para el fondo, no blanco puro (menos fatiga visual)
      }
    },
  },
  plugins: [],
}