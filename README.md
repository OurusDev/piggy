# Piggy

Aplicación Flask con PostgreSQL (Neon) y frontend estático. Está preparada para desplegarse como una única función en Vercel.

## Archivos importantes

- `api/index.py`: entrada de Vercel.
- `backend/app.py`: API Flask y servidor del frontend.
- `frontend/`: interfaz web.
- `requirements.txt`: dependencias del runtime Python.
- `vercel.json`: reescribe las rutas del frontend y la API hacia Flask.

## Desplegar en Vercel

1. Subí todos los archivos de esta carpeta al repositorio, excepto `backend/.env`, `work/` y cualquier secreto. El `.gitignore` ya los excluye.
2. En Vercel, importá el repositorio o conectalo al proyecto `piggy` existente.
3. No configures **Build Command** ni **Output Directory**: Vercel detecta `requirements.txt` y `api/index.py` automáticamente.
4. En **Project Settings → Environment Variables**, agregá estas dos variables para Production, Preview y Development:

   - `DATABASE_URL`: la cadena de conexión de Neon, incluyendo `sslmode=require`.
   - `SECRET_KEY`: una clave aleatoria larga usada para firmar los JWT.

5. Hacé un nuevo deploy. Abrí el dominio asignado y comprobá que aparezca la pantalla de inicio de sesión.

## Verificación rápida

- `https://tu-dominio.vercel.app/` debe mostrar la interfaz.
- Al crear una cuenta, `POST /api/auth/register` debe responder `201`.
- Si la API devuelve error de conexión, verificá `DATABASE_URL` y que el esquema SQL de `database/` ya esté aplicado en Neon.
