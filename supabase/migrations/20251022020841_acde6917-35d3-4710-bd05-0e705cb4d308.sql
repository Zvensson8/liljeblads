-- Fix search_path for security functions
CREATE OR REPLACE FUNCTION log_organization_pricing_change()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  IF (OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier) OR
     (OLD.max_properties IS DISTINCT FROM NEW.max_properties) OR
     (OLD.max_users IS DISTINCT FROM NEW.max_users) OR
     (OLD.billing_cycle IS DISTINCT FROM NEW.billing_cycle) OR
     (OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    INSERT INTO organization_pricing_history (
      organization_id,
      old_tier,
      new_tier,
      old_max_properties,
      new_max_properties,
      old_max_users,
      new_max_users,
      changed_by
    ) VALUES (
      NEW.id,
      OLD.subscription_tier,
      NEW.subscription_tier,
      OLD.max_properties,
      NEW.max_properties,
      OLD.max_users,
      NEW.max_users,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;