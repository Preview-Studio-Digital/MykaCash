-- Update toggle_invoice_settlement to allow any user with 'user' role to toggle settlement
-- This fixes the issue where users like Michely cannot update statuses of operations they didn't create.

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

  -- Allow ANY authenticated user to toggle settlement
  -- This ensures users like Michely can mark operations as settled even without special roles
  -- provided they are logged into the system.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF jsonb_typeof(_settled_ids) <> 'array' THEN
    RAISE EXCEPTION 'invalid settled_ids format';
  END IF;

  UPDATE public.invoices
  SET settled_installments = _settled_ids,
      updated_at = now()
  WHERE id = _invoice_id;
END;
$function$;
