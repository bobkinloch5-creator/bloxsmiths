
-- Pin search_path
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- Lock down: only authenticated users (and service role) may execute
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.spend_credits_atomic(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.refund_credits(integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.grant_credits_service(uuid, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_approve_payment(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_reject_payment(uuid, text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.spend_credits_atomic(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_credits_service(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment(uuid, text) TO authenticated, service_role;
