import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableCell,
  TableRow,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ShadingType,
} from "docx";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

// Professional business document color scheme
const COLORS = {
  primary: "2563EB", // Professional blue for accents
  primaryLight: "DBEAFE", // Very light blue for highlights
  success: "16A34A", // Professional green
  successLight: "DCFCE7", // Very light green background
  text: "1F2937", // Dark gray for text (almost black)
  textLight: "6B7280", // Medium gray for secondary text
  border: "D1D5DB", // Light gray for borders
  background: "F3F4F6", // Very light gray for alternating rows
  headerBg: "E5E7EB", // Light gray for headers (professional and subtle)
  headerText: "111827", // Dark text on light headers
};

// Helper function to create a styled heading
function createHeading(
  text: string,
  level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1
) {
  const isH1 = level === HeadingLevel.HEADING_1;
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: isH1 ? 32 : 28,
        color: isH1 ? COLORS.primary : COLORS.text,
      }),
    ],
    spacing: { before: isH1 ? 600 : 400, after: 300 },
    border: isH1 ? {
      bottom: {
        color: COLORS.primary,
        space: 1,
        style: BorderStyle.SINGLE,
        size: 20,
      },
    } : undefined,
  });
}

// Helper function to create a key-value row
function createInfoRow(key: string, value: string) {
  return new Paragraph({
    children: [
      new TextRun({ 
        text: `${key}: `, 
        bold: true,
        color: COLORS.text,
        size: 22,
      }),
      new TextRun({ 
        text: value,
        color: COLORS.textLight,
        size: 22,
      }),
    ],
    spacing: { after: 150, line: 360 },
  });
}

// Helper function to format currency
function formatCurrency(amount: number): string {
  return `${amount.toLocaleString("sv-SE")} kr`;
}

// Helper function to create a professional table cell
function createTableCell(
  text: string,
  isHeader: boolean = false,
  backgroundColor?: string,
  bold: boolean = false
): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: isHeader || bold,
            color: COLORS.text,
            size: isHeader ? 22 : 20,
          }),
        ],
        alignment: AlignmentType.LEFT,
      }),
    ],
    shading: {
      fill: backgroundColor || (isHeader ? COLORS.headerBg : "FFFFFF"),
      type: ShadingType.SOLID,
    },
    margins: {
      top: 150,
      bottom: 150,
      left: 200,
      right: 200,
    },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
      left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
      right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
    },
  });
}

