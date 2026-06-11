
-- 1) Tighten storage policy: require the object to belong to a file in user's company
DROP POLICY IF EXISTS "Clients can view own storage files" ON storage.objects;

CREATE POLICY "Clients can view own storage files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-files'
  AND EXISTS (
    SELECT 1
    FROM public.files f
    LEFT JOIN public.projects p ON p.id = f.project_id
    JOIN public.company_users cu ON cu.user_id = auth.uid()
    WHERE f.visible_to_client = true
      AND (cu.company_id = f.company_id OR cu.company_id = p.company_id)
      AND (f.file_url = storage.objects.name OR f.file_url LIKE '%' || storage.objects.name)
  )
);

-- 2) Restrict realtime.messages: allow postgres_changes to authenticated (table RLS still applies);
--    allow broadcast/presence only to admins.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can receive postgres_changes" ON realtime.messages;
CREATE POLICY "Authenticated can receive postgres_changes"
ON realtime.messages FOR SELECT
TO authenticated
USING (extension = 'postgres_changes');

DROP POLICY IF EXISTS "Admins can use broadcast and presence" ON realtime.messages;
CREATE POLICY "Admins can use broadcast and presence"
ON realtime.messages FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 3) Lock down SECURITY DEFINER functions: revoke EXECUTE from anon and PUBLIC.
--    Keep EXECUTE for authenticated on functions used inside RLS policies.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_company_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
