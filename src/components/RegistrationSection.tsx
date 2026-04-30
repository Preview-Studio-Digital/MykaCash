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
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { FACTORING_MONTHLY_RATE_PCT } from "@/lib/calc";

const uid = () => Math.random().toString(36).slice(2, 10);
const formatCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  let out = digits;
  if (digits.length > 2) out = digits.slice(0, 2) + "." + digits.slice(2);
  if (digits.length > 5) out = out.slice(0, 6) + "." + out.slice(6);
  if (digits.length > 8) out = out.slice(0, 10) + "/" + out.slice(10);
  if (digits.length > 12) out = out.slice(0, 15) + "-" + out.slice(15);
  return out;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (baseISO: string, days: number) => {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const RegistrationSection = ({
  invoiceToEdit,
  onSaveSuccess,
  onCancel,
}: {
  invoiceToEdit?: {
    id: string;
    client_id: string;
    invoice_number: string;
    invoice_value: number;
    operation_date: string;
    monthly_rate: number;
    factoring_monthly_rate: number | null;
    installments: Installment[];
  };
  onSaveSuccess?: (updated?: any) => void;
  onCancel?: () => void;
} = {}) => {
  const { clients, addClient, removeClient } = useClients();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [clientId, setClientId] = useState<string>(invoiceToEdit?.client_id || "");
  const [invoiceNumber, setInvoiceNumber] = useState(invoiceToEdit?.invoice_number || "");
  const [invoiceValue, setInvoiceValue] = useState<number>(invoiceToEdit?.invoice_value || 0);
  const [operationDate, setOperationDate] = useState<string>(invoiceToEdit?.operation_date || todayISO());
  const [monthlyRate, setMonthlyRate] = useState<number>(invoiceToEdit?.monthly_rate || 3.0);
  const [installments, setInstallments] = useState<Installment[]>(
    invoiceToEdit?.installments || [{ id: uid(), value: 0, dueDate: addDaysISO(todayISO(), 30) }]
  );

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientDoc, setNewClientDoc] = useState("");

  const [saving, setSaving] = useState(false);

  // Single installment mirrors the invoice value and operation date + 30 days
  useEffect(() => {
    if (installments.length === 1 && !invoiceToEdit) {
      setInstallments([
        { ...installments[0], value: invoiceValue, dueDate: addDaysISO(operationDate, 30) },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceValue, operationDate]);

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
      const before = prev.slice(0, idx);
      const beforeSum = before.reduce((s, i) => s + (i.value || 0), 0);
      const maxForThis = Math.max(0, invoiceValue - beforeSum);
      const value = Math.min(Math.max(0, raw || 0), maxForThis);

      const afterCount = prev.length - idx - 1;
      const remainingAfter = Math.max(0, invoiceValue - beforeSum - value);

      const next = [...prev];
      next[idx] = { ...next[idx], value };

      if (afterCount > 0) {
        const share = Math.floor((remainingAfter * 100) / afterCount) / 100;
        const lastExtra = +(remainingAfter - share * (afterCount - 1)).toFixed(2);
        for (let k = 0; k < afterCount; k++) {
          const pos = idx + 1 + k;
          next[pos] = {
            ...next[pos],
            value: k === afterCount - 1 ? lastExtra : share,
          };
        }
      }
      return next;
    });
  };

  const updateInstallmentDate = (id: string, dueDate: string) => {
    setInstallments((prev) => prev.map((i) => (i.id === id ? { ...i, dueDate } : i)));
  };

  const addInstallment = () => {
    if (invoiceValue <= 0) return;
    setInstallments((prev) => {
      const newCount = prev.length + 1;
      const equalShare = Math.floor((invoiceValue * 100) / newCount) / 100;
      const remainder = +(invoiceValue - equalShare * (newCount - 1)).toFixed(2);
      return Array.from({ length: newCount }, (_, idx) => ({
        id: prev[idx]?.id ?? uid(),
        value: idx === newCount - 1 ? remainder : equalShare,
        dueDate: addDaysISO(operationDate, 30 * (idx + 1)),
      }));
    });
  };

  const removeInstallment = (id: string) => {
    setInstallments((prev) => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter((i) => i.id !== id);
      const count = filtered.length;
      const equalShare = Math.floor((invoiceValue * 100) / count) / 100;
      const remainder = +(invoiceValue - equalShare * (count - 1)).toFixed(2);
      return filtered.map((i, idx) => ({
        ...i,
        value: idx === count - 1 ? remainder : equalShare,
        dueDate: addDaysISO(operationDate, 30 * (idx + 1)),
      }));
    });
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
    const cnpjDigits = newClientDoc.replace(/\D/g, "");
    if (cnpjDigits.length !== 14) {
      toast.error("Informe um CNPJ válido (14 dígitos)");
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
    node.style.cssText = "position:fixed;left:-10000px;top:0;width:1100px;background:#0b0f1a;";
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
    
    const invoiceData = {
      client_id: clientId,
      invoice_number: invoiceNumber.trim(),
      invoice_value: invoiceValue,
      operation_date: operationDate,
      monthly_rate: monthlyRate,
      installments: installments as any,
      factoring_monthly_rate: invoiceToEdit?.factoring_monthly_rate ?? FACTORING_MONTHLY_RATE_PCT,
    };

    let error;
    if (invoiceToEdit) {
      const res = await supabase.from("invoices").update(invoiceData).eq("id", invoiceToEdit.id);
      error = res.error;
    } else {
      const res = await supabase.from("invoices").insert({
        ...invoiceData,
        created_by: user?.id ?? null,
      });
      error = res.error;
    }

    if (error) {
      setSaving(false);
      const { friendlyDbError } = await import("@/lib/dbErrors");
      return toast.error(friendlyDbError(error, invoiceToEdit ? "Erro ao atualizar abertura" : "Erro ao salvar abertura"));
    }
    const clientName = clients.find((c) => c.id === clientId)?.name ?? "cliente";
    try {
      await generateArchivePng(clientName);
      toast.success(invoiceToEdit ? "Abertura atualizada e arquivo PNG gerado" : "Abertura salva e arquivo PNG gerado");
    } catch (e) {
      toast.success(invoiceToEdit ? "Abertura atualizada (falha ao gerar PNG)" : "Abertura salva (falha ao gerar PNG)");
    }
    setSaving(false);
    
    if (onSaveSuccess) {
      onSaveSuccess({ ...invoiceData, id: invoiceToEdit?.id });
    } else {
      setInvoiceNumber("");
      navigate("/historico");
    }
  };

  return (
    <div className="space-y-8">
      {/* Form card */}
      <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
            <h2 className="font-display text-xl font-semibold tracking-tight">{invoiceToEdit ? "Edição" : "Cadastro"}</h2>
          </div>
          <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
            {invoiceToEdit ? "EDITAR ABERTURA" : "ABERTURA"}
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
                      <Label>Razão social</Label>
                      <Input
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value.toUpperCase())}
                        style={{ textTransform: "uppercase" }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>CNPJ</Label>
                      <Input
                        value={newClientDoc}
                        onChange={(e) => setNewClientDoc(formatCNPJ(e.target.value))}
                        placeholder="XX.XXX.XXX/XXXX-XX"
                        inputMode="numeric"
                        maxLength={18}
                        className="font-mono"
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
            <Label>Data da abertura</Label>
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
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
              <Label className="text-xl font-display font-semibold tracking-tight">
                Pagamento
              </Label>
            </div>
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground invisible">
              RESTANTE: <span className="text-primary-glow">{formatBRL(remaining)}</span>
            </span>
          </div>

          <div className="space-y-2">
            {installments.map((inst, idx) => (
              <div
                key={inst.id}
                className="grid grid-cols-[1fr_1fr_2.5rem] items-end gap-3 rounded-lg border border-border/50 bg-background/40 p-3"
              >
                <div className="space-y-1">
                  <span className="block font-mono text-[9px] tracking-[0.25em] text-muted-foreground">
                    {installments.length === 1 ? "PARCELA ÚNICA" : `PARCELA ${idx + 1}`}
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
                </div>
                <div className="space-y-1">
                  <span className="block font-mono text-[9px] tracking-[0.25em] text-muted-foreground">
                    DATA DE VENCIMENTO
                  </span>
                  <DateField
                    value={inst.dueDate}
                    onChange={(iso) => updateInstallmentDate(inst.id, iso)}
                  />
                </div>
                <div className="space-y-1">
                  <span className="block font-mono text-[9px] tracking-[0.25em] text-muted-foreground opacity-0">
                    .
                  </span>
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
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={invoiceValue <= 0}
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

      <div className="flex justify-center gap-4">
        {onCancel && (
          <Button onClick={onCancel} variant="outline" disabled={saving} size="lg" className="font-display tracking-wide">
            CANCELAR
          </Button>
        )}
        <Button
          onClick={handleSaveInvoice}
          disabled={saving}
          size="lg"
          className="font-display tracking-wide"
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando..." : invoiceToEdit ? "SALVAR ALTERAÇÕES" : "CADASTRAR E EXPORTAR"}
        </Button>
      </div>

      {/* Offscreen archive document for PNG export */}
      <div
        ref={archiveRef}
        style={{ position: "fixed", left: "-10000px", top: 0, width: "1100px", background: "#0b0f1a" }}
        aria-hidden
      >
        <div
          style={{
            padding: "56px",
            color: "#0a0f1c",
            fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
            background:
              "linear-gradient(135deg, #f6f9ff 0%, #eef3fb 60%, #e6ecf8 100%)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* decorative neon glows */}
          <div
            style={{
              position: "absolute",
              top: "-160px",
              right: "-160px",
              width: "420px",
              height: "420px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(34,211,238,0.35) 0%, rgba(34,211,238,0) 70%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "-200px",
              left: "-160px",
              width: "460px",
              height: "460px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(16,185,129,0.28) 0%, rgba(16,185,129,0) 70%)",
            }}
          />

          {/* HEADER */}
          <div
            style={{
              position: "relative",
              borderRadius: "20px",
              padding: "28px 32px",
              background: "linear-gradient(135deg, #0a0f1c 0%, #111a30 100%)",
              color: "#ffffff",
              boxShadow: "0 18px 40px -20px rgba(10, 15, 28, 0.6)",
              marginBottom: "32px",
              border: "1px solid rgba(34,211,238,0.25)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "32px",
                right: "32px",
                height: "2px",
                background: "linear-gradient(90deg, transparent, #22d3ee, #10b981, transparent)",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    letterSpacing: "0.45em",
                    color: "#22d3ee",
                    fontWeight: 600,
                    marginBottom: "8px",
                  }}
                >
                  ◆ MYKA MONEY · REGISTRO DE ABERTURA
                </div>
                <div style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "0.04em", lineHeight: 1 }}>
                  MYKA COMPRESSORES <span style={{ color: "#22d3ee" }}>DO BRASIL</span>
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#94a3b8",
                    marginTop: "10px",
                    letterSpacing: "0.25em",
                  }}
                >
                  PREVIEW STUDIO DIGITAL · ADIANTAMENTO DE RECEBÍVEIS
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    display: "inline-block",
                    padding: "8px 14px",
                    borderRadius: "999px",
                    background: "rgba(34,211,238,0.12)",
                    border: "1px solid rgba(34,211,238,0.45)",
                    color: "#67e8f9",
                    fontSize: "11px",
                    letterSpacing: "0.3em",
                    fontWeight: 600,
                  }}
                >
                  NF · {invoiceNumber || "—"}
                </div>
                <div style={{ marginTop: "10px", fontSize: "11px", color: "#94a3b8", letterSpacing: "0.2em" }}>
                  {new Date(operationDate + "T00:00:00").toLocaleDateString("pt-BR")}
                </div>
              </div>
            </div>
          </div>

          {/* INFO CARDS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
              marginBottom: "28px",
              position: "relative",
            }}
          >
            {[
              { label: "CLIENTE", value: clients.find((c) => c.id === clientId)?.name ?? "—" },
              { label: "NOTA FISCAL", value: invoiceNumber || "—" },
              { label: "DATA DA ABERTURA", value: new Date(operationDate + "T00:00:00").toLocaleDateString("pt-BR") },
              { label: "TAXA MENSAL", value: formatPct(monthlyRate) },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "14px",
                  padding: "16px 20px",
                  boxShadow: "0 6px 16px -10px rgba(15, 23, 42, 0.15)",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.3em",
                    color: "#64748b",
                    fontWeight: 600,
                    marginBottom: "6px",
                  }}
                >
                  {item.label}
                </div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* INSTALLMENTS TABLE */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "20px 24px",
              marginBottom: "24px",
              boxShadow: "0 8px 24px -16px rgba(15, 23, 42, 0.2)",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "14px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#22d3ee",
                  boxShadow: "0 0 10px #22d3ee",
                }}
              />
              <div style={{ fontSize: "11px", letterSpacing: "0.35em", color: "#0f172a", fontWeight: 700 }}>
                PARCELAS
              </div>
            </div>
            <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "linear-gradient(90deg, #f1f5f9, #e2e8f0)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", letterSpacing: "0.2em", fontSize: "10px" }}>#</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", letterSpacing: "0.2em", fontSize: "10px" }}>VENCIMENTO</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", color: "#475569", letterSpacing: "0.2em", fontSize: "10px" }}>DIAS</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", color: "#475569", letterSpacing: "0.2em", fontSize: "10px" }}>VALOR</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", color: "#475569", letterSpacing: "0.2em", fontSize: "10px" }}>VP</th>
                </tr>
              </thead>
              <tbody>
                {result.installmentCalcs.map((i, idx) => (
                  <tr key={i.id} style={{ background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "#0f172a" }}>{String(idx + 1).padStart(2, "0")}</td>
                    <td style={{ padding: "10px 12px", color: "#0f172a" }}>
                      {i.dueDate ? new Date(i.dueDate + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#475569" }}>{i.days}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                      {formatBRL(i.value)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#0f766e", fontWeight: 600 }}>
                      {formatBRL(i.presentValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* SUMMARY - HIGHLIGHTS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "16px",
              marginBottom: "24px",
              position: "relative",
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, #0a0f1c 0%, #0f172a 100%)",
                color: "#ffffff",
                borderRadius: "14px",
                padding: "18px 20px",
                border: "1px solid rgba(148,163,184,0.25)",
              }}
            >
              <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#94a3b8", marginBottom: "8px" }}>
                VALOR TOTAL DA NOTA
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800 }}>{formatBRL(result.totalInvoice)}</div>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #064e3b 0%, #0f766e 100%)",
                color: "#ffffff",
                borderRadius: "14px",
                padding: "18px 20px",
                border: "1px solid rgba(16,185,129,0.45)",
                boxShadow: "0 10px 24px -14px rgba(16,185,129,0.5)",
              }}
            >
              <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#a7f3d0", marginBottom: "8px" }}>
                LÍQUIDO A RECEBER
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800 }}>{formatBRL(result.netValue)}</div>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)",
                color: "#ffffff",
                borderRadius: "14px",
                padding: "18px 20px",
                border: "1px solid rgba(248,113,113,0.45)",
              }}
            >
              <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#fecaca", marginBottom: "8px" }}>
                CUSTO DA ABERTURA
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800 }}>{formatBRL(result.operationCost)}</div>
            </div>
          </div>

          {/* SECONDARY METRICS */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "18px 24px",
              marginBottom: "32px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "20px",
              position: "relative",
            }}
          >
            <div>
              <div style={{ fontSize: "10px", color: "#64748b", letterSpacing: "0.25em", marginBottom: "4px" }}>
                TAXA EFETIVA
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                {formatPct(result.effectiveRatePct)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "#64748b", letterSpacing: "0.25em", marginBottom: "4px" }}>
                PRAZO MÉDIO PONDERADO
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                {result.averageDays.toFixed(1)} dias
              </div>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "#64748b", letterSpacing: "0.25em", marginBottom: "4px" }}>
                CUSTO FACTORING ({formatPct(result.factoringMonthlyRatePct)}/mês)
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                {formatBRL(result.factoringCost)}
              </div>
            </div>
          </div>

          {/* SIGNATURES */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "48px",
              marginTop: "60px",
              position: "relative",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  borderTop: "2px solid #0f172a",
                  paddingTop: "10px",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: "#0f172a",
                }}
              >
                MYKA COMPRESSORES DO BRASIL
              </div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px", letterSpacing: "0.25em" }}>
                ASSINATURA · CARIMBO
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  borderTop: "2px solid #0f172a",
                  paddingTop: "10px",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: "#0f172a",
                }}
              >
                PREVIEW STUDIO DIGITAL
              </div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px", letterSpacing: "0.25em" }}>
                ASSINATURA · CARIMBO
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div
            style={{
              marginTop: "44px",
              padding: "14px 18px",
              borderRadius: "10px",
              background: "linear-gradient(90deg, rgba(34,211,238,0.08), rgba(16,185,129,0.08))",
              border: "1px solid rgba(34,211,238,0.25)",
              textAlign: "center",
              fontSize: "10px",
              color: "#0f172a",
              letterSpacing: "0.35em",
              fontWeight: 600,
              position: "relative",
            }}
          >
            ◆ MYKA MONEY · VERSÃO 2.0 · DOCUMENTO GERADO EM {new Date().toLocaleString("pt-BR")} ◆
          </div>
        </div>
      </div>
    </div>
  );
};
