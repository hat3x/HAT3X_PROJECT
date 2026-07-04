-- 005: Políticas RLS para el dashboard/oficina de Jarvis (anon key en el navegador).
-- Sin esto, la oficina 2D, el dashboard /command y Aiden ven 0 filas aunque haya datos.
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run.

-- Lectura para el dashboard
DROP POLICY IF EXISTS anon_read_hat3x_tasks ON hat3x_tasks;
CREATE POLICY anon_read_hat3x_tasks ON hat3x_tasks FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read_bus_events ON bus_events;
CREATE POLICY anon_read_bus_events ON bus_events FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read_hat3x_checkpoints ON hat3x_checkpoints;
CREATE POLICY anon_read_hat3x_checkpoints ON hat3x_checkpoints FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read_hat3x_clients ON hat3x_clients;
CREATE POLICY anon_read_hat3x_clients ON hat3x_clients FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read_hat3x_meetings ON hat3x_meetings;
CREATE POLICY anon_read_hat3x_meetings ON hat3x_meetings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read_hat3x_meeting_votes ON hat3x_meeting_votes;
CREATE POLICY anon_read_hat3x_meeting_votes ON hat3x_meeting_votes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read_evolution_proposals ON evolution_proposals;
CREATE POLICY anon_read_evolution_proposals ON evolution_proposals FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read_evolution_log ON evolution_log;
CREATE POLICY anon_read_evolution_log ON evolution_log FOR SELECT TO anon USING (true);

-- El botón Aprobar/Rechazar checkpoints funciona desde el navegador
DROP POLICY IF EXISTS anon_update_checkpoints ON hat3x_checkpoints;
CREATE POLICY anon_update_checkpoints ON hat3x_checkpoints FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_insert_bus_events ON bus_events;
CREATE POLICY anon_insert_bus_events ON bus_events FOR INSERT TO anon WITH CHECK (true);
