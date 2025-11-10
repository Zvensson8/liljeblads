import { addMonths, startOfMonth, endOfMonth, isWithinInterval, format } from "date-fns";
import { sv } from "date-fns/locale";

export interface RecurringCost {
  id: string;
  description: string;
  amount: number;
  base_interval_months: number;
  interval_variation_months: number;
  last_payment_date: string;
  property: { id: string; name: string };
  account_code: { code: string; description: string };
}

export interface CostProjection {
  date: Date;
  amount: number;
  costId: string;
  description: string;
  property: string;
  accountCode: string;
  isEstimate: boolean; // Om datumet är inom variationsintervallet
}

export interface QuarterSummary {
  quarter: string;
  year: number;
  quarterNum: number;
  total: number;
  properties: Record<string, PropertySummary>;
  startDate: Date;
  endDate: Date;
}

export interface PropertySummary {
  name: string;
  total: number;
  accountCodes: Record<string, AccountCodeSummary>;
}

export interface AccountCodeSummary {
  code: string;
  description: string;
  total: number;
  costs: CostDetail[];
}

export interface CostDetail {
  description: string;
  amount: number;
  dates: Date[];
  hasVariation: boolean;
}

export interface MonthSummary {
  month: string;
  year: number;
  monthNum: number;
  total: number;
  properties: Record<string, PropertySummary>;
  startDate: Date;
  endDate: Date;
}

/**
 * Beräknar alla betalningar för en kostnad inom ett datumintervall
 */
export function calculatePaymentDates(
  cost: RecurringCost,
  startDate: Date,
  endDate: Date
): CostProjection[] {
  const projections: CostProjection[] = [];
  
  if (!cost.last_payment_date) return projections;
  
  let currentDate = new Date(cost.last_payment_date);
  
  // Gå framåt från senaste betalning
  while (currentDate <= endDate) {
    currentDate = addMonths(currentDate, cost.base_interval_months);
    
    if (currentDate >= startDate && currentDate <= endDate) {
      const variationMonths = cost.interval_variation_months || 0;
      
      // Om det finns variation, skapa intervall
      if (variationMonths > 0) {
        const earliestDate = addMonths(currentDate, -variationMonths);
        const latestDate = addMonths(currentDate, variationMonths);
        
        // Använd mittpunkten som betalningsdatum
        projections.push({
          date: currentDate,
          amount: cost.amount,
          costId: cost.id,
          description: cost.description,
          property: cost.property.name,
          accountCode: `${cost.account_code.code} - ${cost.account_code.description}`,
          isEstimate: true,
        });
      } else {
        projections.push({
          date: currentDate,
          amount: cost.amount,
          costId: cost.id,
          description: cost.description,
          property: cost.property.name,
          accountCode: `${cost.account_code.code} - ${cost.account_code.description}`,
          isEstimate: false,
        });
      }
    }
  }
  
  return projections;
}

/**
 * Grupperar projektioner per kvartal
 */
export function groupByQuarter(projections: CostProjection[]): QuarterSummary[] {
  const quarters: Record<string, QuarterSummary> = {};
  
  projections.forEach((projection) => {
    const quarter = getQuarter(projection.date);
    const year = projection.date.getFullYear();
    const quarterNum = Math.floor(projection.date.getMonth() / 3) + 1;
    const quarterKey = `${year}-Q${quarterNum}`;
    
    if (!quarters[quarterKey]) {
      quarters[quarterKey] = {
        quarter: quarterKey,
        year,
        quarterNum,
        total: 0,
        properties: {},
        startDate: getQuarterStart(year, quarterNum),
        endDate: getQuarterEnd(year, quarterNum),
      };
    }
    
    const q = quarters[quarterKey];
    q.total += projection.amount;
    
    // Gruppera per fastighet
    if (!q.properties[projection.property]) {
      q.properties[projection.property] = {
        name: projection.property,
        total: 0,
        accountCodes: {},
      };
    }
    
    const prop = q.properties[projection.property];
    prop.total += projection.amount;
    
    // Gruppera per konto
    if (!prop.accountCodes[projection.accountCode]) {
      prop.accountCodes[projection.accountCode] = {
        code: projection.accountCode.split(" - ")[0],
        description: projection.accountCode.split(" - ")[1],
        total: 0,
        costs: [],
      };
    }
    
    const acc = prop.accountCodes[projection.accountCode];
    acc.total += projection.amount;
    
    // Hitta eller skapa kostnadspost
    let costDetail = acc.costs.find((c) => c.description === projection.description);
    if (!costDetail) {
      costDetail = {
        description: projection.description,
        amount: projection.amount,
        dates: [],
        hasVariation: projection.isEstimate,
      };
      acc.costs.push(costDetail);
    }
    costDetail.dates.push(projection.date);
  });
  
  return Object.values(quarters).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.quarterNum - b.quarterNum;
  });
}

