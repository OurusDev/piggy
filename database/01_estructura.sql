-- ============================================================
-- PIGGY - Estructura de base de datos
-- ============================================================

CREATE TABLE usuarios (
    id_usuario SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    mail VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

------------------------------------------------------------

CREATE TABLE formas_pago (
    id_forma_pago SERIAL PRIMARY KEY,
    descripcion VARCHAR(100) NOT NULL
);

------------------------------------------------------------

CREATE TABLE tipos_movimiento (
    id_tipo_movimiento SERIAL PRIMARY KEY,
    descripcion VARCHAR(100) NOT NULL
);

INSERT INTO tipos_movimiento(descripcion)
VALUES
('Ingreso'),
('Gasto'),
('Depositar Chanchito'),
('Retirar Chanchito');

------------------------------------------------------------

CREATE TABLE categorias (
    id_categoria SERIAL PRIMARY KEY,
    descripcion VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) NOT NULL
);

------------------------------------------------------------

CREATE TABLE chanchitos (
    id_chanchito SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    saldo NUMERIC(15,2) DEFAULT 0,

    FOREIGN KEY(id_usuario)
        REFERENCES usuarios(id_usuario)
        ON DELETE CASCADE
);

------------------------------------------------------------

CREATE TABLE movimientos (

    id_movimiento SERIAL PRIMARY KEY,

    id_usuario INTEGER NOT NULL,

    id_tipo_movimiento INTEGER NOT NULL,

    id_categoria INTEGER,

    id_forma_pago INTEGER,

    id_chanchito INTEGER,

    monto NUMERIC(15,2) NOT NULL CHECK (monto>0),

    descripcion TEXT,

    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    activo BOOLEAN DEFAULT TRUE,

    FOREIGN KEY(id_usuario)
        REFERENCES usuarios(id_usuario),

    FOREIGN KEY(id_tipo_movimiento)
        REFERENCES tipos_movimiento(id_tipo_movimiento),

    FOREIGN KEY(id_categoria)
        REFERENCES categorias(id_categoria),

    FOREIGN KEY(id_forma_pago)
        REFERENCES formas_pago(id_forma_pago),

    FOREIGN KEY(id_chanchito)
        REFERENCES chanchitos(id_chanchito)
);

-- Índices útiles para las consultas de movimientos y estadísticas
CREATE INDEX idx_movimientos_usuario_fecha ON movimientos(id_usuario, fecha);
CREATE INDEX idx_movimientos_tipo ON movimientos(id_tipo_movimiento);
CREATE INDEX idx_chanchitos_usuario ON chanchitos(id_usuario);
