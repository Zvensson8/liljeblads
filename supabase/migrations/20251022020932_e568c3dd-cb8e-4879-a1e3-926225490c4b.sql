-- Fix search_path for get_task_status function
CREATE OR REPLACE FUNCTION public.get_task_status(planned integer, reported integer)
RETURNS task_status
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT CASE
    WHEN reported = 0 THEN 'missing'::task_status
    WHEN reported >= planned THEN 'completed'::task_status
    ELSE 'remaining'::task_status
  END;
$function$;