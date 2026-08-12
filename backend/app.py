import os
import jwt
import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv  # <-- 1. IMPORTAMOS DOTENV

# Cargar las variables de entorno desde el archivo .env
load_dotenv()  # <-- 2. INICIALIZAMOS DOTENV

app = Flask(__name__)
CORS(app)  # Permite conectar con el frontend sin problemas de CORS

# Configuración basada en el archivo .env
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
DATABASE_URL = os.getenv('DATABASE_URL')  # <-- 3. TRAEMOS LA URL UNIFICADA DE NEON

# Helper para conectar a PostgreSQL en Neon
def get_db_connection():
    # psycopg2 se conecta directamente usando la URL con pooler y sslmode=require
    conn = psycopg2.connect(DATABASE_URL)
    return conn

# ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        # Lee el token del header Authorization
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'error': 'Falta el token de autenticación.'}), 401

        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            current_user_id = data['id_usuario']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Tu sesión expiró. Iniciá sesión nuevamente.'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido o corrupto.'}), 401

        return f(current_user_id, *args, **kwargs)
    return decorated

# ==================== RUTAS DE AUTENTICACIÓN ====================

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    nombre = data.get('nombre', '').strip()
    mail = data.get('mail', '').strip().lower()
    password = data.get('password', '')

    if not nombre or not mail or not password:
        return jsonify({'error': 'Todos los campos son obligatorios.'}), 400

    if len(password) < 6:
        return jsonify({'error': 'La contraseña debe tener al menos 6 caracteres.'}), 400

    hashed_password = generate_password_hash(password, method='pbkdf2:sha256')

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        # Verificar si el mail ya está registrado
        cur.execute("SELECT id_usuario FROM usuarios WHERE mail = %s", (mail,))
        if cur.fetchone():
            return jsonify({'error': 'El correo electrónico ya está registrado.'}), 400

        # Insertar nuevo usuario
        cur.execute(
            "INSERT INTO usuarios (nombre, mail, password) VALUES (%s, %s, %s) RETURNING id_usuario, nombre, mail",
            (nombre, mail, hashed_password)
        )
        user = cur.fetchone()
        conn.commit()

        # Generar Token JWT válido por 24 horas
        token = jwt.encode({
            'id_usuario': user['id_usuario'],
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, app.config['SECRET_KEY'], algorithm='HS256')

        return jsonify({
            'token': token,
            'usuario': {
                'id_usuario': user['id_usuario'],
                'nombre': user['nombre'],
                'mail': user['mail']
            }
        }), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': 'Error interno del servidor al crear la cuenta.'}), 500
    finally:
        cur.close()
        conn.close()


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    mail = data.get('mail', '').strip().lower()
    password = data.get('password', '')

    if not mail or not password:
        return jsonify({'error': 'Correo y contraseña requeridos.'}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id_usuario, nombre, mail, password FROM usuarios WHERE mail = %s", (mail,))
        user = cur.fetchone()

        if not user or not check_password_hash(user['password'], password):
            return jsonify({'error': 'Credenciales inválidas. Verificá tu correo o contraseña.'}), 400

        # Generar Token JWT
        token = jwt.encode({
            'id_usuario': user['id_usuario'],
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, app.config['SECRET_KEY'], algorithm='HS256')

        return jsonify({
            'token': token,
            'usuario': {
                'id_usuario': user['id_usuario'],
                'nombre': user['nombre'],
                'mail': user['mail']
            }
        })
    finally:
        cur.close()
        conn.close()

# ==================== CATÁLOGOS GENERALES ====================

@app.route('/api/categorias', methods=['GET'])
@token_required
def get_categorias(current_user_id):
    tipo = request.args.get('tipo') # Opcional: 'Ingreso' o 'Gasto'
    
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if tipo:
            cur.execute("SELECT id_categoria, descripcion, tipo FROM categorias WHERE tipo = %s ORDER BY descripcion ASC", (tipo,))
        else:
            cur.execute("SELECT id_categoria, descripcion, tipo FROM categorias ORDER BY tipo DESC, descripcion ASC")
        
        return jsonify(cur.fetchall())
    finally:
        cur.close()
        conn.close()


@app.route('/api/formas-pago', methods=['GET'])
@token_required
def get_formas_pago(current_user_id):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id_forma_pago, descripcion FROM formas_pago ORDER BY id_forma_pago ASC")
        return jsonify(cur.fetchall())
    finally:
        cur.close()
        conn.close()

# ==================== MOVIMIENTOS ====================

def listar_movimientos(current_user_id, desde=None, hasta=None, tipo=None, limit=None):

    query = """
        SELECT 
            m.id_movimiento,
            m.monto,
            m.descripcion,
            m.fecha::text as fecha,
            m.activo,
            tm.descripcion as tipo,
            c.descripcion as categoria,
            fp.descripcion as forma_pago,
            m.id_chanchito
        FROM movimientos m
        JOIN tipos_movimiento tm ON m.id_tipo_movimiento = tm.id_tipo_movimiento
        LEFT JOIN categorias c ON m.id_categoria = c.id_categoria
        LEFT JOIN formas_pago fp ON m.id_forma_pago = fp.id_forma_pago
        WHERE m.id_usuario = %s AND m.activo = TRUE
    """
    params = [current_user_id]

    if not tipo:
        query += " AND m.id_tipo_movimiento IN (1, 2)"
    else:
        query += " AND tm.descripcion = %s"
        params.append(tipo)

    if desde:
        query += " AND m.fecha >= %s"
        params.append(f"{desde} 00:00:00")
    if hasta:
        query += " AND m.fecha <= %s"
        params.append(f"{hasta} 23:59:59")

    query += " ORDER BY m.fecha DESC, m.id_movimiento DESC"

    if limit is not None:
        query += " LIMIT %s"
        params.append(limit)

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(query, params)
        return jsonify(cur.fetchall())
    finally:
        cur.close()
        conn.close()


@app.route('/api/movimientos', methods=['GET'])
@token_required
def get_movimientos(current_user_id):
    limit = request.args.get('limit', type=int)
    if limit is not None and limit < 1:
        return jsonify({'error': 'El límite debe ser mayor a cero.'}), 400
    return listar_movimientos(
        current_user_id,
        desde=request.args.get('desde'),
        hasta=request.args.get('hasta'),
        tipo=request.args.get('tipo'),
        limit=limit,
    )


@app.route('/api/movimientos/recientes', methods=['GET'])
@token_required
def get_movimientos_recientes(current_user_id):
    limit = request.args.get('limit', default=5, type=int)
    if limit < 1 or limit > 100:
        return jsonify({'error': 'El límite debe estar entre 1 y 100.'}), 400
    return listar_movimientos(current_user_id, limit=limit)


@app.route('/api/movimientos', methods=['POST'])
@token_required
def crear_movimiento(current_user_id):
    data = request.get_json() or {}
    tipo_str = data.get('tipo') # 'Ingreso' o 'Gasto'
    monto = data.get('monto')
    id_categoria = data.get('id_categoria')
    id_forma_pago = data.get('id_forma_pago')
    descripcion = data.get('descripcion', '').strip()
    fecha = data.get('fecha') # Formato 'YYYY-MM-DD'

    if not tipo_str or not monto or not descripcion:
        return jsonify({'error': 'Monto, tipo y descripción requeridos.'}), 400

    tipo_map = {'Ingreso': 1, 'Gasto': 2}
    id_tipo_movimiento = tipo_map.get(tipo_str)
    if not id_tipo_movimiento:
        return jsonify({'error': 'Tipo de movimiento inválido.'}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if fecha:
            query = """
                INSERT INTO movimientos (id_usuario, id_tipo_movimiento, id_categoria, id_forma_pago, monto, descripcion, fecha)
                VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id_movimiento
            """
            cur.execute(query, (current_user_id, id_tipo_movimiento, id_categoria, id_forma_pago, monto, descripcion, f"{fecha} 12:00:00"))
        else:
            query = """
                INSERT INTO movimientos (id_usuario, id_tipo_movimiento, id_categoria, id_forma_pago, monto, descripcion)
                VALUES (%s, %s, %s, %s, %s, %s) RETURNING id_movimiento
            """
            cur.execute(query, (current_user_id, id_tipo_movimiento, id_categoria, id_forma_pago, monto, descripcion))
        
        nuevo_mov = cur.fetchone()
        conn.commit()
        return jsonify(nuevo_mov), 201  # <-- Ajustado de 21 a 201 Created

    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'No se pudo guardar el movimiento: {str(e)}'}), 500
    finally:
        cur.close()
        conn.close()


@app.route('/api/movimientos/<int:id>', methods=['DELETE'])
@token_required
def eliminar_movimiento(current_user_id, id):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id_movimiento FROM movimientos WHERE id_movimiento = %s AND id_usuario = %s", (id, current_user_id))
        if not cur.fetchone():
            return jsonify({'error': 'Movimiento no encontrado.'}), 404

        cur.execute("DELETE FROM movimientos WHERE id_movimiento = %s", (id,))
        conn.commit()
        return jsonify({'success': True})
    finally:
        cur.close()
        conn.close()

# ==================== OPERACIONES DEL CHANCHITO ====================

@app.route('/api/chanchitos', methods=['GET'])
@token_required
def get_chanchitos(current_user_id):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id_chanchito, nombre, descripcion, saldo FROM chanchitos WHERE id_usuario = %s ORDER BY id_chanchito ASC", (current_user_id,))
        return jsonify(cur.fetchall())
    finally:
        cur.close()
        conn.close()


@app.route('/api/chanchitos', methods=['POST'])
@token_required
def crear_chanchito(current_user_id):
    data = request.get_json() or {}
    nombre = data.get('nombre', '').strip()
    descripcion = data.get('descripcion', '').strip()

    if not nombre:
        return jsonify({'error': 'El nombre del chanchito es obligatorio.'}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO chanchitos (id_usuario, nombre, descripcion, saldo) VALUES (%s, %s, %s, 0) RETURNING *",
            (current_user_id, nombre, descripcion)
        )
        nuevo_chanchito = cur.fetchone()
        conn.commit()
        return jsonify(nuevo_chanchito), 201
    finally:
        cur.close()
        conn.close()


@app.route('/api/chanchitos/<int:id>', methods=['DELETE'])
@token_required
def eliminar_chanchito(current_user_id, id):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT saldo FROM chanchitos WHERE id_chanchito = %s AND id_usuario = %s", (id, current_user_id))
        chanchito = cur.fetchone()
        
        if not chanchito:
            return jsonify({'error': 'Chanchito no encontrado.'}), 404
        
        if float(chanchito['saldo']) != 0.0:
            return jsonify({'error': 'No se puede eliminar un chanchito con saldo mayor a $0.'}), 400

        cur.execute("DELETE FROM chanchitos WHERE id_chanchito = %s", (id,))
        conn.commit()
        return jsonify({'success': True})
    finally:
        cur.close()
        conn.close()


@app.route('/api/chanchitos/<int:id>/depositar', methods=['POST'])
@token_required
def depositar_chanchito(current_user_id, id):
    data = request.get_json() or {}
    monto = data.get('monto')
    id_forma_pago = data.get('id_forma_pago')

    if not monto or float(monto) <= 0:
        return jsonify({'error': 'El monto a depositar debe ser mayor a cero.'}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id_chanchito FROM chanchitos WHERE id_chanchito = %s AND id_usuario = %s", (id, current_user_id))
        if not cur.fetchone():
            return jsonify({'error': 'Chanchito no encontrado.'}), 404

        query = """
            INSERT INTO movimientos (id_usuario, id_tipo_movimiento, id_forma_pago, id_chanchito, monto, descripcion)
            VALUES (%s, 3, %s, %s, %s, 'Depósito en chanchito internal') RETURNING id_movimiento
        """
        cur.execute(query, (current_user_id, id_forma_pago, id, monto))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'Error en la operación: {str(e)}'}), 500
    finally:
        cur.close()
        conn.close()


@app.route('/api/chanchitos/<int:id>/retirar', methods=['POST'])
@token_required
def retirar_chanchito(current_user_id, id):
    data = request.get_json() or {}
    monto = data.get('monto')
    id_forma_pago = data.get('id_forma_pago')

    if not monto or float(monto) <= 0:
        return jsonify({'error': 'El monto a retirar debe ser mayor a cero.'}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT saldo FROM chanchitos WHERE id_chanchito = %s AND id_usuario = %s", (id, current_user_id))
        chanchito = cur.fetchone()
        if not chanchito:
            return jsonify({'error': 'Chanchito no encontrado.'}), 404

        if float(chanchito['saldo']) < float(monto):
            return jsonify({'error': 'Fondos insuficientes en el chanchito para realizar este retiro.'}), 400

        query = """
            INSERT INTO movimientos (id_usuario, id_tipo_movimiento, id_forma_pago, id_chanchito, monto, descripcion)
            VALUES (%s, 4, %s, %s, %s, 'Retiro de chanchito internal') RETURNING id_movimiento
        """
        cur.execute(query, (current_user_id, id_forma_pago, id, monto))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'Error en la operación: {str(e)}'}), 500
    finally:
        cur.close()
        conn.close()


# ==================== EXECUTE SERVER ====================
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4000, debug=True)
