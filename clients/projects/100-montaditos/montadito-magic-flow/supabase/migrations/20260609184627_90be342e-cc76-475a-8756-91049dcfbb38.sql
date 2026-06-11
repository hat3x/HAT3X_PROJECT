
-- These functions are referenced in RLS policies and must be executable
-- by the roles the policies apply to, otherwise policy checks fail.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role_for_local(uuid, public.app_role, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_franchisee_id(uuid) TO authenticated;
