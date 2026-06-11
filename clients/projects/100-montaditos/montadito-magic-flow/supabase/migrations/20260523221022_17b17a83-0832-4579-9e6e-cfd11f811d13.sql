GRANT EXECUTE ON FUNCTION public.get_user_franchisee_id(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_for_local(uuid, public.app_role, uuid) TO anon, authenticated;