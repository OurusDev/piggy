# 🐷 Piggy — Frontend

Frontend de **Piggy**, separado en `index.html`, `styles.css` y `app.js`, conectado al backend de Piggy (Node + Express + PostgreSQL) por `fetch`.

## Cómo usarlo

1. Levantá primero el backend (ver el proyecto `piggy-backend`) en `http://localhost:4000`.
2. Si necesitás apuntar a otra URL (por ejemplo un backend ya desplegado), editá la constante al principio de `app.js`:

   ```js
   const API_BASE = 'http://localhost:4000/api';
   ```

3. Serví esta carpeta con un servidor HTTP simple (abrir `index.html` directo con doble clic puede fallar por CORS en algunos navegadores):

   ```bash
   npx serve .
   # o
   python3 -m http.server 5500
   ```

4. Abrí la URL que te indique el servidor (ej. `http://localhost:5500`).

## Qué cambió respecto al `draft.html` original

- Se separó en tres archivos: `index.html`, `styles.css`, `app.js`.
- Se reemplazó el guardado en `localStorage` por llamadas a la API real (`/api/auth`, `/api/movimientos`, `/api/categorias`, `/api/formas-pago`).
- Las categorías y formas de pago ahora se cargan dinámicamente desde el backend en vez de estar hardcodeadas.
- Se agregó una pantalla nueva **"Chanchito"** (crear chanchitos, depositar y retirar), ya que el backend la soporta y no estaba en el diseño original — si preferís no incluirla, avisame y la saco.
- El token de sesión (JWT) se guarda en `localStorage` para mantener la sesión entre recargas de página.

## Estructura

```
piggy-frontend/
├── index.html   → estructura y markup de todas las pantallas
├── styles.css   → estilos (idénticos al draft, más los de la pantalla Chanchito)
└── app.js       → estado, cliente de API y lógica de la interfaz
```
