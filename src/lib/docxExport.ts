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

const COLORS = {
  primary: "2563EB", // Blue
  success: "10B981", // Green
  warning: "F59E0B", // Yellow
  danger: "EF4444", // Red
  gray: "6B7280",
  lightGray: "F3F4F6",
};

// Helper function to create a styled heading
function createHeading(
  text: string,
  level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1
) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 400, after: 200 },
  });
}

// Helper function to create a key-value row
function createInfoRow(key: string, value: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${key}: `, bold: true }),
      new TextRun({ text: value }),
    ],
    spacing: { after: 100 },
  });
}

// Helper function to format currency
function formatCurrency(amount: number): string {
  return `${amount.toLocaleString("sv-SE")} kr`;
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
    sections: [
      {
        properties: {},
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
            text: project.description || "Ingen beskrivning",
            spacing: { after: 200 },
          }),
          
          createHeading("Tidsplan", HeadingLevel.HEADING_2),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Startdatum", bold: true })] })],
                    shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: project.start_date
                          ? format(new Date(project.start_date), "PPP", { locale: sv })
                          : "-",
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Slutdatum", bold: true })] })],
                    shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: project.end_date
                          ? format(new Date(project.end_date), "PPP", { locale: sv })
                          : "-",
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          
          new Paragraph({ text: "" }), // Empty line
          
          createHeading("Ekonomi", HeadingLevel.HEADING_2),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Budget", bold: true })] })],
                    shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: project.budget ? formatCurrency(Number(project.budget)) : "-",
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Prognos", bold: true })] })],
                    shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: project.forecast ? formatCurrency(Number(project.forecast)) : "-",
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Faktisk kostnad", bold: true })] })],
                    shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: project.actual_cost
                          ? formatCurrency(Number(project.actual_cost))
                          : "-",
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          
          new Paragraph({ text: "" }), // Empty line
          
          new Paragraph({
            text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
            alignment: AlignmentType.CENTER,
            spacing: { before: 600 },
            style: "footer",
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function generateChecklistDocx(checklist: any[]): Promise<Blob> {
  const rows = checklist.map((item) => {
    const statusSymbol = item.completed ? "✓" : "☐";
    const statusColor = item.completed ? COLORS.success : COLORS.gray;
    const completedText = item.completed_at
      ? ` (${format(new Date(item.completed_at), "PPP", { locale: sv })})`
      : "";

    return new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: statusSymbol, color: statusColor, bold: true }),
              ],
            }),
          ],
          width: { size: 5, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: item.title }),
                new TextRun({ text: completedText, italics: true, color: COLORS.gray }),
              ],
            }),
          ],
          width: { size: 95, type: WidthType.PERCENTAGE },
        }),
      ],
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          createHeading("CHECKLISTA", HeadingLevel.HEADING_1),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),
          new Paragraph({
            text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
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
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Datum", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Typ", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Beskrivning", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
      ],
    }),
    ...activities.map((activity, index) => {
      const date = format(new Date(activity.created_at), "PPP HH:mm", { locale: sv });
      const isEven = index % 2 === 0;
      
      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: date })],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
          new TableCell({
            children: [new Paragraph({ text: activity.activity_type })],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
          new TableCell({
            children: [new Paragraph({ text: activity.description })],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
        ],
      });
    }),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          createHeading("AKTIVITETSLOGG", HeadingLevel.HEADING_1),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),
          new Paragraph({
            text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
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
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Datum", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Beskrivning", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Kategori", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Aktör", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Belopp", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
      ],
    }),
    ...costs.map((cost, index) => {
      const date = format(new Date(cost.cost_date), "PPP", { locale: sv });
      const amount = Number(cost.amount);
      total += amount;
      const isEven = index % 2 === 0;

      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: date })],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
          new TableCell({
            children: [new Paragraph({ text: cost.description })],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
          new TableCell({
            children: [new Paragraph({ text: cost.category || "-" })],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
          new TableCell({
            children: [new Paragraph({ text: cost.actor || "-" })],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
          new TableCell({
            children: [new Paragraph({ text: formatCurrency(amount) })],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
        ],
      });
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph("")], columnSpan: 4 }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `TOTALT: ${formatCurrency(total)}`, bold: true }),
              ],
            }),
          ],
          shading: { fill: COLORS.primary, type: ShadingType.SOLID },
        }),
      ],
    }),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          createHeading("KOSTNADER", HeadingLevel.HEADING_1),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),
          new Paragraph({
            text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
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
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Beskrivning", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Kategori", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Budgeterat", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "Prognos", bold: true })] })],
          shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
        }),
      ],
    }),
    ...budget.map((item, index) => {
      const budgeted = Number(item.budgeted_amount);
      const forecasted = item.forecasted_amount ? Number(item.forecasted_amount) : 0;
      totalBudget += budgeted;
      totalForecast += forecasted;
      const isEven = index % 2 === 0;

      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: item.description })],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
          new TableCell({
            children: [new Paragraph({ text: item.category || "-" })],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
          new TableCell({
            children: [new Paragraph({ text: formatCurrency(budgeted) })],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
          new TableCell({
            children: [
              new Paragraph({ text: forecasted > 0 ? formatCurrency(forecasted) : "-" }),
            ],
            shading: isEven ? { fill: "FFFFFF", type: ShadingType.SOLID } : undefined,
          }),
        ],
      });
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph("")], columnSpan: 2 }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `TOTALT: ${formatCurrency(totalBudget)}`, bold: true }),
              ],
            }),
          ],
          shading: { fill: COLORS.primary, type: ShadingType.SOLID },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: totalForecast > 0 ? formatCurrency(totalForecast) : "-",
                  bold: true,
                }),
              ],
            }),
          ],
          shading: { fill: COLORS.primary, type: ShadingType.SOLID },
        }),
      ],
    }),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          createHeading("BUDGET", HeadingLevel.HEADING_1),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),
          new Paragraph({
            text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
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
    sections: [
      {
        properties: {},
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
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Entreprenör", bold: true })] })],
                    shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: workOrder.contractor || "-" })],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Pris", bold: true })] })],
                    shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: workOrder.price ? formatCurrency(Number(workOrder.price)) : "-",
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Datum", bold: true })] })],
                    shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: workOrder.due_date
                          ? format(new Date(workOrder.due_date), "PPP", { locale: sv })
                          : "-",
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Kvartal", bold: true })] })],
                    shading: { fill: COLORS.lightGray, type: ShadingType.SOLID },
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: workOrder.quarter || "-" })],
                  }),
                ],
              }),
            ],
          }),
          
          new Paragraph({ text: "" }), // Empty line
          
          createHeading("Kommentar", HeadingLevel.HEADING_2),
          new Paragraph({
            text: workOrder.comments || "Ingen kommentar",
            spacing: { after: 200 },
          }),
          
          new Paragraph({
            text: `Genererad: ${format(new Date(), "PPP HH:mm", { locale: sv })}`,
            alignment: AlignmentType.CENTER,
            spacing: { before: 600 },
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}
