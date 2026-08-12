-- ============================================================
-- PIGGY - Datos iniciales (categorías y formas de pago)
-- Coinciden con las que usa el front (draft.html)
-- ============================================================

INSERT INTO categorias (descripcion, tipo) VALUES
('Sueldo', 'Ingreso'),
('Freelance', 'Ingreso'),
('Ventas', 'Ingreso'),
('Inversiones', 'Ingreso'),
('Otros ingresos', 'Ingreso'),
('Alimentación', 'Gasto'),
('Transporte', 'Gasto'),
('Hogar', 'Gasto'),
('Servicios', 'Gasto'),
('Salud', 'Gasto'),
('Ocio', 'Gasto'),
('Educación', 'Gasto'),
('Otros gastos', 'Gasto');

INSERT INTO formas_pago (descripcion) VALUES
('Efectivo'),
('Débito'),
('Crédito'),
('Transferencia'),
('Billetera virtual');
