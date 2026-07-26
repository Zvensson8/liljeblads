-- Add year and quarter columns to projects table
ALTER TABLE public.projects
ADD COLUMN year integer,
ADD COLUMN start_quarter integer CHECK (start_quarter >= 1 AND start_quarter <= 4),
ADD COLUMN end_quarter integer CHECK (end_quarter >= 1 AND end_quarter <= 4);

-- Set default values for existing projects based on start_date if available
UPDATE public.projects
SET year = EXTRACT(YEAR FROM start_date),
    start_quarter = EXTRACT(QUARTER FROM start_date),
    end_quarter = EXTRACT(QUARTER FROM end_date)
WHERE start_date IS NOT NULL;

-- For projects without dates, set to current year Q1-Q4
UPDATE public.projects
SET year = EXTRACT(YEAR FROM CURRENT_DATE),
    start_quarter = 1,
    end_quarter = 4
WHERE year IS NULL;