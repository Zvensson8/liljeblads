ALTER TABLE public.maintenance_history 
  ADD COLUMN work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL;