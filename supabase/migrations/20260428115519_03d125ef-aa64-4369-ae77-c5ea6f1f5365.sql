-- Add settled tracking + factoring + creator profile relation to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS settled_installments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS factoring_monthly_rate numeric NOT NULL DEFAULT 3.74;

-- Allow joining invoices.created_by -> profiles.id via PostgREST embedding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_created_by_profiles_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_created_by_profiles_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Replace generic update policy with: author within 5 minutes OR admin anytime
DROP POLICY IF EXISTS invoices_update_auth ON public.invoices;
CREATE POLICY invoices_update_author_5min_or_admin
ON public.invoices
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (created_by = auth.uid() AND created_at > (now() - interval '5 minutes'))
);

-- Replace delete policy: author within 5 minutes OR admin anytime
DROP POLICY IF EXISTS invoices_delete_auth ON public.invoices;
CREATE POLICY invoices_delete_author_5min_or_admin
ON public.invoices
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (created_by = auth.uid() AND created_at > (now() - interval '5 minutes'))
);

-- Allow any authenticated user to view profiles (for showing creator name in history)
DROP POLICY IF EXISTS profiles_select_all_authenticated ON public.profiles;
CREATE POLICY profiles_select_all_authenticated
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Separate policy just for liquidation toggle (any authenticated user can update only settled_installments)
-- Implemented via a SECURITY DEFINER function so we don't need a complex RLS column-level check
CREATE OR REPLACE FUNCTION public.toggle_invoice_settlement(_invoice_id uuid, _settled_ids jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  UPDATE public.invoices
  SET settled_installments = _settled_ids,
      updated_at = now()
  WHERE id = _invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_invoice_settlement(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.toggle_invoice_settlement(uuid, jsonb) TO authenticated;