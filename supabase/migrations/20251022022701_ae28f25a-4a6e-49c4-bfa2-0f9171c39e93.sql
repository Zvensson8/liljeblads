-- Add founder access to profiles table
CREATE POLICY "Founders can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'founder'));

CREATE POLICY "Founders can update all profiles"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'founder'));