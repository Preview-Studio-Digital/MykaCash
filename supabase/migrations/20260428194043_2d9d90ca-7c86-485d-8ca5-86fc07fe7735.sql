DROP POLICY IF EXISTS invoices_update_author_5min_or_admin ON public.invoices;
DROP POLICY IF EXISTS invoices_delete_author_5min_or_admin ON public.invoices;

CREATE POLICY invoices_update_admin_only
ON public.invoices
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY invoices_delete_admin_only
ON public.invoices
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));