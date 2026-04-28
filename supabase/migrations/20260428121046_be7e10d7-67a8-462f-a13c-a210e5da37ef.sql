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
  UPDATE public.invoices
  SET settled_installments = _settled_ids,
      updated_at = now()
  WHERE id = _invoice_id;
END;
$function$;