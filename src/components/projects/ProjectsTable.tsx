import { Briefcase, Edit, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { projectStatusBadge, projectTypeBadge } from "@/lib/projectLabels";
import { budgetVarianceClass } from "@/lib/projectsListFilter";
import type { Database } from "@/integrations/supabase/types";

type ProjectStatus = Database["public"]["Enums"]["project_status"];
type ProjectType = Database["public"]["Enums"]["project_type"];

export interface ProjectsTableProject {
  id: string;
  project_number: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  property_id: string;
  year: number;
  start_quarter: number;
  budget: number;
  actual_cost: number;
  property: { name: string };
}

export interface ProjectsTableProps {
  projects: ProjectsTableProject[];
  totalUnfilteredCount: number;
  sortField: string;
  sortDirection: "asc" | "desc";
  onSort: (field: string) => void;
  editingCell: { projectId: string; field: string } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tempValue: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTempValue: (value: any) => void;
  updating: boolean;
  onStartEditing: (projectId: string, field: string, currentValue: unknown) => void;
  onUpdateProject: (projectId: string, field: string, value: unknown) => void;
  onKeyDown: (e: React.KeyboardEvent, projectId: string, field: string) => void;
  onRowClick: (projectId: string) => void;
  onEditClick: (project: ProjectsTableProject) => void;
  /** When true, hide sort headers and show simpler actions (archived list). */
  archived?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: "briefcase" | "archive";
}

export function ProjectsTable({
  projects,
  totalUnfilteredCount,
  sortField,
  sortDirection,
  onSort,
  editingCell,
  tempValue,
  setTempValue,
  updating,
  onStartEditing,
  onUpdateProject,
  onKeyDown,
  onRowClick,
  onEditClick,
  archived = false,
  emptyTitle,
  emptyDescription,
  emptyIcon = "briefcase",
}: ProjectsTableProps) {
  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  const SortableHead = ({
    field,
    children,
    className = "",
  }: {
    field: string;
    children: React.ReactNode;
    className?: string;
  }) => {
    if (archived) {
      return <TableHead className={className}>{children}</TableHead>;
    }
    return (
      <TableHead
        className={`cursor-pointer hover:bg-muted/50 ${className}`}
        onClick={() => onSort(field)}
      >
        <div
          className={`flex items-center ${className.includes("text-right") ? "justify-end" : ""}`}
        >
          {children}
          {getSortIcon(field)}
        </div>
      </TableHead>
    );
  };

  const title = archived
    ? undefined
    : `Projekt (${projects.length})`;

  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="overflow-x-auto">
        {projects.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">
              {emptyTitle ?? "Inga projekt hittades"}
            </p>
            {emptyDescription !== undefined ? (
              <p className="text-sm">{emptyDescription}</p>
            ) : (
              <p className="text-sm">
                {totalUnfilteredCount === 0
                  ? "Skapa ditt första projekt för att komma igång"
                  : "Prova att justera filtren"}
              </p>
            )}
          </div>
        ) : (
          <div className="min-w-[800px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead field="project_number">Projektnr</SortableHead>
                  <SortableHead field="name">Namn</SortableHead>
                  <SortableHead field="property_name">Fastighet</SortableHead>
                  <SortableHead field="type">Typ</SortableHead>
                  <SortableHead field="status">Status</SortableHead>
                  <SortableHead field="quarter">Kvartal</SortableHead>
                  <SortableHead field="budget" className="text-right">
                    Budget
                  </SortableHead>
                  <SortableHead field="actual_cost" className="text-right">
                    Utfall
                  </SortableHead>
                  <TableHead className="text-right">Avvikelse</TableHead>
                  <TableHead>Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => {
                  const variance =
                    project.budget > 0
                      ? ((project.actual_cost - project.budget) / project.budget) * 100
                      : 0;
                  return (
                    <TableRow
                      key={project.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onRowClick(project.id)}
                    >
                      <TableCell
                        className="font-medium group cursor-text hover:bg-muted/30"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartEditing(project.id, "project_number", project.project_number);
                        }}
                      >
                        {editingCell?.projectId === project.id &&
                        editingCell?.field === "project_number" ? (
                          <Input
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            onBlur={() =>
                              onUpdateProject(project.id, "project_number", tempValue)
                            }
                            onKeyDown={(e) => onKeyDown(e, project.id, "project_number")}
                            className="h-8 w-full"
                            autoFocus
                            disabled={updating}
                          />
                        ) : (
                          <span className="group-hover:underline">
                            {project.project_number}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{project.name}</TableCell>
                      <TableCell>{project.property.name}</TableCell>
                      <TableCell
                        className="group cursor-pointer hover:bg-muted/30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {editingCell?.projectId === project.id &&
                        editingCell?.field === "type" ? (
                          <Select
                            value={tempValue}
                            onValueChange={(value) => {
                              setTempValue(value);
                              onUpdateProject(project.id, "type", value);
                            }}
                            disabled={updating}
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="investering">Investering</SelectItem>
                              <SelectItem value="underhall">Underhåll</SelectItem>
                              <SelectItem value="energi">Energi</SelectItem>
                              <SelectItem value="annat">Annat</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div onClick={() => onStartEditing(project.id, "type", project.type)}>
                            {projectTypeBadge(project.type)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className="group cursor-pointer hover:bg-muted/30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {editingCell?.projectId === project.id &&
                        editingCell?.field === "status" ? (
                          <Select
                            value={tempValue}
                            onValueChange={(value) => {
                              setTempValue(value);
                              onUpdateProject(project.id, "status", value);
                            }}
                            disabled={updating}
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="planerat">Planerat</SelectItem>
                              <SelectItem value="invantar_offert">Inväntar offert</SelectItem>
                              <SelectItem value="offert_finns">Offert finns</SelectItem>
                              <SelectItem value="pagaende">Pågående</SelectItem>
                              <SelectItem value="pausat">Pausat</SelectItem>
                              <SelectItem value="avslutat">Avslutat</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div
                            onClick={() =>
                              onStartEditing(project.id, "status", project.status)
                            }
                          >
                            {projectStatusBadge(project.status)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className="text-sm text-muted-foreground group cursor-pointer hover:bg-muted/30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {editingCell?.projectId === project.id &&
                        editingCell?.field === "quarter" ? (
                          <div className="flex gap-2">
                            <Select
                              value={tempValue?.quarter?.toString() || ""}
                              onValueChange={(value) => {
                                const newValue = {
                                  quarter: parseInt(value),
                                  year: tempValue?.year || project.year,
                                };
                                setTempValue(newValue);
                                onUpdateProject(project.id, "start_quarter", parseInt(value));
                              }}
                              disabled={updating}
                            >
                              <SelectTrigger className="h-8 w-20">
                                <SelectValue placeholder="Q" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">Q1</SelectItem>
                                <SelectItem value="2">Q2</SelectItem>
                                <SelectItem value="3">Q3</SelectItem>
                                <SelectItem value="4">Q4</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select
                              value={tempValue?.year?.toString() || ""}
                              onValueChange={(value) => {
                                const newValue = {
                                  quarter: tempValue?.quarter || project.start_quarter,
                                  year: parseInt(value),
                                };
                                setTempValue(newValue);
                                onUpdateProject(project.id, "year", parseInt(value));
                              }}
                              disabled={updating}
                            >
                              <SelectTrigger className="h-8 w-24">
                                <SelectValue placeholder="År" />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 7 }, (_, i) => 2024 + i).map((year) => (
                                  <SelectItem key={year} value={year.toString()}>
                                    {year}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div
                            className="group-hover:underline"
                            onClick={() =>
                              onStartEditing(project.id, "quarter", {
                                quarter: project.start_quarter,
                                year: project.year,
                              })
                            }
                          >
                            {project.start_quarter && project.year
                              ? `Q${project.start_quarter} ${project.year}`
                              : "-"}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {project.budget.toLocaleString("sv-SE")} kr
                      </TableCell>
                      <TableCell className="text-right">
                        {project.actual_cost.toLocaleString("sv-SE")} kr
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${budgetVarianceClass(
                          project.budget,
                          project.actual_cost,
                        )}`}
                      >
                        {variance !== 0
                          ? `${variance > 0 ? "+" : ""}${variance.toFixed(1)}%`
                          : "-"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {archived ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRowClick(project.id)}
                          >
                            Visa
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEditClick(project)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
