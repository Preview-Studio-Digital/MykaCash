-- Add operation_number column as a sequential identity
-- This will automatically populate existing rows and handle new ones
ALTER TABLE public.invoices 
ADD COLUMN operation_number BIGINT GENERATED ALWAYS AS IDENTITY;

-- Add a comment to explain it's the 'ordem' field
COMMENT ON COLUMN public.invoices.operation_number IS 'Sequential operation number (ordem)';
