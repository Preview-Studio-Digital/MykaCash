export type Installment = {
  id: string;
  value: number;
  dueDate: string; // ISO yyyy-mm-dd
};

export type CalcInput = {
  invoiceValue: number;
  operationDate: string; // yyyy-mm-dd
  monthlyRate: number; // percent e.g. 2.5 means 2.5%/month
  installments: Installment[];
};

export type InstallmentCalc = {
  id: string;
  value: number;
  dueDate: string;
  days: number;
  discountFactor: number; // (1 + r)^(days/30)
  presentValue: number;
};

export type CalcResult = {
  totalInvoice: number;
  netValue: number;
  operationCost: number;
  effectiveRatePct: number; // cost / total * 100
  averageDays: number;
  maxDays: number;
  factoringMonthlyRatePct: number; // 3.74
  factoringCost: number;
  installmentCalcs: InstallmentCalc[];
};

export const FACTORING_MONTHLY_RATE_PCT = 3.74;

const diffDays = (from: string, to: string): number => {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
};

export const calculate = (input: CalcInput): CalcResult => {
  const r = (input.monthlyRate || 0) / 100;
  const rFactoring = FACTORING_MONTHLY_RATE_PCT / 100;

  const totalInvoice = input.installments.reduce((s, i) => s + (i.value || 0), 0) || input.invoiceValue;

  let sumPV = 0;
  let sumDaysWeighted = 0;
  let sumValues = 0;
  let factoringCost = 0;
  let maxDays = 0;

  const installmentCalcs: InstallmentCalc[] = input.installments.map((inst) => {
    const days = inst.dueDate ? diffDays(input.operationDate, inst.dueDate) : 0;
    const factor = Math.pow(1 + r, days / 30);
    const pv = (inst.value || 0) / factor;
    sumPV += pv;
    sumDaysWeighted += days * (inst.value || 0);
    sumValues += inst.value || 0;
    factoringCost += (inst.value || 0) * rFactoring * (days / 30);
    if (days > maxDays) maxDays = days;
    return {
      id: inst.id,
      value: inst.value || 0,
      dueDate: inst.dueDate,
      days,
      discountFactor: factor,
      presentValue: pv,
    };
  });

  const netValue = sumPV;
  const operationCost = totalInvoice - netValue;
  const averageDays = sumValues > 0 ? sumDaysWeighted / sumValues : 0;
  const effectiveRatePct = totalInvoice > 0 ? (operationCost / totalInvoice) * 100 : 0;

  return {
    totalInvoice,
    netValue,
    operationCost,
    effectiveRatePct,
    averageDays,
    maxDays,
    factoringMonthlyRatePct: FACTORING_MONTHLY_RATE_PCT,
    factoringCost,
    installmentCalcs,
  };
};

export const formatBRL = (v: number): string =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatPct = (v: number, digits = 2): string =>
  `${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
