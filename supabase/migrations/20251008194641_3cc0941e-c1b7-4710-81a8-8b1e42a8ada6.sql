-- Create property_users table for assigning properties to users
CREATE TABLE public.property_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, property_id)
);

-- Enable RLS
ALTER TABLE public.property_users ENABLE ROW LEVEL SECURITY;

-- Admins can manage property assignments
CREATE POLICY "Admins can view all property assignments"
  ON public.property_users
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert property assignments"
  ON public.property_users
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete property assignments"
  ON public.property_users
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Update properties RLS policies to include assigned users
DROP POLICY IF EXISTS "Users can view their own properties" ON public.properties;
CREATE POLICY "Users can view their own or assigned properties"
  ON public.properties
  FOR SELECT
  USING (
    (owner_id = auth.uid() AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() AND profiles.approved = true
    ))
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.property_users 
      WHERE property_users.property_id = properties.id 
      AND property_users.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() AND profiles.approved = true
      )
    )
  );