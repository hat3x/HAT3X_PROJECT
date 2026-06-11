ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pendiente';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pendiente_pago' BEFORE 'pendiente';