-- Create sequence for permanent operation numbers
CREATE SEQUENCE IF NOT EXISTS public.invoices_ordem_seq;

-- Add ordem column (nullable initially)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS ordem INTEGER;

-- Backfill existing rows in created_at order
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.invoices
  WHERE ordem IS NULL
)
UPDATE public.invoices i
SET ordem = r.rn
FROM ranked r
WHERE i.id = r.id;

-- Advance sequence past existing max
SELECT setval('public.invoices_ordem_seq', COALESCE((SELECT MAX(ordem) FROM public.invoices), 0));

-- Set default and constraints
ALTER TABLE public.invoices ALTER COLUMN ordem SET DEFAULT nextval('public.invoices_ordem_seq');
ALTER TABLE public.invoices ALTER COLUMN ordem SET NOT NULL;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_ordem_unique UNIQUE (ordem);

-- Tie sequence ownership to column
ALTER SEQUENCE public.invoices_ordem_seq OWNED BY public.invoices.ordem;