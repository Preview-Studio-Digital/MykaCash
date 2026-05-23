-- 1) Drop anonymous SELECT policies exposing financial/business data
DROP POLICY IF EXISTS "leitura_externa" ON public.clients;
DROP POLICY IF EXISTS "leitura_externa" ON public.invoices;
DROP POLICY IF EXISTS "leitura_externa_inv" ON public.invoices;
DROP POLICY IF EXISTS "leitura_externa_trans" ON public.account_transactions;

-- 2) Restore ownership check in toggle_invoice_settlement
CREATE OR REPLACE FUNCTION public.toggle_invoice_settlement(_invoice_id uuid, _settled_ids jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF jsonb_typeof(_settled_ids) <> 'array' THEN
    RAISE EXCEPTION 'invalid settled_ids format';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
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
$$;

-- 3) Fix mutable search_path on admin functions
ALTER FUNCTION public.admin_create_user(text, text, text, text, boolean) SET search_path = public;
ALTER FUNCTION public.admin_update_user(uuid, text, text, text, text, boolean) SET search_path = public;
ALTER FUNCTION public.admin_delete_user(uuid) SET search_path = public;