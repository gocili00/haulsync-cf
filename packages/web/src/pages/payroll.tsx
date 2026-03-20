import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { tenantQueryKey } from "@/lib/tenantQueryKey";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar, DollarSign, TrendingUp, Plus, Check, Lock, Wallet, FileDown, RefreshCw, Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 20;

interface PaginatedPayroll {
  items: any[];
  total: number;
  driverCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export default function PayrollPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const queryParams: Record<string, string> = {
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  };
  if (debouncedSearch) queryParams.search = debouncedSearch;

  const { data, isLoading } = useQuery<PaginatedPayroll>({
    queryKey: tenantQueryKey(user, "/api/payroll", queryParams),
    enabled: !!user?.id && (!!user?.companyId || user?.role === "SUPERADMIN"),
  });

  const payrollWeeks = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const canManagePayroll = user?.role === "DISPATCHER" || user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  const statusColors: Record<string, string> = {
    OPEN: "secondary",
    REVIEW: "default",
    APPROVED: "default",
    PAID: "default",
    LOCKED: "outline",
  };

  const empTypeLabels: Record<string, string> = {
    W2_COMPANY_DRIVER: "Estimated gross",
    N1099_COMPANY_DRIVER: "Contractor payout",
    OWNER_OPERATOR: "Settlement",
    LEASE_TO_PURCHASE: "Settlement",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-payroll-title">Weekly Payroll</h1>
          <p className="text-sm text-muted-foreground mt-1">View and manage weekly driver pay</p>
        </div>
        {canManagePayroll && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-generate-payroll">
                <Plus className="w-4 h-4 mr-2" />
                Generate Payroll
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Generate Weekly Payroll</DialogTitle>
              </DialogHeader>
              <GeneratePayrollForm
                onSuccess={() => {
                  setDialogOpen(false);
                  queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/payroll") });
                  toast({ title: "Payroll generated" });
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {canManagePayroll && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-payroll-search"
            placeholder="Search by driver name..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : payrollWeeks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Wallet className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {debouncedSearch ? "No payroll weeks match your search" : "No payroll weeks yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {debouncedSearch ? "Try a different search term" : "Generate a payroll week to get started"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span data-testid="text-payroll-count">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} payroll weeks
              {data?.driverCount != null && (
                <span className="ml-2 text-muted-foreground/70">· {data.driverCount} {data.driverCount === 1 ? "driver" : "drivers"}</span>
              )}
            </span>
          </div>
          <div className="space-y-4">
            {payrollWeeks.map((pw: any) => (
              <PayrollWeekCard
                key={pw.id}
                week={pw}
                canManage={canManagePayroll}
                isDriver={user?.role === "DRIVER"}
                empTypeLabel={empTypeLabels[pw.employmentType] || "Net pay"}
                statusColor={statusColors[pw.status] || "secondary"}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                data-testid="button-payroll-prev"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-2" data-testid="text-payroll-page">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!data?.hasMore}
                onClick={() => setPage(p => p + 1)}
                data-testid="button-payroll-next"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PayrollWeekCard({ week, canManage, isDriver, empTypeLabel, statusColor }: { week: any; canManage: boolean; isDriver: boolean; empTypeLabel: string; statusColor: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pdfLoading, setPdfLoading] = useState(false);

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => apiRequest("PATCH", `/api/payroll/${week.id}/status`, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/payroll") });
      toast({ title: "Payroll status updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const downloadPdf = async (regenerate: boolean = false) => {
    setPdfLoading(true);
    try {
      const url = `/api/payroll/weeks/${week.id}/statement.pdf${regenerate ? "?regenerate=true" : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Download failed" }));
        throw new Error(err.message);
      }
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `settlement-${week.driverName?.replace(/\s+/g, "-") || "driver"}-${week.weekStart}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      if (regenerate) {
        toast({ title: "PDF statement regenerated and downloaded" });
        queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/payroll") });
      } else {
        toast({ title: "PDF statement downloaded" });
      }
    } catch (err: any) {
      toast({ title: "PDF Error", description: err.message, variant: "destructive" });
    } finally {
      setPdfLoading(false);
    }
  };

  const payDetails = [
    { label: "Miles", value: Number(week.milesTotalSnapshot || 0).toLocaleString(), icon: TrendingUp, suffix: "mi" },
    { label: "Base Pay", value: `$${Number(week.basePayTotal || 0).toFixed(2)}`, icon: DollarSign },
    { label: "Earnings", value: `+$${Number(week.earningsTotal || 0).toFixed(2)}`, icon: DollarSign, color: "text-chart-2" },
    { label: "Deductions", value: `-$${Number(week.deductionsTotal || 0).toFixed(2)}`, icon: DollarSign, color: "text-destructive" },
    { label: "Reimbursements", value: `+$${Number(week.reimbursementsTotal || 0).toFixed(2)}`, icon: DollarSign, color: "text-primary" },
  ];

  const canDownloadPdf = canManage || (isDriver && ["APPROVED", "PAID", "LOCKED"].includes(week.status));

  return (
    <Card data-testid={`card-payroll-${week.id}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{week.driverName || "Driver"}</p>
            <p className="text-xs text-muted-foreground">{week.weekStart} — {week.weekEnd}</p>
          </div>
        </div>
        <Badge variant={statusColor as any} className="text-[10px]">{week.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {payDetails.map((d, i) => (
            <div key={i} className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{d.label}</p>
              <p className={`text-sm font-semibold tabular-nums ${d.color || ""}`}>{d.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-3 border-t gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{empTypeLabel}</p>
            <p className="text-xl font-bold tabular-nums">${Number(week.netPayTotal || 0).toFixed(2)}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canDownloadPdf && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadPdf(false)}
                disabled={pdfLoading}
                data-testid={`button-download-pdf-${week.id}`}
              >
                {pdfLoading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4 mr-1" />
                )}
                PDF
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadPdf(true)}
                disabled={pdfLoading}
                data-testid={`button-regenerate-pdf-${week.id}`}
              >
                {pdfLoading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1" />
                )}
                {week.statementPdfUrl ? "Refresh PDF" : "Generate PDF"}
              </Button>
            )}
            {canManage && (
              <>
                {week.status === "OPEN" && (
                  <Button size="sm" variant="secondary" onClick={() => statusMutation.mutate("REVIEW")} disabled={statusMutation.isPending} data-testid={`button-review-payroll-${week.id}`}>
                    Mark for Review
                  </Button>
                )}
                {week.status === "REVIEW" && (
                  <Button size="sm" onClick={() => statusMutation.mutate("APPROVED")} disabled={statusMutation.isPending} data-testid={`button-approve-payroll-${week.id}`}>
                    <Check className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                )}
                {week.status === "APPROVED" && (
                  <Button size="sm" onClick={() => statusMutation.mutate("PAID")} disabled={statusMutation.isPending} data-testid={`button-pay-payroll-${week.id}`}>
                    <DollarSign className="w-4 h-4 mr-1" />
                    Mark Paid
                  </Button>
                )}
                {week.status === "PAID" && (
                  <Button size="sm" variant="secondary" onClick={() => statusMutation.mutate("LOCKED")} disabled={statusMutation.isPending} data-testid={`button-lock-payroll-${week.id}`}>
                    <Lock className="w-4 h-4 mr-1" />
                    Lock
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GeneratePayrollForm({ onSuccess }: { onSuccess: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: driversData } = useQuery<{ items: any[] }>({
    queryKey: tenantQueryKey(user, "/api/drivers", { limit: "100" }),
    enabled: !!user?.id && !!user?.companyId,
  });
  const drivers = driversData?.items;
  const [form, setForm] = useState({ driverUserId: "", weekStart: "" });

  const mutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/payroll/generate", data),
    onSuccess: () => onSuccess(),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ driverUserId: parseInt(form.driverUserId), weekStart: form.weekStart });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Driver</Label>
        <Select value={form.driverUserId} onValueChange={(v) => setForm({ ...form, driverUserId: v })}>
          <SelectTrigger data-testid="select-payroll-driver"><SelectValue placeholder="Select driver" /></SelectTrigger>
          <SelectContent>
            {(drivers ?? []).map((d: any) => (
              <SelectItem key={d.id} value={d.id.toString()}>{d.firstName} {d.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Week Start (Monday)</Label>
        <Input data-testid="input-payroll-week-start" type="date" value={form.weekStart} onChange={(e) => setForm({ ...form, weekStart: e.target.value })} required />
      </div>
      <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-submit-generate-payroll">
        {mutation.isPending ? "Generating..." : "Generate Payroll"}
      </Button>
    </form>
  );
}
