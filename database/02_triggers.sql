-- ============================================================
-- PIGGY - Triggers
-- Mantiene el saldo de cada chanchito sincronizado cuando se
-- inserta un movimiento de tipo "Depositar Chanchito" (3) o
-- "Retirar Chanchito" (4).
-- ============================================================

CREATE OR REPLACE FUNCTION actualizar_saldo_chanchito()
RETURNS TRIGGER AS
$$
BEGIN

    IF NEW.id_tipo_movimiento = 3 THEN

        UPDATE chanchitos
        SET saldo = saldo + NEW.monto
        WHERE id_chanchito = NEW.id_chanchito;

    ELSIF NEW.id_tipo_movimiento = 4 THEN

        UPDATE chanchitos
        SET saldo = saldo - NEW.monto
        WHERE id_chanchito = NEW.id_chanchito;

    END IF;

    RETURN NEW;

END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER tg_actualizar_chanchito
AFTER INSERT ON movimientos
FOR EACH ROW
EXECUTE FUNCTION actualizar_saldo_chanchito();
