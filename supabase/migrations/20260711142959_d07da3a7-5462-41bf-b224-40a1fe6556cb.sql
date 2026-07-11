ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS is_additional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_parent ON public.invoices(parent_invoice_id);