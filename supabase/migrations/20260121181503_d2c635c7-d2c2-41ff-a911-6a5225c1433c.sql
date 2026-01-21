-- Add new capacity limit columns to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_components INTEGER DEFAULT 500;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_work_orders INTEGER DEFAULT 1000;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_projects INTEGER DEFAULT 100;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_documents INTEGER DEFAULT 500;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_storage_mb INTEGER DEFAULT 1024;

-- Update existing organizations based on their subscription tier
UPDATE organizations SET
  max_components = CASE subscription_tier
    WHEN 'small' THEN 500
    WHEN 'medium' THEN 2500
    WHEN 'large' THEN 10000
    WHEN 'enterprise' THEN 50000
    ELSE 500
  END,
  max_work_orders = CASE subscription_tier
    WHEN 'small' THEN 1000
    WHEN 'medium' THEN 5000
    WHEN 'large' THEN 20000
    WHEN 'enterprise' THEN 100000
    ELSE 1000
  END,
  max_projects = CASE subscription_tier
    WHEN 'small' THEN 100
    WHEN 'medium' THEN 500
    WHEN 'large' THEN 2000
    WHEN 'enterprise' THEN 5000
    ELSE 100
  END,
  max_documents = CASE subscription_tier
    WHEN 'small' THEN 500
    WHEN 'medium' THEN 2000
    WHEN 'large' THEN 10000
    WHEN 'enterprise' THEN 25000
    ELSE 500
  END,
  max_storage_mb = CASE subscription_tier
    WHEN 'small' THEN 1024
    WHEN 'medium' THEN 5120
    WHEN 'large' THEN 20480
    WHEN 'enterprise' THEN 51200
    ELSE 1024
  END;