export async function generateProjectDocx(project: any): Promise<Blob> {
  const statusLabels: Record<string, string> = {
    planerat: "Planerat",
    pagaende: "Pågående",
    avslutat: "Avslutat",
    pausat: "Pausat",
  };

  const typeLabels: Record<string, string> = {
    underhall: "Underhåll",
    nybyggnation: "Nybyggnation",
    renovering: "Renovering",
    omb_tillb: "Ombyggnad/Tillbyggnad",
  };

  const doc = new Document({
    creator: "FastighetsPortal",
    title: `Projekt: ${project.name}`,
    description: `Projektdokumentation för ${project.project_number}`,
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          basedOn: "Normal",
          next: "Normal",
          run: {
            size: 22,
            color: COLORS.text,
          },
          paragraph: {
            spacing: {
              line: 360,
              before: 100,
              after: 100,
            },
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: [
          createHeading("PROJEKTINFORMATION", HeadingLevel.HEADING_1),
          
          createHeading("Grunduppgifter", HeadingLevel.HEADING_2),
          createInfoRow("Projektnummer", project.project_number || "-"),
          createInfoRow("Namn", project.name),
          createInfoRow("Status", statusLabels[project.status] || project.status),
          createInfoRow("Typ", typeLabels[project.type] || project.type),
          
          new Paragraph({ text: "" }), // Empty line
          
          createHeading("Beskrivning", HeadingLevel.HEADING_2),
          new Paragraph({
            children: [
              new TextRun({
                text: project.description || "Ingen beskrivning",
                size: 22,
                color: COLORS.textLight,
              }),
            ],
            spacing: { after: 300, line: 360 },
          }),
          
          createHeading("Tidsplan", HeadingLevel.HEADING_2),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              left: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              right: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            },
            rows: [
              new TableRow({
                children: [
                  createTableCell("Startdatum", false, COLORS.background, true),
                  createTableCell(
                    project.start_date
                      ? format(new Date(project.start_date), "PPP", { locale: sv })
                      : "-",
                    false
                  ),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("Slutdatum", false, COLORS.background, true),
                  createTableCell(
                    project.end_date
                      ? format(new Date(project.end_date), "PPP", { locale: sv })
                      : "-",
                    false
                  ),
                ],
              }),
            ],
          }),
          
          new Paragraph({ text: "" }), // Empty line
          
          createHeading("Ekonomi", HeadingLevel.HEADING_2),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              left: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              right: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            },
            rows: [
              new TableRow({
                children: [
                  createTableCell("Budget", false, COLORS.background, true),
                  createTableCell(
                    project.budget ? formatCurrency(Number(project.budget)) : "-",
                    false
                  ),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("Prognos", false, COLORS.background, true),
                  createTableCell(
                    project.forecast ? formatCurrency(Number(project.forecast)) : "-",
                    false
                  ),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("Faktisk kostnad", false, COLORS.background, true),
                  createTableCell(
                    project.actual_cost ? formatCurrency(Number(project.actual_cost)) : "-",
                    false
                  ),
                ],
              }),
            ],
          }),
          
          new Paragraph({ text: "" }), // Empty line
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
                size: 18,
                color: COLORS.textLight,
                italics: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 800 },
            border: {
              top: {
                color: COLORS.border,
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6,
              },
            },
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function generateChecklistDocx(checklist: any[]): Promise<Blob> {
  const rows = checklist.map((item, index) => {
    const statusSymbol = item.completed ? "✓" : "☐";
    const statusColor = item.completed ? COLORS.success : COLORS.text;
    const completedText = item.completed_at
      ? ` (${format(new Date(item.completed_at), "PPP", { locale: sv })})`
      : "";
    const bgColor = index % 2 === 0 ? "FFFFFF" : COLORS.background;

    return new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ 
                  text: statusSymbol, 
                  color: statusColor, 
                  bold: true,
                  size: 28,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
          width: { size: 8, type: WidthType.PERCENTAGE },
          shading: { fill: bgColor, type: ShadingType.SOLID },
          margins: { top: 150, bottom: 150, left: 200, right: 200 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
          },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ 
                  text: item.title,
                  color: COLORS.text,
                  size: 20,
                }),
              ],
            }),
          ],
          width: { size: 92, type: WidthType.PERCENTAGE },
          shading: { fill: bgColor, type: ShadingType.SOLID },
          margins: { top: 150, bottom: 150, left: 200, right: 200 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
          },
        }),
      ],
    });
  });

  const doc = new Document({
    creator: "FastighetsPortal",
    title: "Projektchecklista",
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          createHeading("CHECKLISTA", HeadingLevel.HEADING_1),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              left: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              right: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
            },
            rows,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
                size: 18,
                color: COLORS.textLight,
                italics: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 600 },
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function generateActivitiesDocx(activities: any[]): Promise<Blob> {
  const rows = [
    new TableRow({
      children: [
        createTableCell("Datum", true),
        createTableCell("Typ", true),
        createTableCell("Beskrivning", true),
      ],
    }),
    ...activities.map((activity, index) => {
      const date = format(new Date(activity.created_at), "PPP HH:mm", { locale: sv });
      const bgColor = index % 2 === 0 ? "FFFFFF" : COLORS.background;
      
      return new TableRow({
        children: [
          createTableCell(date, false, bgColor),
          createTableCell(activity.activity_type, false, bgColor),
          createTableCell(activity.description, false, bgColor),
        ],
      });
    }),
  ];

  const doc = new Document({
    creator: "FastighetsPortal",
    title: "Aktivitetslogg",
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          createHeading("AKTIVITETSLOGG", HeadingLevel.HEADING_1),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              left: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              right: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
            },
            rows,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
                size: 18,
                color: COLORS.textLight,
                italics: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 600 },
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function generateCostsDocx(costs: any[]): Promise<Blob> {
  let total = 0;
  const rows = [
    new TableRow({
      children: [
        createTableCell("Datum", true),
        createTableCell("Beskrivning", true),
        createTableCell("Kategori", true),
        createTableCell("Aktör", true),
        createTableCell("Belopp", true),
      ],
    }),
    ...costs.map((cost, index) => {
      const date = format(new Date(cost.cost_date), "PPP", { locale: sv });
      const amount = Number(cost.amount);
      total += amount;
      const bgColor = index % 2 === 0 ? "FFFFFF" : COLORS.background;

      return new TableRow({
        children: [
          createTableCell(date, false, bgColor),
          createTableCell(cost.description, false, bgColor),
          createTableCell(cost.category || "-", false, bgColor),
          createTableCell(cost.actor || "-", false, bgColor),
          createTableCell(formatCurrency(amount), false, bgColor),
        ],
      });
    }),
    new TableRow({
      children: [
        new TableCell({ 
          children: [new Paragraph("")], 
          columnSpan: 4,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
          },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ 
                  text: `TOTALT: ${formatCurrency(total)}`, 
                  bold: true,
                  size: 24,
                  color: COLORS.text,
                }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
          shading: { fill: COLORS.successLight, type: ShadingType.SOLID },
          margins: { top: 150, bottom: 150, left: 200, right: 200 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
          },
        }),
      ],
    }),
  ];

  const doc = new Document({
    creator: "FastighetsPortal",
    title: "Projektkostnader",
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          createHeading("KOSTNADER", HeadingLevel.HEADING_1),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              left: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              right: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
            },
            rows,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
                size: 18,
                color: COLORS.textLight,
                italics: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 600 },
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function generateBudgetDocx(budget: any[]): Promise<Blob> {
  let totalBudget = 0;
  let totalForecast = 0;

  const rows = [
    new TableRow({
      children: [
        createTableCell("Beskrivning", true),
        createTableCell("Kategori", true),
        createTableCell("Budgeterat", true),
        createTableCell("Prognos", true),
      ],
    }),
    ...budget.map((item, index) => {
      const budgeted = Number(item.budgeted_amount);
      const forecasted = item.forecasted_amount ? Number(item.forecasted_amount) : 0;
      totalBudget += budgeted;
      totalForecast += forecasted;
      const bgColor = index % 2 === 0 ? "FFFFFF" : COLORS.background;

      return new TableRow({
        children: [
          createTableCell(item.description, false, bgColor),
          createTableCell(item.category || "-", false, bgColor),
          createTableCell(formatCurrency(budgeted), false, bgColor),
          createTableCell(forecasted > 0 ? formatCurrency(forecasted) : "-", false, bgColor),
        ],
      });
    }),
    new TableRow({
      children: [
        new TableCell({ 
          children: [new Paragraph("")], 
          columnSpan: 2,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
          },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ 
                  text: `TOTALT: ${formatCurrency(totalBudget)}`, 
                  bold: true,
                  size: 24,
                  color: COLORS.text,
                }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
          shading: { fill: COLORS.headerBg, type: ShadingType.SOLID },
          margins: { top: 150, bottom: 150, left: 200, right: 200 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
          },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: totalForecast > 0 ? formatCurrency(totalForecast) : "-",
                  bold: true,
                  size: 24,
                  color: COLORS.text,
                }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
          shading: { fill: COLORS.headerBg, type: ShadingType.SOLID },
          margins: { top: 150, bottom: 150, left: 200, right: 200 },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
          },
        }),
      ],
    }),
  ];

  const doc = new Document({
    creator: "FastighetsPortal",
    title: "Projektbudget",
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          createHeading("BUDGET", HeadingLevel.HEADING_1),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              left: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              right: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
            },
            rows,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
                size: 18,
                color: COLORS.textLight,
                italics: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 600 },
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function generateWorkOrderDocx(workOrder: any): Promise<Blob> {
  const statusLabels: Record<string, string> = {
    not_started: "Ej påbörjad",
    awaiting_quote: "Inväntar offert",
    ordered: "Beställt",
    completed: "Slutförd",
    archived: "Arkiverad",
  };

  const priorityLabels: Record<string, string> = {
    low: "Låg",
    medium: "Medel",
    high: "Hög",
  };

  const doc = new Document({
    creator: "FastighetsPortal",
    title: `Arbetsorder: ${workOrder.action}`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          createHeading("ARBETSORDER", HeadingLevel.HEADING_1),
          
          createHeading("Grunduppgifter", HeadingLevel.HEADING_2),
          createInfoRow("Åtgärd", workOrder.action),
          createInfoRow("Fastighet", workOrder.properties?.name || "-"),
          createInfoRow("Status", statusLabels[workOrder.status] || workOrder.status),
          createInfoRow(
            "Prioritet",
            priorityLabels[workOrder.priority] || workOrder.priority
          ),
          
          new Paragraph({ text: "" }), // Empty line
          
          createHeading("Detaljer", HeadingLevel.HEADING_2),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              left: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              right: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
            },
            rows: [
              new TableRow({
                children: [
                  createTableCell("Entreprenör", false, COLORS.background, true),
                  createTableCell(workOrder.contractor || "-", false),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("Pris", false, COLORS.background, true),
                  createTableCell(
                    workOrder.price ? formatCurrency(Number(workOrder.price)) : "-",
                    false
                  ),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("Datum", false, COLORS.background, true),
                  createTableCell(
                    workOrder.due_date
                      ? format(new Date(workOrder.due_date), "PPP", { locale: sv })
                      : "-",
                    false
                  ),
                ],
              }),
              new TableRow({
                children: [
                  createTableCell("Kvartal", false, COLORS.background, true),
                  createTableCell(workOrder.quarter || "-", false),
                ],
              }),
            ],
          }),
          
          new Paragraph({ text: "" }), // Empty line
          
          createHeading("Kommentar", HeadingLevel.HEADING_2),
          new Paragraph({
            children: [
              new TextRun({
                text: workOrder.comments || "Ingen kommentar",
                size: 22,
                color: COLORS.textLight,
              }),
            ],
            spacing: { after: 300, line: 360 },
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
                size: 18,
                color: COLORS.textLight,
                italics: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 800 },
            border: {
              top: {
                color: COLORS.border,
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6,
              },
            },
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}
