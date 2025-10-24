-- Add UPDATE and DELETE policies for project_activity_log
CREATE POLICY "Users can update activity log for accessible projects"
  ON project_activity_log FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_activity_log.project_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete activity log for accessible projects"
  ON project_activity_log FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_activity_log.project_id
      AND p.owner_id = auth.uid()
    )
  );