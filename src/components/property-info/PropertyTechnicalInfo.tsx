import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePropertyInfoCategories } from "@/hooks/usePropertyInfoCategories";
import { usePropertyInfoValues } from "@/hooks/usePropertyInfoValues";
import { useOrganization } from "@/hooks/useOrganization";
import { DynamicFormField } from "./DynamicFormField";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { calculateCompletionPercentage } from "@/lib/propertyInfoUtils";
import { Info } from "lucide-react";

interface PropertyTechnicalInfoProps {
  propertyId: string;
}

export function PropertyTechnicalInfo({ propertyId }: PropertyTechnicalInfoProps) {
  const { organization } = useOrganization();
  const { categories, isLoading: categoriesLoading } = usePropertyInfoCategories(organization?.id || null);
  const { values, isLoading: valuesLoading, upsertValue } = usePropertyInfoValues(propertyId);
  const [showEmpty, setShowEmpty] = useState(true);

  if (categoriesLoading || valuesLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-center text-muted-foreground">Laddar...</p>
        </CardContent>
      </Card>
    );
  }

  if (!categories || categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            Teknisk information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Inga kategorier konfigurerade. Kontakta administratör för att lägga till kategorier.
          </p>
        </CardContent>
      </Card>
    );
  }

  const allFields = categories.flatMap(c => c.fields || []);
  const completionPercentage = calculateCompletionPercentage(values, allFields);

  const getValueForField = (fieldId: string): string => {
    const value = values.find(v => v.field_id === fieldId);
    return value?.value || '';
  };

  const handleValueChange = (fieldId: string, value: string) => {
    upsertValue(fieldId, value);
  };

  return (
    <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Teknisk information</CardTitle>
              <CardDescription>
                {completionPercentage}% ifyllt ({values.filter(v => v.value).length} av {allFields.length} fält)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="show-empty"
              checked={showEmpty}
              onCheckedChange={setShowEmpty}
            />
            <Label htmlFor="show-empty" className="text-sm">
              Visa tomma fält
            </Label>
          </div>
        </div>
        <Progress value={completionPercentage} className="h-2 mt-2" />
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {categories.map((category) => {
            const categoryFields = category.fields || [];
            const filledFields = categoryFields.filter(f => 
              values.some(v => v.field_id === f.id && v.value)
            ).length;

            return (
              <AccordionItem key={category.id} value={category.id}>
                <AccordionTrigger>
                  <div className="flex items-center justify-between w-full pr-4">
                    <span>{category.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {filledFields}/{categoryFields.length} fält
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {category.description && (
                    <p className="text-sm text-muted-foreground mb-4">
                      {category.description}
                    </p>
                  )}
                  <div className="space-y-4">
                    {categoryFields.map((field) => (
                      <DynamicFormField
                        key={field.id}
                        field={field}
                        value={getValueForField(field.id)}
                        onChange={(value) => handleValueChange(field.id, value)}
                        showEmpty={showEmpty}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
