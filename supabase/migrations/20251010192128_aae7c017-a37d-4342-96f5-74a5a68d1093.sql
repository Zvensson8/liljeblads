-- Rename columns to match component fields
ALTER TABLE drift_task_components 
RENAME COLUMN serial_number TO series_id;

ALTER TABLE drift_task_components 
RENAME COLUMN id_number TO registration_number;