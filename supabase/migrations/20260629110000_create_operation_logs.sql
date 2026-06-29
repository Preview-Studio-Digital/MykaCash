-- Create operation_logs table
CREATE TABLE IF NOT EXISTS public.operation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'SETTLE', 'DELETE'
  op_number TEXT,
  client_name TEXT,
  invoice_number TEXT,
  author TEXT NOT NULL, -- User display name or email
  details TEXT
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;

-- Policy to allow any authenticated user to insert logs
CREATE POLICY "operation_logs_insert_all"
ON public.operation_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy to allow only admins to select/read logs
CREATE POLICY "operation_logs_select_admin"
ON public.operation_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
