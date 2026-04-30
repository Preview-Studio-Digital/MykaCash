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

  // Piso de taxa efetiva: 1,5%. Se o cálculo natural ficar abaixo,
  // usa 1,5% sobre o valor para determinar o valor líquido.
  const MIN_EFFECTIVE_PCT = 1.5;

  let sumPV = 0;
  let sumDaysWeighted = 0;
  let sumValues = 0;
  let factoringCost = 0;
  let maxDays = 0;

  const installmentCalcs: InstallmentCalc[] = input.installments.map((inst) => {
    const days = inst.dueDate ? diffDays(input.operationDate, inst.dueDate) : 0;
    const factor = Math.pow(1 + r, days / 30);
    let pv = (inst.value || 0) / factor;
    // Aplica piso de taxa efetiva por parcela
    const naturalCost = (inst.value || 0) - pv;
    const naturalPct = (inst.value || 0) > 0 ? (naturalCost / (inst.value || 0)) * 100 : 0;
    let effectiveFactor = factor;
    if ((inst.value || 0) > 0 && naturalPct < MIN_EFFECTIVE_PCT) {
      pv = (inst.value || 0) * (1 - MIN_EFFECTIVE_PCT / 100);
      effectiveFactor = (inst.value || 0) / pv;
    }
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
      discountFactor: effectiveFactor,
      presentValue: pv,
    };
  });

  let netValue = sumPV;
  let operationCost = totalInvoice - netValue;
  let effectiveRatePct = totalInvoice > 0 ? (operationCost / totalInvoice) * 100 : 0;
  const averageDays = sumValues > 0 ? sumDaysWeighted / sumValues : 0;

  // Piso adicional no total da operação (caso média ainda fique abaixo)
  let finalInstallmentCalcs = installmentCalcs;
  if (totalInvoice > 0 && effectiveRatePct < MIN_EFFECTIVE_PCT) {
    operationCost = totalInvoice * (MIN_EFFECTIVE_PCT / 100);
    netValue = totalInvoice - operationCost;
    effectiveRatePct = MIN_EFFECTIVE_PCT;
    const scale = sumPV > 0 ? netValue / sumPV : 0;
    finalInstallmentCalcs = installmentCalcs.map((i) => ({
      ...i,
      presentValue: i.presentValue * scale,
    }));
  }

  // Piso adicional na taxa efetiva de factoring (mínimo 1,5%)
  let factoringEffectivePct = totalInvoice > 0 ? (factoringCost / totalInvoice) * 100 : 0;
  if (totalInvoice > 0 && factoringEffectivePct < MIN_EFFECTIVE_PCT) {
    factoringCost = totalInvoice * (MIN_EFFECTIVE_PCT / 100);
  }

  return {
    totalInvoice,
    netValue,
    operationCost,
    effectiveRatePct,
    averageDays,
    maxDays,
    factoringMonthlyRatePct: FACTORING_MONTHLY_RATE_PCT,
    factoringCost,
    installmentCalcs: finalInstallmentCalcs,
  };
};

export const formatBRL = (v: number): string =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatPct = (v: number, digits = 2): string =>
  `${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
