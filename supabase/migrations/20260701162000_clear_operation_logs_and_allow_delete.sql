-- Truncate existing logs
TRUNCATE TABLE public.operation_logs;

-- Allow admins to delete logs via API
CREATE POLICY "Admins can delete logs" ON public.operation_logs 
  FOR DELETE 
  TO authenticated 
  USING (public.has_role(auth.uid(), 'admin'));
