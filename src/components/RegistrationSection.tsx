import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, UserPlus, Save } from "lucide-react";
import { useClients } from "@/hooks/useClients";
import { Installment, calculate, formatBRL } from "@/lib/calc";
import { ResultPanels } from "@/components/ResultPanels";
import { CalcMemory } from "@/components/CalcMemory";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (baseISO: string, days: number) => {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const RegistrationSection = () => {
  const { clients, addClient } = useClients();

  const [clientId, setClientId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceValue, setInvoiceValue] = useState<number>(0);
  const [operationDate, setOperationDate] = useState<string>(todayISO());
  const [monthlyRate, setMonthlyRate] = useState<number>(3.0);
  const [installments, setInstallments] = useState<Installment[]>([
    { id: uid(), value: 0, dueDate: addDaysISO(todayISO(), 30) },
  ]);

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientDoc, setNewClientDoc] = useState("");

  const [saving, setSaving] = useState(false);

  // Reset installment when invoice value changes and single installment is untouched
  useEffect(() => {
    if (installments.length === 1) {
      setInstallments([{ ...installments[0], value: invoiceValue }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceValue]);

  const totalAllocated = useMemo(
    () => installments.reduce((s, i) => s + (Number(i.value) || 0), 0),
    [installments]
  );
  const remaining = Math.max(0, (invoiceValue || 0) - totalAllocated);

  const canAddInstallment =
    invoiceValue > 0 &&
    totalAllocated < invoiceValue &&
    installments.every((i) => (i.value || 0) > 0);

  const updateInstallmentValue = (id: string, raw: number) => {
    setInstallments((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return prev;
      const othersTotal = prev.reduce((s, i) => (i.id === id ? s : s + (i.value || 0)), 0);
      const max = Math.max(0, invoiceValue - othersTotal);
      const value = Math.min(Math.max(0, raw || 0), max);
      const next = [...prev];
      next[idx] = { ...next[idx], value };
      return next;
    });
  };

  const updateInstallmentDate = (id: string, dueDate: string) => {
    setInstallments((prev) => prev.map((i) => (i.id === id ? { ...i, dueDate } : i)));
  };

  const addInstallment = () => {
    if (!canAddInstallment) return;
    const lastDate = installments[installments.length - 1]?.dueDate ?? operationDate;
    setInstallments((prev) => [
      ...prev,
      { id: uid(), value: remaining, dueDate: addDaysISO(lastDate, 30) },
    ]);
  };

  const removeInstallment = (id: string) => {
    setInstallments((prev) => (prev.length <= 1 ? prev : prev.filter((i) => i.id !== id)));
  };

  const result = useMemo(
    () => calculate({ invoiceValue, operationDate, monthlyRate, installments }),
    [invoiceValue, operationDate, monthlyRate, installments]
  );

  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    const c = await addClient(newClientName.trim(), newClientDoc.trim() || null);
    if (c) {
      setClientId(c.id);
      setNewClientOpen(false);
      setNewClientName("");
      setNewClientDoc("");
    }
  };

  const handleSaveInvoice = async () => {
    if (!clientId) return toast.error("Selecione um cliente");
    if (!invoiceNumber.trim()) return toast.error("Informe o número da nota");
    if (invoiceValue <= 0) return toast.error("Informe o valor da nota");
    if (Math.abs(totalAllocated - invoiceValue) > 0.01)
      return toast.error("Soma das parcelas deve ser igual ao valor da nota");

    setSaving(true);
    const { error } = await supabase.from("invoices").insert({
      client_id: clientId,
      invoice_number: invoiceNumber.trim(),
      invoice_value: invoiceValue,
      operation_date: operationDate,
      monthly_rate: monthlyRate,
      installments: installments as any,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Operação salva no sistema");
    setInvoiceNumber("");
  };

  return (
    <div className="space-y-8">
      {/* Form card */}
      <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
            <h2 className="font-display text-xl font-semibold tracking-tight">Cadastro</h2>
          </div>
          <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
            OPERAÇÃO · {result.maxDays} DIAS
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-2">
            <Label>Cliente</Label>
            <div className="flex gap-2">
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Nenhum cliente. Cadastre um ao lado.
                    </div>
                  ) : (
                    clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Novo cliente">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-display">Novo cliente</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Nome / Razão social</Label>
                      <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>CNPJ / CPF (opcional)</Label>
                      <Input value={newClientDoc} onChange={(e) => setNewClientDoc(e.target.value)} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreateClient}>Cadastrar cliente</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Número da Nota Fiscal</Label>
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Ex.: 000123"
            />
          </div>

          <div className="space-y-2">
            <Label>Valor da Nota Fiscal</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={invoiceValue ? invoiceValue.toFixed(2) : ""}
              onChange={(e) => setInvoiceValue(parseFloat(e.target.value) || 0)}
              placeholder="0,00"
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label>Data da operação</Label>
            <Input
              type="date"
              value={operationDate}
              onChange={(e) => setOperationDate(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label>Taxa mensal (%)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={monthlyRate}
              onChange={(e) => setMonthlyRate(parseFloat(e.target.value) || 0)}
              className="font-mono"
            />
          </div>
        </div>

        {/* Installments */}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <Label className="text-sm font-display tracking-tight">
              Parcelas ({installments.length})
            </Label>
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
              RESTANTE: <span className="text-primary-glow">{formatBRL(remaining)}</span>
            </span>
          </div>

          <div className="space-y-2">
            {installments.map((inst, idx) => (
              <div
                key={inst.id}
                className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-3 rounded-lg border border-border/50 bg-background/40 p-3"
              >
                <span className="font-mono text-xs tracking-widest text-muted-foreground w-14">
                  {idx === 0 && installments.length === 1 ? "ÚNICA" : `P ${String(idx + 1).padStart(2, "0")}`}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={inst.value || ""}
                  onChange={(e) => updateInstallmentValue(inst.id, parseFloat(e.target.value) || 0)}
                  placeholder="Valor"
                  className="font-mono"
                />
                <Input
                  type="date"
                  value={inst.dueDate}
                  onChange={(e) => updateInstallmentDate(inst.id, e.target.value)}
                  className="font-mono"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={installments.length <= 1}
                  onClick={() => removeInstallment(inst.id)}
                  aria-label="Remover parcela"
                  className="text-muted-foreground hover:text-cost-red"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canAddInstallment}
            onClick={addInstallment}
            className="mt-3 font-mono tracking-wider"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            ADICIONAR PARCELA
          </Button>

          <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground">
            Novas parcelas aparecem somente se a parcela única for menor que o valor da nota. A próxima parcela é pré-preenchida com o valor restante e limitada ao total da nota.
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSaveInvoice} disabled={saving} className="font-display tracking-wide">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando..." : "Salvar operação"}
          </Button>
        </div>
      </section>

      <ResultPanels result={result} />

      <CalcMemory result={result} monthlyRate={monthlyRate} />
    </div>
  );
};
