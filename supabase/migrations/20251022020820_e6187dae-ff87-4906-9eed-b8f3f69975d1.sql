-- Add billing and payment fields to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS billing_cycle text DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'semi_annually', 'annually')),
ADD COLUMN IF NOT EXISTS billing_contact text,
ADD COLUMN IF NOT EXISTS invoice_email text,
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'active' CHECK (payment_status IN ('active', 'overdue', 'suspended', 'cancelled')),
ADD COLUMN IF NOT EXISTS next_billing_date date,
ADD COLUMN IF NOT EXISTS last_payment_date date,
ADD COLUMN IF NOT EXISTS notes text;

-- Update pricing history to include billing cycle changes
DROP TRIGGER IF EXISTS log_organization_pricing_change ON public.organizations;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_organization_pricing_change
AFTER UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION log_organization_pricing_change();