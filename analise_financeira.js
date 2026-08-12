import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wzxrhkjyxpphrclravfz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: invoices, error } = await supabase.from('invoices').select('*');
  if (error) {
    console.error("Error fetching:", error);
    process.exit(1);
  }

  const todayStr = "2026-06-16";

  let openBalance = 0;
  let weightedDaysSum = 0;
  let totalInstallmentValue = 0;
  let maxOpenExitDate = "";

  for (const inv of invoices) {
    const installments = Array.isArray(inv.installments) ? inv.installments : [];
    const settledEntries = Array.isArray(inv.settled_installments) ? inv.settled_installments : [];
    
    const settledMap = new Map();
    for (const e of settledEntries) {
      const id = typeof e === 'string' ? e : e.id;
      const date = typeof e === 'string' ? null : e.date;
      settledMap.set(id, date);
    }

    for (const i of installments) {
      const isSettled = settledMap.has(i.id);
      
      // Prazo médio ponderado de todas as notas emitidas (histórico inteiro)
      // Base: dias entre operation_date e dueDate
      const d1 = new Date(inv.operation_date + "T00:00:00").getTime();
      const d2 = new Date(i.dueDate + "T00:00:00").getTime();
      const days = Math.round((d2 - d1) / 86400000);
      
      weightedDaysSum += (days * i.value);
      totalInstallmentValue += i.value;

      // Calcular saldo aberto (considerando apenas o valor das parcelas não liquidadas)
      if (!isSettled) {
        openBalance += i.value;
        const setDate = i.dueDate;
        if (setDate > maxOpenExitDate) {
          maxOpenExitDate = setDate;
        }
      }
    }
  }

  const averageDays = totalInstallmentValue > 0 ? (weightedDaysSum / totalInstallmentValue) : 0;
  
  let currentLiquidationDays = 0;
  if (maxOpenExitDate && maxOpenExitDate > todayStr) {
    const d1 = new Date(todayStr + "T00:00:00").getTime();
    const d2 = new Date(maxOpenExitDate + "T00:00:00").getTime();
    currentLiquidationDays = Math.round((d2 - d1) / 86400000);
  }

  const dailySpeed = currentLiquidationDays > 0 ? (openBalance / currentLiquidationDays) : 0;
  const timeDistortion = averageDays - currentLiquidationDays;
  const recommendedLoanPartial = timeDistortion > 0 ? (dailySpeed * timeDistortion) : 0;

  console.log(JSON.stringify({
    openBalance,
    averageDays: Math.round(averageDays),
    currentLiquidationDays,
    dailySpeed,
    timeDistortion: Math.round(timeDistortion),
    recommendedLoanPartial,
    maxOpenExitDate
  }, null, 2));
}

main();
