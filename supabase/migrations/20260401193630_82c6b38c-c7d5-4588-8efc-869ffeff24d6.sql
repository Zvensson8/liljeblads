ALTER TABLE work_orders ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_work_orders_project_id ON work_orders(project_id);