// Temporary file to add simulation tab content
// This should be merged into ProjectDetail.tsx

import { ProjectSimulation } from "@/components/projects/ProjectSimulation";

// Add this after economy tab in ProjectDetail.tsx:
/*
<TabsContent value="simulation">
  <Card>
    <CardHeader>
      <CardTitle>Ekonomisimulering</CardTitle>
    </CardHeader>
    <CardContent>
      <ProjectSimulation
        currentBudget={project.budget}
        currentForecast={project.forecast}
        currentActualCost={project.actual_cost}
        onApply={async (newForecast) => {
          try {
            const { error } = await supabase
              .from("projects")
              .update({ forecast: newForecast })
              .eq("id", project.id);

            if (error) throw error;

            toast.success("Prognos uppdaterad från simulering");
            fetchProject();
          } catch (error: any) {
            toast.error("Kunde inte uppdatera prognos");
          }
        }}
      />
    </CardContent>
  </Card>
</TabsContent>
*/
