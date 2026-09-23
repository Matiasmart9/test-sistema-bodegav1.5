# 🍺 Bodega El Grifo — Sistema POS & Inventario

Sistema de punto de venta (POS) e inventario para **Bodega El Grifo**, construido como aplicación web (con empaquetado a Android vía Capacitor). Maneja ventas, caja, inventario con costeo FIFO por lotes, fiado (ventas a crédito), empleados, clientes, descuentos e inversiones, con dos roles de usuario: **Administrador** y **Cajero**.

## Stack tecnológico

- **React 19** + **Vite 7** — UI y bundling
- **Firebase** (Firestore + Authentication) — base de datos y autenticación
- **TailwindCSS** — estilos
- **React Router v7** — ruteo
- **Recharts** — gráficos del dashboard
- **Capacitor** — empaquetado como app Android
- **xlsx** / **xlsx-js-style** — exportación de reportes a Excel (con estilos de celda)
- **lucide-react** — iconografía

## Módulos principales

| Módulo | Descripción |
|---|---|
| **Dashboard** | Resumen general de la operación, incluida la utilidad neta real (costeo FIFO) y el total de fiados pendientes |
| **POS / Ventas** | Terminal de venta (`/pos`), historial de ventas, historial de cajas/turnos, gastos, reporte de productos vendidos, registro manual de ventas, reporte por cajero, impresión de tickets |
| **Inventario** | Alta y edición de productos (con variantes, precios, margen visible, historial de precios), historial global de inventario, entrada de mercadería (genera lotes FIFO), Ficha de Mercaderías (ver abajo), proveedores, auditoría de inventario del cajero |
| **Clientes Fiados** | Listado de clientes con saldo de crédito, historial de ventas fiadas y pagos, registro/anulación de pagos, carga manual de deudas preexistentes (de cuaderno) |
| **Descuentos** | Creación y gestión de descuentos aplicables en el POS |
| **Empleados** | Alta/edición de empleados, permisos granulares, control de horas trabajadas |
| **Clientes** | Listado y gestión de clientes |
| **Inversiones** | Registro de inversiones del negocio |
| **Configuración** | Datos del comercio, numeración de tickets, etc. |

## Costeo FIFO por lotes

Cada compra cargada en **Entrada Mercadería** crea un lote (`inventory_batches`) con su propia cantidad, costo, proveedor y fecha. Al vender, el sistema descuenta stock del lote más antiguo primero y calcula el costo real (ponderado) de esa venta, en vez de aplicar el último costo cargado a todo el stock existente.

**Ficha de Mercaderías** (`/articulos/ficha-mercaderias`) muestra este historial agrupado por producto, con el detalle de entradas y salidas desplegable, y un botón de administrador **"Generar Lote Inicial"** que reconcilia el stock que ya existía antes de usar Entrada Mercadería (crea el lote faltante con el costo actual como referencia, fechado antes que cualquier lote real).

## Fiado (ventas a crédito)

Un cliente puede llevarse mercadería a cuenta. El saldo de cada cliente es la suma de sus ventas con `paymentMethod: 'fiado'` más las deudas cargadas a mano (`credit_charges`, para deuda preexistente de antes del sistema), menos sus pagos (`credit_payments`). El admin gestiona todo desde **Clientes Fiados**; el cajero puede cobrar fiado y, si tiene el permiso, cargar deudas manuales sin depender del admin.

## Roles y permisos

- **Administrador**: acceso completo a todos los módulos vía panel con sidebar.
- **Cajero**: opera principalmente desde la Terminal POS (`/pos`), a pantalla completa. Puede tener permisos adicionales habilitados por un admin desde el módulo de Empleados:
  - `canManageInventorySummarized` → acceso a la Lista de Productos.
  - `canCheckCashierInventory` → acceso a Inventario Cajero (cruzamiento de stock físico vs. sistema).
  - `canRegisterExpenses` → registrar gastos/retiros desde la caja.
  - `canManageFiado` → cargar ventas fiadas y cobrar pagos de clientes.
  - `canManualFiado` → cargar deudas manuales/preexistentes (opción "Carga Manual de Fiado" en el menú de Opciones), sin necesidad de que lo haga el admin.

  Al iniciar sesión, si el cajero tiene alguno de estos permisos, puede elegir entre **Iniciar Caja** o ir directo a su sección de **Inventario**, sin necesidad de abrir turno.

La sesión de cajero se gestiona vía `localStorage` (empleados definidos en Firestore), mientras que la sesión de administrador usa Firebase Authentication.

## Puesta en marcha

### Requisitos

- Node.js 18+
- Un proyecto de Firebase (Firestore + Authentication habilitados)

### Instalación

```bash
npm install
```

### Configuración de Firebase

Las credenciales del proyecto de Firebase están en [`src/firebase/config.js`](src/firebase/config.js). Ajustá los valores según el proyecto (test/producción) antes de correr o desplegar.

### Desarrollo

```bash
npm run dev
```

Levanta el servidor de Vite en `http://localhost:5173`.

### Build de producción

```bash
npm run build
```

Genera la carpeta `dist/` lista para desplegar (por ejemplo en Netlify).

### App de escritorio para la caja (Windows)

El script [`iniciar_pos.bat`](iniciar_pos.bat) abre Chrome en modo kiosco apuntando a `http://localhost:5173` con impresión silenciosa (`--kiosk-printing`), pensado para la terminal física de la caja.

### App Android (Capacitor)

```bash
npm run build
npx cap sync android
npx cap open android
```

Compilar y correr desde Android Studio.

## Lint

```bash
npm run lint
```
