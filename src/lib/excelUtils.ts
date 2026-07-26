import ExcelJS from 'exceljs';

/**
 * Utility functions for Excel file generation using ExcelJS
 * Replaces vulnerable xlsx package with secure ExcelJS alternative
 */

export type ExcelCellValue = string | number | boolean | Date | null | undefined;

export interface ExcelSheetData {
  name: string;
  data: ExcelCellValue[][];
}

export interface ExcelJsonSheetData {
  name: string;
  data: Record<string, unknown>[];
}

/**
 * Create a workbook with array-of-arrays data (like XLSX.utils.aoa_to_sheet)
 */
export async function createWorkbookFromAoA(sheets: ExcelSheetData[]): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name.substring(0, 31)); // Excel sheet name limit
    
    sheet.data.forEach((row) => {
      worksheet.addRow(row);
    });
    
    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const cellValue = cell.value?.toString() || '';
        maxLength = Math.max(maxLength, cellValue.length);
      });
      column.width = Math.min(maxLength + 2, 50);
    });
  }
  
  return workbook;
}

/**
 * Create a workbook with JSON data (like XLSX.utils.json_to_sheet)
 */
export async function createWorkbookFromJson(sheets: ExcelJsonSheetData[]): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name.substring(0, 31));
    
    if (sheet.data.length === 0) continue;
    
    // Extract headers from first object
    const headers = Object.keys(sheet.data[0]);
    worksheet.addRow(headers);
    
    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE7E7E7' }
    };
    
    // Add data rows
    sheet.data.forEach((item) => {
      const row = headers.map((header) => item[header] ?? '-');
      worksheet.addRow(row);
    });
    
    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      let maxLength = headers[index]?.length || 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const cellValue = cell.value?.toString() || '';
        maxLength = Math.max(maxLength, cellValue.length);
      });
      column.width = Math.min(maxLength + 2, 50);
    });
  }
  
  return workbook;
}

/**
 * Add a sheet with array-of-arrays data to existing workbook
 */
export function addAoASheet(workbook: ExcelJS.Workbook, sheetName: string, data: ExcelCellValue[][]): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet(sheetName.substring(0, 31));
  
  data.forEach((row) => {
    worksheet.addRow(row);
  });
  
  // Auto-fit columns
  worksheet.columns.forEach((column) => {
    let maxLength = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value?.toString() || '';
      maxLength = Math.max(maxLength, cellValue.length);
    });
    column.width = Math.min(maxLength + 2, 50);
  });
  
  return worksheet;
}

/**
 * Add a sheet with JSON data to existing workbook
 */
export function addJsonSheet(workbook: ExcelJS.Workbook, sheetName: string, data: Record<string, unknown>[]): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet(sheetName.substring(0, 31));
  
  if (data.length === 0) return worksheet;
  
  // Extract headers from first object
  const headers = Object.keys(data[0]);
  worksheet.addRow(headers);
  
  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE7E7E7' }
  };
  
  // Add data rows
  data.forEach((item) => {
    const row = headers.map((header) => item[header] ?? '-');
    worksheet.addRow(row);
  });
  
  // Auto-fit columns
  worksheet.columns.forEach((column, index) => {
    let maxLength = headers[index]?.length || 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value?.toString() || '';
      maxLength = Math.max(maxLength, cellValue.length);
    });
    column.width = Math.min(maxLength + 2, 50);
  });
  
  return worksheet;
}

/**
 * Download workbook as Excel file
 */
export async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Create a new empty workbook
 */
export function createWorkbook(): ExcelJS.Workbook {
  return new ExcelJS.Workbook();
}
