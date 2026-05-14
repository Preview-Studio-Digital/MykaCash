-- Create account_transactions table
CREATE TYPE public.transaction_type AS ENUM ('deposit', 'withdrawal');

CREATE TABLE public.account_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.transaction_type NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.account_transactions ENABLE ROW LEVEL SECURITY;

-- Policies: only admins can manage
CREATE POLICY "Admins can do everything on account_transactions"
ON public.account_transactions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow authenticated users to view (optional, but requested for admin page which checks isAdmin anyway)
-- Actually, the request says "dentro da pagina do adm", so only admins will see it.