/**
 * Grupperar projektioner per månad
 */
export function groupByMonth(projections: CostProjection[]): MonthSummary[] {
  const months: Record<string, MonthSummary> = {};
  
  projections.forEach((projection) => {
    const year = projection.date.getFullYear();
    const monthNum = projection.date.getMonth() + 1;
    const monthKey = `${year}-${monthNum.toString().padStart(2, "0")}`;
    
    if (!months[monthKey]) {
      months[monthKey] = {
        month: format(projection.date, "MMMM yyyy", { locale: sv }),
        year,
        monthNum,
        total: 0,
        properties: {},
        startDate: startOfMonth(projection.date),
        endDate: endOfMonth(projection.date),
      };
    }
    
    const m = months[monthKey];
    m.total += projection.amount;
    
    // Gruppera per fastighet
    if (!m.properties[projection.property]) {
      m.properties[projection.property] = {
        name: projection.property,
        total: 0,
        accountCodes: {},
      };
    }
    
    const prop = m.properties[projection.property];
    prop.total += projection.amount;
    
    // Gruppera per konto
    if (!prop.accountCodes[projection.accountCode]) {
      prop.accountCodes[projection.accountCode] = {
        code: projection.accountCode.split(" - ")[0],
        description: projection.accountCode.split(" - ")[1],
        total: 0,
        costs: [],
      };
    }
    
    const acc = prop.accountCodes[projection.accountCode];
    acc.total += projection.amount;
    
    // Hitta eller skapa kostnadspost
    let costDetail = acc.costs.find((c) => c.description === projection.description);
    if (!costDetail) {
      costDetail = {
        description: projection.description,
        amount: projection.amount,
        dates: [],
        hasVariation: projection.isEstimate,
      };
      acc.costs.push(costDetail);
    }
    costDetail.dates.push(projection.date);
  });
  
  return Object.values(months).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.monthNum - b.monthNum;
  });
}

/**
 * Hjälpfunktioner för datum
 */
function getQuarter(date: Date): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
}

function getQuarterStart(year: number, quarter: number): Date {
  return new Date(year, (quarter - 1) * 3, 1);
}

function getQuarterEnd(year: number, quarter: number): Date {
  return endOfMonth(new Date(year, quarter * 3 - 1, 1));
}

/**
 * Beräknar årlig total för en kostnad
 */
export function calculateAnnualCost(cost: RecurringCost): number {
  const paymentsPerYear = 12 / cost.base_interval_months;
  return cost.amount * paymentsPerYear;
}

/**
 * Beräknar månadskostnad (genomsnitt)
 */
export function calculateMonthlyCost(cost: RecurringCost): number {
  return calculateAnnualCost(cost) / 12;
}

/**
 * Genererar prognosdata för diagram
 */
export function generateForecastData(
  costs: RecurringCost[],
  yearsAhead: number = 5
): { month: string; amount: number }[] {
  const startDate = new Date();
  const endDate = addMonths(startDate, yearsAhead * 12);
  
  const allProjections: CostProjection[] = [];
  costs.forEach((cost) => {
    const projections = calculatePaymentDates(cost, startDate, endDate);
    allProjections.push(...projections);
  });
  
  const monthlyData = groupByMonth(allProjections);
  
  return monthlyData.map((m) => ({
    month: m.month,
    amount: m.total,
  }));
}
