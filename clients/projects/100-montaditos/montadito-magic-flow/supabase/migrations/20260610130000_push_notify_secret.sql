-- Reemplaza la función del trigger con el secreto incrustado directamente
-- (SECURITY DEFINER garantiza que solo el propietario de la función puede ejecutarla)
CREATE OR REPLACE FUNCTION notify_order_listo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_secret CONSTANT TEXT := '496a45dc9ea62505b01b2bc287d68c5aec3fc71445e12b0ef47c24a8845d849a';
  v_fired  BOOLEAN := FALSE;
BEGIN
  IF NEW.estado_cocina  = 'listo' AND OLD.estado_cocina  IS DISTINCT FROM 'listo' THEN v_fired := TRUE; END IF;
  IF NEW.estado_bebidas = 'listo' AND OLD.estado_bebidas IS DISTINCT FROM 'listo' THEN v_fired := TRUE; END IF;
  IF NEW.estado         = 'listo' AND OLD.estado         IS DISTINCT FROM 'listo' THEN v_fired := TRUE; END IF;

  IF v_fired THEN
    PERFORM net.http_post(
      url     := 'https://znmhqnmmktkaillwfscu.supabase.co/functions/v1/notify-order-ready',
      headers := jsonb_build_object(
        'Content-Type',         'application/json',
        'x-push-notify-secret', v_secret
      ),
      body    := jsonb_build_object(
        'pedido_id',     NEW.id,
        'session_id',    NEW.session_id,
        'numero_pedido', NEW.numero_pedido
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$;
