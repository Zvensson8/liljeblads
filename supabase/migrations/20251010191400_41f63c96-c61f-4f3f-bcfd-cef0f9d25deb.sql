-- Add serial_number and id_number columns to drift_task_components
ALTER TABLE drift_task_components 
ADD COLUMN serial_number text,
ADD COLUMN id_number text;