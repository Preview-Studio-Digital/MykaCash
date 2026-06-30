-- Add value column to operation_logs table
ALTER TABLE public.operation_logs ADD COLUMN IF NOT EXISTS value NUMERIC;

-- Backfill value for existing operation_logs from invoices table
UPDATE public.operation_logs ol
SET value = inv.invoice_value
FROM public.invoices inv
JOIN public.clients c ON inv.client_id = c.id
WHERE 
  ol.value IS NULL
  AND ol.invoice_number = inv.invoice_number
  AND ol.op_number IS NOT NULL
  AND ol.op_number != '—'
  AND (
    (ol.op_number ~ '^\d+$' AND CAST(ol.op_number AS INTEGER) = inv.ordem)
    OR ol.op_number = CAST(inv.ordem AS TEXT)
  )
  AND (
    ol.client_name = c.name 
    OR LOWER(ol.client_name) = LOWER(c.name)
  );
