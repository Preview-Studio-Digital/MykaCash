import { useEffect, useMemo, useRef, useState } from "react";
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
import { Installment, calculate, formatBRL, formatPct } from "@/lib/calc";
import { ResultPanels } from "@/components/ResultPanels";
import { CalcMemory } from "@/components/CalcMemory";
import { DateField } from "@/components/DateField";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import html2canvas from "html2canvas";

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (baseISO: string, days: number) => {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const RegistrationSection = () => {
  const { clients, addClient, removeClient } = useClients();

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
    if (!newClientDoc.trim()) {
      toast.error("Informe o CNPJ ou CPF do cliente");
      return;
    }
    const c = await addClient(newClientName.trim(), newClientDoc.trim());
    if (c) {
      setClientId(c.id);
      setNewClientOpen(false);
      setNewClientName("");
      setNewClientDoc("");
    }
  };

  const archiveRef = useRef<HTMLDivElement>(null);

  const generateArchivePng = async (clientName: string) => {
    const node = archiveRef.current;
    if (!node) return;
    // Temporarily make it visible for rendering
    const prev = node.style.cssText;
    node.style.cssText = "position:fixed;left:-10000px;top:0;width:1000px;background:#ffffff;";
    try {
      const canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: 2 });
      const link = document.createElement("a");
      const safeClient = clientName.replace(/[^a-z0-9]+/gi, "_");
      link.download = `operacao_${safeClient}_NF${invoiceNumber.trim()}_${operationDate}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      node.style.cssText = prev;
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
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    const clientName = clients.find((c) => c.id === clientId)?.name ?? "cliente";
    try {
      await generateArchivePng(clientName);
      toast.success("Operação salva e arquivo PNG gerado");
    } catch (e) {
      toast.success("Operação salva (falha ao gerar PNG)");
    }
    setSaving(false);
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
                    <DialogTitle className="font-display">Gerenciar clientes</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Nome / Razão social</Label>
                      <Input
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value.toUpperCase())}
                        style={{ textTransform: "uppercase" }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>CNPJ / CPF</Label>
                      <Input
                        value={newClientDoc}
                        onChange={(e) => setNewClientDoc(e.target.value.toUpperCase())}
                        style={{ textTransform: "uppercase" }}
                        required
                      />
                    </div>

                    {clients.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <Label className="text-xs font-mono tracking-widest text-muted-foreground">
                          CLIENTES CADASTRADOS ({clients.length})
                        </Label>
                        <div className="max-h-48 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/40">
                          {clients.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{c.name}</div>
                                {c.document && (
                                  <div className="truncate text-xs text-muted-foreground font-mono">
                                    {c.document}
                                  </div>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-cost-red h-8 w-8"
                                aria-label={`Remover ${c.name}`}
                                onClick={async () => {
                                  if (!confirm(`Remover "${c.name}"?`)) return;
                                  const ok = await removeClient(c.id);
                                  if (ok && clientId === c.id) setClientId("");
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                R$
              </span>
              <Input
                inputMode="numeric"
                value={(invoiceValue || 0).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  const n = digits ? parseInt(digits, 10) / 100 : 0;
                  setInvoiceValue(n);
                }}
                placeholder="0,00"
                className="pl-10 font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Data da operação</Label>
            <DateField value={operationDate} onChange={setOperationDate} />
          </div>

          <div className="space-y-2">
            <Label>Taxa mensal (%)</Label>
            <Input
              inputMode="numeric"
              value={(monthlyRate || 0).toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                const n = digits ? parseInt(digits, 10) / 100 : 0;
                setMonthlyRate(n);
              }}
              placeholder="0,00"
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
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                    R$
                  </span>
                  <Input
                    inputMode="numeric"
                    value={(inst.value || 0).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      const n = digits ? parseInt(digits, 10) / 100 : 0;
                      updateInstallmentValue(inst.id, n);
                    }}
                    placeholder="0,00"
                    className="pl-10 font-mono"
                  />
                </div>
                <DateField
                  value={inst.dueDate}
                  onChange={(iso) => updateInstallmentDate(inst.id, iso)}
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

        </div>
      </section>

      <ResultPanels result={result} monthlyRate={monthlyRate} />

      <CalcMemory
        result={result}
        monthlyRate={monthlyRate}
        operationDate={operationDate}
      />

      <div className="flex justify-center">
        <Button
          onClick={handleSaveInvoice}
          disabled={saving}
          size="lg"
          className="font-display tracking-wide"
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando..." : "CADASTRAR E EXPORTAR"}
        </Button>
      </div>

      {/* Offscreen archive document for PNG export */}
      <div
        ref={archiveRef}
        style={{ position: "fixed", left: "-10000px", top: 0, width: "1000px", background: "#ffffff" }}
        aria-hidden
      >
        <div style={{ padding: "48px", color: "#0a0a0a", fontFamily: "Arial, sans-serif" }}>
          <div style={{ borderBottom: "2px solid #0a0a0a", paddingBottom: "16px", marginBottom: "24px" }}>
            <div style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "0.08em" }}>
              MYKA COMPRESSORES DO BRASIL
            </div>
            <div style={{ fontSize: "12px", color: "#555", marginTop: "4px", letterSpacing: "0.2em" }}>
              REGISTRO DE OPERAÇÃO · PREVIEW STUDIO DIGITAL
            </div>
          </div>

          <table style={{ width: "100%", fontSize: "13px", marginBottom: "24px", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "6px 0", color: "#555", width: "30%" }}>Cliente</td>
                <td style={{ padding: "6px 0", fontWeight: 600 }}>
                  {clients.find((c) => c.id === clientId)?.name ?? "-"}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "6px 0", color: "#555" }}>Nota Fiscal</td>
                <td style={{ padding: "6px 0", fontWeight: 600 }}>{invoiceNumber || "-"}</td>
              </tr>
              <tr>
                <td style={{ padding: "6px 0", color: "#555" }}>Data da operação</td>
                <td style={{ padding: "6px 0", fontWeight: 600 }}>
                  {new Date(operationDate + "T00:00:00").toLocaleDateString("pt-BR")}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "6px 0", color: "#555" }}>Taxa mensal</td>
                <td style={{ padding: "6px 0", fontWeight: 600 }}>{formatPct(monthlyRate)}</td>
              </tr>
            </tbody>
          </table>

          <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse", marginBottom: "20px" }}>
            <thead>
              <tr style={{ background: "#f1f1f1" }}>
                <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>#</th>
                <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>VENCIMENTO</th>
                <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>DIAS</th>
                <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>VALOR</th>
                <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>VP</th>
              </tr>
            </thead>
            <tbody>
              {result.installmentCalcs.map((i, idx) => (
                <tr key={i.id}>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{idx + 1}</td>
                  <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                    {i.dueDate ? new Date(i.dueDate + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>{i.days}</td>
                  <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {formatBRL(i.value)}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {formatBRL(i.presentValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse", marginBottom: "40px" }}>
            <tbody>
              <tr>
                <td style={{ padding: "6px 0", color: "#555" }}>Valor total da nota</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700 }}>
                  {formatBRL(result.totalInvoice)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "6px 0", color: "#555" }}>Valor líquido a receber</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700, color: "#0a7a3a" }}>
                  {formatBRL(result.netValue)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "6px 0", color: "#555" }}>Custo da operação</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700, color: "#b02a2a" }}>
                  {formatBRL(result.operationCost)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "6px 0", color: "#555" }}>Taxa efetiva</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700 }}>
                  {formatPct(result.effectiveRatePct)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "6px 0", color: "#555" }}>Prazo médio ponderado</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700 }}>
                  {result.averageDays.toFixed(1)} dias
                </td>
              </tr>
              <tr>
                <td style={{ padding: "6px 0", color: "#555" }}>
                  Custo factoring ({formatPct(result.factoringMonthlyRatePct)}/mês)
                </td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700 }}>
                  {formatBRL(result.factoringCost)}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", marginTop: "80px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #0a0a0a", paddingTop: "8px", fontSize: "12px", fontWeight: 600 }}>
                MYKA COMPRESSORES DO BRASIL
              </div>
              <div style={{ fontSize: "10px", color: "#666", marginTop: "4px", letterSpacing: "0.15em" }}>
                ASSINATURA · CARIMBO
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #0a0a0a", paddingTop: "8px", fontSize: "12px", fontWeight: 600 }}>
                PREVIEW STUDIO DIGITAL
              </div>
              <div style={{ fontSize: "10px", color: "#666", marginTop: "4px", letterSpacing: "0.15em" }}>
                ASSINATURA · CARIMBO
              </div>
            </div>
          </div>

          <div style={{ marginTop: "48px", textAlign: "center", fontSize: "10px", color: "#888", letterSpacing: "0.3em" }}>
            SMART MONEY · DOCUMENTO GERADO EM {new Date().toLocaleString("pt-BR")}
          </div>
        </div>
      </div>
    </div>
  );
};
