-- Fix security warnings: Extension in Public and Function Search Path Mutable

-- 1. Ensure extensions are in the extensions schema (not public)
-- Drop from public if they exist there and recreate in extensions schema
DROP EXTENSION IF EXISTS pg_cron CASCADE;
DROP EXTENSION IF EXISTS pg_net CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Fix functions with mutable search_path by adding SET search_path = public

-- Fix log_organization_pricing_change function
CREATE OR REPLACE FUNCTION log_organization_pricing_change()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;