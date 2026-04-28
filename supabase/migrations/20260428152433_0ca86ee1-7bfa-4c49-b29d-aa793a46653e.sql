-- 1. Restrict UPDATE/DELETE on clients to author within 5 minutes or admin
DROP POLICY IF EXISTS clients_update_auth ON public.clients;
DROP POLICY IF EXISTS clients_delete_auth ON public.clients;

CREATE POLICY clients_update_author_5min_or_admin
ON public.clients
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR ((created_by = auth.uid()) AND (created_at > (now() - interval '5 minutes')))
);

CREATE POLICY clients_delete_author_5min_or_admin
ON public.clients
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR ((created_by = auth.uid()) AND (created_at > (now() - interval '5 minutes')))
);

-- 2. Harden toggle_invoice_settlement: ownership/admin check + array validation
CREATE OR REPLACE FUNCTION public.toggle_invoice_settlement(_invoice_id uuid, _settled_ids jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF jsonb_typeof(_settled_ids) <> 'array' THEN
    RAISE EXCEPTION 'invalid settled_ids format';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.invoices
      WHERE id = _invoice_id AND created_by = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.invoices
  SET settled_installments = _settled_ids,
      updated_at = now()
  WHERE id = _invoice_id;
END;
$function$;

-- 3. Revoke EXECUTE from anon on sensitive SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.toggle_invoice_settlement(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, public, authenticated;

GRANT EXECUTE ON FUNCTION public.toggle_invoice_settlement(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;