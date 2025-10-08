-- Add approved column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN approved boolean NOT NULL DEFAULT false;

-- Update existing user to be approved (assuming first user is admin)
UPDATE public.profiles 
SET approved = true 
WHERE id IN (
  SELECT id FROM public.profiles 
  ORDER BY created_at ASC 
  LIMIT 1
);

-- Update handle_new_user function to set approved to false by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user',
    false
  );
  RETURN NEW;
END;
$function$;

-- Update RLS policies to check approved status
DROP POLICY IF EXISTS "Users can view their own properties" ON public.properties;
CREATE POLICY "Users can view their own properties" 
ON public.properties 
FOR SELECT 
USING (
  (owner_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND approved = true
  )) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Users can create properties" ON public.properties;
CREATE POLICY "Users can create properties" 
ON public.properties 
FOR INSERT 
WITH CHECK (
  owner_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND approved = true
  )
);

DROP POLICY IF EXISTS "Users can update their own properties" ON public.properties;
CREATE POLICY "Users can update their own properties" 
ON public.properties 
FOR UPDATE 
USING (
  owner_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND approved = true
  )
);

DROP POLICY IF EXISTS "Users can delete their own properties" ON public.properties;
CREATE POLICY "Users can delete their own properties" 
ON public.properties 
FOR DELETE 
USING (
  owner_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND approved = true
  )
);

-- Add policy for admins to view all profiles
DROP POLICY IF EXISTS "Users can view own profile or admin can view all" ON public.profiles;
CREATE POLICY "Users can view own profile or admin can view all" 
ON public.profiles 
FOR SELECT 
USING (
  (id = auth.uid()) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Add policy for admins to update any profile
CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));