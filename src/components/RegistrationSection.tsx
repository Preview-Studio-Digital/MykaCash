import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, UserPlus, Save, Pencil } from "lucide-react";
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
import { playSound } from "@/lib/sounds";
import { logOperationAction } from "@/lib/auditLogger";

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
    ordem: number;
    factoring_monthly_rate: number | null;
    installments: Installment[];
  };
  onSaveSuccess?: (updated?: any) => void;
  onCancel?: () => void;
} = {}) => {
  const { clients, addClient, updateClient, removeClient } = useClients();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [clientId, setClientId] = useState<string>(invoiceToEdit?.client_id || "");
  const [invoiceNumber, setInvoiceNumber] = useState(invoiceToEdit?.invoice_number || "");
  const [invoiceValue, setInvoiceValue] = useState<number>(invoiceToEdit?.invoice_value || 0);
  const [operationDate, setOperationDate] = useState<string>(invoiceToEdit?.operation_date || todayISO());
  const [monthlyRate, setMonthlyRate] = useState<number>(invoiceToEdit?.monthly_rate || 3.0);
  const [installments, setInstallments] = useState<Installment[]>(
    invoiceToEdit?.installments || [{ id: uid(), value: 0, dueDate: addDaysISO(todayISO(), 30) }],
  );

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientDoc, setNewClientDoc] = useState("");
  const [editingClient, setEditingClient] = useState<any | null>(null);

  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setDisplayName(null);
      return;
    }
    supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.display_name || data?.username || null);
      });
  }, [user?.id]);

  // Single installment mirrors the invoice value and operation date + 30 days
  useEffect(() => {
    if (installments.length === 1 && !invoiceToEdit) {
      setInstallments([{ ...installments[0], value: invoiceValue, dueDate: addDaysISO(operationDate, 30) }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceValue, operationDate]);

  const totalAllocated = useMemo(() => installments.reduce((s, i) => s + (Number(i.value) || 0), 0), [installments]);
  const remaining = Math.max(0, (invoiceValue || 0) - totalAllocated);

  const canAddInstallment =
    invoiceValue > 0 && totalAllocated < invoiceValue && installments.every((i) => (i.value || 0) > 0);

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
    [invoiceValue, operationDate, monthlyRate, installments],
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
    if (editingClient) {
      const updated = await updateClient(editingClient.id, newClientName.trim(), newClientDoc.trim());
      if (updated) {
        setEditingClient(null);
        setNewClientName("");
        setNewClientDoc("");
        if (clientId === editingClient.id) {
          setClientId(updated.id);
        }
      }
    } else {
      const c = await addClient(newClientName.trim(), newClientDoc.trim());
      if (c) {
        setClientId(c.id);
        setNewClientOpen(false);
        setNewClientName("");
        setNewClientDoc("");
      }
    }
  };

  const archiveRef = useRef<HTMLDivElement>(null);

  const [authorName, setAuthorName] = useState<string>("");
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setAuthorName(data?.display_name || data?.username || "");
      });
  }, [user?.id]);

  const [operationNumber, setOperationNumber] = useState<number | null>(invoiceToEdit?.ordem || null);
  useEffect(() => {
    if (invoiceToEdit?.ordem) {
      setOperationNumber(invoiceToEdit.ordem);
    } else {
      supabase
        .from("invoices")
        .select("ordem")
        .order("ordem", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const lastNum = (data[0] as any).ordem;
            setOperationNumber(lastNum ? lastNum + 1 : 1);
          } else {
            setOperationNumber(1);
          }
        });
    }
  }, [invoiceToEdit]);

  const monthlyEffectiveRatePct = useMemo(() => {
    const eff = result.effectiveRatePct / 100;
    const days = result.averageDays;
    if (!days || eff <= 0) return 0;
    return (Math.pow(1 + eff, 30 / days) - 1) * 100;
  }, [result.effectiveRatePct, result.averageDays]);

  const generateArchivePng = async (clientName: string, forcedOpNumber?: number) => {
    const node = archiveRef.current;
    if (!node) return;

    const seq = forcedOpNumber ?? operationNumber ?? 0;
    const seqStr = String(seq).padStart(4, "0");

    // Temporarily make it visible for rendering
    const prev = node.style.cssText;
    node.style.cssText = "position:fixed;left:-10000px;top:0;width:1100px;background:#0b0f1a;";
    try {
      const canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: 2 });
      const link = document.createElement("a");
      const safeClient = clientName.replace(/[^a-z0-9]+/gi, "_");
      link.download = `${seqStr}_${safeClient}_NF-${invoiceNumber.trim()}_${operationDate}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      node.style.cssText = prev;
    }
  };

  const handleOpenConfirm = () => {
    if (operationDate > todayISO()) return toast.error("A data da abertura não pode ser futura");
    if (!clientId) return toast.error("Selecione um cliente");
    if (!invoiceNumber.trim()) return toast.error("Informe o número da nota");
    if (invoiceValue <= 0) return toast.error("Informe o valor da nota");
    if (Math.abs(totalAllocated - invoiceValue) > 0.01)
      return toast.error("Soma das parcelas deve ser igual ao valor da nota");
    setConfirmOpen(true);
    playSound("confirm");
  };

  const handleSaveInvoice = async () => {
    if (operationDate > todayISO()) return toast.error("A data da abertura não pode ser futura");
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
    let savedOpNumber = operationNumber;

    if (invoiceToEdit) {
      const { data, error: updateError } = await supabase
        .from("invoices")
        .update({ ...invoiceData, created_by: user?.id ?? null })
        .eq("id", invoiceToEdit.id)
        .select()
        .single();
      error = updateError;
      if (data) savedOpNumber = (data as any).ordem;
    } else {
      const { data, error: insertError } = await supabase
        .from("invoices")
        .insert({
          ...invoiceData,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      error = insertError;
      if (data) savedOpNumber = (data as any).ordem;
    }

    if (error) {
      setSaving(false);
      const { friendlyDbError } = await import("@/lib/dbErrors");
      return toast.error(
        friendlyDbError(error, invoiceToEdit ? "Erro ao atualizar abertura" : "Erro ao salvar abertura"),
      );
    }
    const clientName = clients.find((c) => c.id === clientId)?.name ?? "cliente";
    if (savedOpNumber) setOperationNumber(savedOpNumber);

    // Registrar log da operação
    const opNumStr = savedOpNumber ? String(savedOpNumber).padStart(4, "0") : "—";
    const logAction = invoiceToEdit ? "UPDATE" : "CREATE";
    const logDetails = invoiceToEdit
      ? `Editou a operação (Registro: ${opNumStr}, Cliente: ${clientName}, NF: ${invoiceNumber.trim()}, Valor Líquido: ${formatBRL(result.netValue)})`
      : `Abriu a operação (Registro: ${opNumStr}, Cliente: ${clientName}, NF: ${invoiceNumber.trim()}, Valor Líquido: ${formatBRL(result.netValue)})`;
    await logOperationAction(logAction, opNumStr, clientName, invoiceNumber.trim(), logDetails, result.netValue);
    try {
      // Wait a tick so the offscreen archive re-renders with the final operation number
      await new Promise((r) => setTimeout(r, 50));
      await generateArchivePng(clientName, savedOpNumber || undefined);
      toast.success(invoiceToEdit ? "Abertura atualizada e arquivo PNG gerado" : "Abertura salva e arquivo PNG gerado");
    } catch (e) {
      toast.success(invoiceToEdit ? "Abertura atualizada (falha ao gerar PNG)" : "Abertura salva (falha ao gerar PNG)");
    }
    playSound("success");
    setSaving(false);

    if (onSaveSuccess) {
      onSaveSuccess({ ...invoiceData, id: invoiceToEdit?.id });
    } else {
      setInvoiceNumber("");
      navigate("/");
    }
  };

  return (
    <div className="space-y-8">
      {/* Form card */}
      <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full animate-color-cycle" />
            <h2 className="font-mono text-sm sm:text-base md:text-lg tracking-[0.2em] font-bold uppercase">
              {invoiceToEdit ? "Edição" : "Cadastro"}
              {operationNumber ? ` - ${String(operationNumber).padStart(4, "0")}` : ""}
            </h2>
          </div>
          <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
            {invoiceToEdit ? "EDITAR ABERTURA" : "ABERTURA"}
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-2">
            <Label className="font-mono text-xs lg:text-sm">Cliente</Label>
            <div className="flex gap-2">
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="flex-1 font-mono text-xs lg:text-sm">
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent className="font-mono text-xs lg:text-sm">
                  {clients.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground font-mono">Nenhum cliente. Cadastre um ao lado.</div>
                  ) : (
                    clients.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="font-mono text-xs lg:text-sm">
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Dialog open={newClientOpen} onOpenChange={(open) => {
                setNewClientOpen(open);
                if (!open) {
                  setEditingClient(null);
                  setNewClientName("");
                  setNewClientDoc("");
                }
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Novo cliente">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-mono text-xs lg:text-sm uppercase tracking-widest">
                      {editingClient ? "Editar cliente" : "Gerenciar clientes"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="font-mono text-xs lg:text-sm">Razão social</Label>
                      <Input
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value.toUpperCase())}
                        style={{ textTransform: "uppercase" }}
                        className="font-mono text-xs lg:text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-mono text-xs lg:text-sm">CNPJ</Label>
                      <Input
                        value={newClientDoc}
                        onChange={(e) => setNewClientDoc(formatCNPJ(e.target.value))}
                        placeholder="XX.XXX.XXX/XXXX-XX"
                        inputMode="numeric"
                        maxLength={18}
                        className="font-mono text-xs lg:text-sm"
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
                            <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs lg:text-sm font-mono">
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{c.name}</div>
                                {c.document && (
                                  <div className="truncate text-xs text-muted-foreground">{c.document}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-primary h-8 w-8"
                                  aria-label={`Editar ${c.name}`}
                                  onClick={() => {
                                    setEditingClient(c);
                                    setNewClientName(c.name);
                                    setNewClientDoc(c.document || "");
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
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
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter className="flex gap-2">
                    {editingClient && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingClient(null);
                          setNewClientName("");
                          setNewClientDoc("");
                        }}
                      >
                        Cancelar
                      </Button>
                    )}
                    <Button onClick={handleCreateClient}>
                      {editingClient ? "Salvar alterações" : "Cadastrar cliente"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs lg:text-sm">Número da Nota Fiscal</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ex.: 000123" className="font-mono text-xs lg:text-sm" />
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs lg:text-sm">Valor da Nota Fiscal</Label>
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
                className="pl-10 font-mono text-xs lg:text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs lg:text-sm">Data da Abertura</Label>
            <DateField value={operationDate} onChange={setOperationDate} max={todayISO()} />
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs lg:text-sm">Taxa mensal (%)</Label>
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
              className="font-mono text-xs lg:text-sm"
            />
          </div>
        </div>

        {/* Installments */}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full animate-color-cycle" />
              <Label className="font-mono text-sm sm:text-base md:text-lg tracking-[0.2em] font-bold uppercase cursor-pointer">Pagamento</Label>
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
                  <span className="block font-mono text-[10px] lg:text-xs tracking-[0.25em] text-muted-foreground">
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
                      className="pl-10 font-mono text-xs lg:text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="block font-mono text-[10px] lg:text-xs tracking-[0.25em] text-muted-foreground">
                    DATA DE VENCIMENTO
                  </span>
                  <DateField value={inst.dueDate} onChange={(iso) => updateInstallmentDate(inst.id, iso)} />
                </div>
                <div className="space-y-1">
                  <span className="block font-mono text-[10px] lg:text-xs tracking-[0.25em] text-muted-foreground opacity-0">
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

      {clientId && invoiceNumber.trim() && invoiceValue > 0 && installments.every((i) => i.value > 0 && i.dueDate) && (
        <CalcMemory result={result} monthlyRate={monthlyRate} operationDate={operationDate} />
      )}

      <div className="flex justify-center gap-4">
        {onCancel && (
          <Button
            onClick={onCancel}
            variant="outline"
            disabled={saving}
            size="lg"
            className="font-display tracking-wide"
          >
            CANCELAR
          </Button>
        )}
        <Button onClick={handleOpenConfirm} disabled={saving} size="lg" className="font-display tracking-wide">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando..." : invoiceToEdit ? "SALVAR ALTERAÇÕES" : "CADASTRAR E EXPORTAR"}
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-4">
          <DialogHeader className="space-y-0.5">
            <DialogTitle className="font-display text-lg tracking-tight">
              {displayName ? `${displayName}, confirme a operação:` : "Confirme a operação:"}
            </DialogTitle>
            <DialogDescription className="font-mono text-[10px] tracking-wider text-muted-foreground">
              Revise os dados antes de salvar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* General info grid */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-border/50 bg-muted/20 p-2">
                <div className="font-mono text-[9px] tracking-widest text-muted-foreground">CLIENTE</div>
                <div className="mt-0.5 font-display text-sm font-semibold">
                  {clients.find((c) => c.id === clientId)?.name ?? "—"}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {clients.find((c) => c.id === clientId)?.document ?? "—"}
                </div>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-2">
                <div className="font-mono text-[9px] tracking-widest text-muted-foreground">NOTA FISCAL</div>
                <div className="mt-0.5 font-display text-sm font-semibold">{invoiceNumber || "—"}</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-2">
                <div className="font-mono text-[9px] tracking-widest text-muted-foreground">VALOR DA NOTA</div>
                <div className="mt-0.5 font-display text-sm font-semibold tabular-nums">{formatBRL(invoiceValue)}</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-2">
                <div className="font-mono text-[9px] tracking-widest text-muted-foreground">DATA DA ABERTURA</div>
                <div className="mt-0.5 font-display text-sm font-semibold">
                  {new Date(operationDate + "T00:00:00").toLocaleDateString("pt-BR")}
                </div>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-2">
                <div className="font-mono text-[9px] tracking-widest text-muted-foreground">TAXA MENSAL</div>
                <div className="mt-0.5 font-display text-sm font-semibold tabular-nums">{formatPct(monthlyRate)}</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-2">
                <div className="font-mono text-[9px] tracking-widest text-muted-foreground">TAXA EFETIVA</div>
                <div className="mt-0.5 font-display text-sm font-semibold tabular-nums">{formatPct(result.effectiveRatePct)}</div>
              </div>
            </div>

            {/* Installments — desktop table */}
            <div className="hidden md:block rounded-lg border border-border/50">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/40 font-mono tracking-widest">
                  <tr className="text-muted-foreground">
                    <th className="px-2 py-1.5 text-center font-medium">PARCELA</th>
                    <th className="px-2 py-1.5 text-center font-medium">VENCIMENTO</th>
                    <th className="px-2 py-1.5 text-center font-medium">DIAS</th>
                    <th className="px-2 py-1.5 text-center font-medium">VALOR BRUTO</th>
                    <th className="px-2 py-1.5 text-center font-medium">VALOR LÍQUIDO</th>
                    <th className="px-2 py-1.5 text-center font-medium">CUSTO</th>
                  </tr>
                </thead>
                <tbody>
                  {result.installmentCalcs.map((i, idx) => (
                    <tr key={i.id} className="border-t border-border/40 font-mono tabular-nums text-center">
                      <td className="px-2 py-1.5">
                        {result.installmentCalcs.length > 1 ? String(idx + 1).padStart(2, "0") : "ÚNICA"}
                      </td>
                      <td className="px-2 py-1.5">{new Date(i.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                      <td className="px-2 py-1.5">{i.days}</td>
                      <td className="px-2 py-1.5">{formatBRL(i.value)}</td>
                      <td className="px-2 py-1.5 text-net-green">{formatBRL(i.presentValue)}</td>
                      <td className="px-2 py-1.5 text-cost-red">{formatBRL(i.value - i.presentValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Installments — mobile cards */}
            <div className="space-y-2 md:hidden">
              {result.installmentCalcs.map((i, idx) => (
                <div key={i.id} className="rounded-lg border border-border/40 bg-muted/20 p-2 space-y-1 text-center">
                  <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
                    {result.installmentCalcs.length > 1 ? `P ${String(idx + 1).padStart(2, "0")}` : "PARCELA ÚNICA"}
                  </div>
                  <div className="font-mono text-xs">
                    {new Date(i.dueDate + "T00:00:00").toLocaleDateString("pt-BR")} · {i.days} dias
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-xs tabular-nums">
                    <div>
                      <div className="text-[9px] tracking-widest text-muted-foreground">BRUTO</div>
                      <div>{formatBRL(i.value)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] tracking-widest text-muted-foreground">LÍQUIDO</div>
                      <div className="text-net-green">{formatBRL(i.presentValue)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] tracking-widest text-muted-foreground">CUSTO</div>
                      <div className="text-cost-red">{formatBRL(i.value - i.presentValue)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-3">

            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving} className="font-display tracking-wide w-full sm:w-auto">
              VOLTAR E EDITAR
            </Button>
            <Button onClick={handleSaveInvoice} disabled={saving} className="font-display tracking-wide w-full sm:w-auto">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Salvando..." : "CONFIRMAR E SALVAR"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            background: "linear-gradient(135deg, #f6f9ff 0%, #eef3fb 60%, #e6ecf8 100%)",
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
              padding: "20px 32px",
              background: "#4b5563",
              color: "#ffffff",
              boxShadow: "0 18px 40px -20px rgba(10, 15, 28, 0.6)",
              marginBottom: "32px",
              border: "1px solid rgba(255,255,255,0.1)",
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
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                gap: "8px",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "15px",
                    letterSpacing: "0.25em",
                    color: "#22d3ee",
                    fontWeight: 700,
                    marginBottom: "6px",
                  }}
                >
                  MYKACA$H · ADIANTAMENTO DE RECEBÍVEIS
                </div>
                <div
                  style={{
                    fontSize: "30px",
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    lineHeight: 1,
                    color: "#ffffff",
                  }}
                >
                  MYKA COMPRESSORES DO BRASIL
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    letterSpacing: "0.4em",
                    color: "#94a3b8",
                    marginTop: "12px",
                    fontWeight: 600,
                  }}
                >
                  OPERAÇÃO {String(operationNumber || 0).padStart(4, "0")}
                </div>
              </div>
            </div>
          </div>

          {/* INFO CARDS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "16px",
              marginBottom: "28px",
              position: "relative",
            }}
          >
            {[
              { label: "CLIENTE", value: clients.find((c) => c.id === clientId)?.name ?? "—" },
              { label: "CNPJ", value: clients.find((c) => c.id === clientId)?.document ?? "—" },
              { label: "NOTA FISCAL", value: invoiceNumber || "—" },
              { label: "DATA DA ABERTURA", value: new Date(operationDate + "T00:00:00").toLocaleDateString("pt-BR") },
              { label: "TAXA MENSAL", value: formatPct(monthlyRate) },
              { label: "TAXA EFETIVA", value: formatPct(result.effectiveRatePct) },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "14px",
                  padding: "16px 20px",
                  boxShadow: "0 6px 16px -10px rgba(15, 23, 42, 0.15)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
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
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "center",
                      color: "#475569",
                      letterSpacing: "0.2em",
                      fontSize: "10px",
                    }}
                  >
                    #
                  </th>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "center",
                      color: "#475569",
                      letterSpacing: "0.2em",
                      fontSize: "10px",
                    }}
                  >
                    ABERTURA
                  </th>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "center",
                      color: "#475569",
                      letterSpacing: "0.2em",
                      fontSize: "10px",
                    }}
                  >
                    VENCIMENTO
                  </th>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "center",
                      color: "#475569",
                      letterSpacing: "0.2em",
                      fontSize: "10px",
                    }}
                  >
                    DIAS
                  </th>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "center",
                      color: "#475569",
                      letterSpacing: "0.2em",
                      fontSize: "10px",
                    }}
                  >
                    VALOR BRUTO
                  </th>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "center",
                      color: "#475569",
                      letterSpacing: "0.2em",
                      fontSize: "10px",
                    }}
                  >
                    VALOR LÍQUIDO
                  </th>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "center",
                      color: "#475569",
                      letterSpacing: "0.2em",
                      fontSize: "10px",
                    }}
                  >
                    CUSTO
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.installmentCalcs.map((i, idx) => (
                  <tr key={i.id} style={{ background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#0f172a" }}>
                      {result.installmentCalcs.length > 1
                        ? `${String(operationNumber || 0).padStart(4, "0")}${String.fromCharCode(97 + idx)}`
                        : String(operationNumber || 0).padStart(4, "0")}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "#0f172a" }}>
                      {new Date(operationDate + "T00:00:00").toLocaleDateString("pt-BR")}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "#0f172a" }}>
                      {i.dueDate ? new Date(i.dueDate + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "#475569" }}>{i.days}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#0f172a" }}>
                      {formatBRL(i.value)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "#0f766e", fontWeight: 600 }}>
                      {formatBRL(i.presentValue)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "#b91c1c", fontWeight: 600 }}>
                      {formatBRL(i.value - i.presentValue)}
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
                background: "#4b5563",
                color: "#ffffff",
                borderRadius: "14px",
                padding: "18px 20px",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#94a3b8", marginBottom: "8px" }}>
                VALOR BRUTO
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
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#a7f3d0", marginBottom: "8px" }}>
                VALOR LÍQUIDO
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
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#fecaca", marginBottom: "8px" }}>
                CUSTO
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800 }}>{formatBRL(result.operationCost)}</div>
            </div>
          </div>

          {/* SIGNATURES */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "48px",
              marginTop: "100px",
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
            ◆ MYKACA$H · VERSÃO 3.0 · DOCUMENTO GERADO EM {new Date().toLocaleString("pt-BR")}
            {authorName ? ` · POR ${authorName.toUpperCase()}` : ""} ◆
          </div>
        </div>
      </div>
    </div>
  );
};
