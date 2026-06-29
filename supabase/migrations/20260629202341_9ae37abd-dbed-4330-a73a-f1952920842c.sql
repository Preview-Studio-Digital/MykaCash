CREATE TABLE IF NOT EXISTS public.operation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL,
  op_number TEXT,
  client_name TEXT,
  invoice_number TEXT,
  author TEXT NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS operation_logs_created_at_idx ON public.operation_logs (created_at DESC);
GRANT SELECT, INSERT ON public.operation_logs TO authenticated;
GRANT ALL ON public.operation_logs TO service_role;
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read logs" ON public.operation_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can insert logs" ON public.operation_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);