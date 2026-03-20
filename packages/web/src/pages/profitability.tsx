import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { tenantQueryKey } from "@/lib/tenantQueryKey";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  RotateCcw,
  Truck,
  DollarSign,
  MapPin,
  Award,
  Info,
  Search,
  Building2,
} from "lucide-react";

const PAGE_SIZE = 20;

type RangePreset = "this_week" | "last_week" | "mtd" | "last_month";
type SortField = "profit" | "score" | "profitPerMile" | "miles";
type SortDir = "asc" | "desc";

const scoreColors: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  B: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  C: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  D: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  F: "bg-red-500/15 text-red-400 border-red-500/30",
};

const presetLabels: Record<RangePreset, string> = {
  this_week: "This Week",
  last_week: "Last Week",
  mtd: "Month to Date",
  last_month: "Last Month",
};

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekBounds(date: Date): { start: string; end: string } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toLocalDateStr(monday),
    end: toLocalDateStr(sunday),
  };
}

function computePresetDates(preset: RangePreset): { startDate: string; endDate: string } {
  const now = new Date();
  switch (preset) {
    case "this_week": {
      const { start, end } = getWeekBounds(now);
      return { startDate: start, endDate: end };
    }
    case "last_week": {
      const lastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      const { start, end } = getWeekBounds(lastWeek);
      return { startDate: start, endDate: end };
    }
    case "mtd": {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate: toLocalDateStr(firstOfMonth),
        endDate: toLocalDateStr(now),
      };
    }
    case "last_month": {
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        startDate: toLocalDateStr(firstOfLastMonth),
        endDate: toLocalDateStr(lastOfLastMonth),
      };
    }
  }
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isWeeklyPreset(preset: RangePreset): boolean {
  return preset === "this_week" || preset === "last_week";
}

function ScoreBadge({ score, label }: { score: string; label?: string }) {
  return (
    <Badge variant="outline" className={`text-xs font-bold ${scoreColors[score] || ""}`} data-testid={label ? `badge-${label}-${score}` : undefined}>
      {score}
    </Badge>
  );
}

function formatMoney(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n < 0 ? `-$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function scoreToNum(s: string): number {
  return { A: 5, B: 4, C: 3, D: 2, F: 1 }[s] || 0;
}

export default function ProfitabilityPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [preset, setPreset] = useState<RangePreset>("this_week");
  const [sortField, setSortField] = useState<SortField>("profit");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [detailDriverId, setDetailDriverId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { startDate, endDate } = useMemo(() => computePresetDates(preset), [preset]);
  const rangeType = preset === "this_week" || preset === "last_week" ? preset : "month";

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }

  function handlePresetChange(p: RangePreset) {
    setPreset(p);
    setPage(0);
  }

  const queryParams = {
    startDate,
    endDate,
    rangeType,
    sortField,
    sortDir,
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  };

  const { data: profData, isLoading: profLoading } = useQuery<{
    rows: any[];
    total: number;
    startDate: string;
    endDate: string;
    rangeType: string;
    totalMissingRevenue: number;
    fleetSummary: {
      totalRevenue: string;
      totalDriverPay: string;
      totalCompanyCost: string;
      totalProfit: string;
      totalMiles: string;
      profitPerMile: string;
      scoreDistribution: Record<string, number>;
    };
  }>({
    queryKey: tenantQueryKey(user, "/api/profitability", queryParams),
    queryFn: async () => {
      const params = new URLSearchParams(queryParams).toString();
      const res = await fetch(`/api/profitability?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!user?.id && !!user?.companyId,
  });

  const rows = profData?.rows || [];
  const total = profData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(0);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === "desc" ? <ChevronDown className="w-3 h-3 inline ml-0.5" /> : <ChevronUp className="w-3 h-3 inline ml-0.5" />;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Profitability</h1>
            <p className="text-sm text-muted-foreground">Driver profitability scores by range</p>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5" data-testid="range-selector">
            {(Object.keys(presetLabels) as RangePreset[]).map((p) => (
              <Button
                key={p}
                variant={preset === p ? "default" : "ghost"}
                size="sm"
                onClick={() => handlePresetChange(p)}
                data-testid={`button-preset-${p}`}
              >
                {presetLabels[p]}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-active-range">
          Showing: {formatDateShort(startDate)} – {formatDateShort(endDate)} ({presetLabels[preset]})
        </p>
      </div>

      {profData && profData.totalMissingRevenue > 0 && (
        <Card className="border-yellow-500/30">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <p className="text-sm text-yellow-400" data-testid="text-missing-revenue-banner">
              Revenue is missing on <span className="font-semibold">{profData.totalMissingRevenue}</span> load{profData.totalMissingRevenue !== 1 ? "s" : ""} — profitability may be inaccurate.
            </p>
          </CardContent>
        </Card>
      )}

      {profData && profData.loadsWithoutTruck > 0 && (
        <Card className="border-orange-500/30">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0" />
            <p className="text-sm text-orange-300" data-testid="text-loads-without-truck-banner">
              <span className="font-semibold">{profData.loadsWithoutTruck}</span> load{profData.loadsWithoutTruck !== 1 ? "s" : ""} in this period have no truck assigned. Truck-related costs may be incomplete.
            </p>
          </CardContent>
        </Card>
      )}

      {profData && profData.hasActiveCosts === false && (
        <Card className="border-muted">
          <CardContent className="flex items-center gap-3 py-3">
            <Info className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-active-costs-banner">
              No active company cost defaults configured. Profitability may be overstated.
            </p>
          </CardContent>
        </Card>
      )}

      {profData?.fleetSummary && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card data-testid="fleet-card-revenue">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">Fleet Revenue</p>
                <p className="text-lg font-bold" data-testid="text-fleet-revenue">{formatMoney(profData.fleetSummary.totalRevenue)}</p>
              </CardContent>
            </Card>
            <Card data-testid="fleet-card-driver-pay">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">Driver Pay</p>
                <p className="text-lg font-bold" data-testid="text-fleet-driver-pay">{formatMoney(profData.fleetSummary.totalDriverPay)}</p>
              </CardContent>
            </Card>
            <Card data-testid="fleet-card-company-cost">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">Company Cost</p>
                <p className="text-lg font-bold text-muted-foreground" data-testid="text-fleet-company-cost">{formatMoney(profData.fleetSummary.totalCompanyCost)}</p>
              </CardContent>
            </Card>
            <Card data-testid="fleet-card-profit">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">Fleet Profit</p>
                <p className={`text-lg font-bold ${parseFloat(profData.fleetSummary.totalProfit) >= 0 ? "text-emerald-400" : "text-red-400"}`} data-testid="text-fleet-profit">
                  {formatMoney(profData.fleetSummary.totalProfit)}
                </p>
              </CardContent>
            </Card>
            <Card data-testid="fleet-card-miles">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">Total Miles</p>
                <p className="text-lg font-bold" data-testid="text-fleet-miles">{parseInt(profData.fleetSummary.totalMiles).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card data-testid="fleet-card-ppm">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">Profit / Mile</p>
                <p className={`text-lg font-bold ${parseFloat(profData.fleetSummary.profitPerMile) >= 0 ? "text-emerald-400" : "text-red-400"}`} data-testid="text-fleet-ppm">
                  ${parseFloat(profData.fleetSummary.profitPerMile).toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>

          {(() => {
            const dist = profData.fleetSummary.scoreDistribution;
            const scores: { grade: string; color: string; barColor: string }[] = [
              { grade: "A", color: "text-emerald-400", barColor: "bg-emerald-500" },
              { grade: "B", color: "text-blue-400",    barColor: "bg-blue-500" },
              { grade: "C", color: "text-yellow-400",  barColor: "bg-yellow-500" },
              { grade: "D", color: "text-orange-400",  barColor: "bg-orange-500" },
              { grade: "F", color: "text-red-400",     barColor: "bg-red-500" },
            ];
            const maxCount = Math.max(1, ...scores.map((s) => dist[s.grade] || 0));
            const totalDrivers = scores.reduce((sum, s) => sum + (dist[s.grade] || 0), 0);
            if (totalDrivers === 0) return null;
            return (
              <Card data-testid="fleet-score-distribution">
                <CardContent className="pt-4 pb-3 px-4">
                  <p className="text-xs text-muted-foreground mb-3 font-medium">Score Distribution</p>
                  <div className="flex items-end gap-3">
                    {scores.map(({ grade, color, barColor }) => {
                      const count = dist[grade] || 0;
                      const pct = Math.round((count / maxCount) * 100);
                      return (
                        <div key={grade} className="flex-1 flex flex-col items-center gap-1" data-testid={`score-dist-${grade}`}>
                          <span className={`text-xs font-semibold ${color}`}>{count}</span>
                          <div className="w-full rounded-sm overflow-hidden bg-muted" style={{ height: 48 }}>
                            <div
                              className={`${barColor} rounded-sm w-full transition-all duration-300`}
                              style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                            />
                          </div>
                          <span className={`text-sm font-bold ${color}`}>{grade}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-profitability-search"
            placeholder="Search driver..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        {!profLoading && total > 0 && (
          <span className="text-sm text-muted-foreground whitespace-nowrap" data-testid="text-profitability-count">
            {total} driver{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {profLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card>
          <div className="flex items-center gap-3 px-4 pt-3 pb-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-orange-400" />
              Profit/mile below $0.15 — potential profit leak
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Dispatcher</TableHead>
                  <TableHead className="text-right">Loads</TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("miles")} data-testid="header-miles">
                    Miles <SortIcon field="miles" />
                  </TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Driver Pay</TableHead>
                  <TableHead className="text-right">Company Cost</TableHead>
                  <TableHead className="text-right">Cost/Mile</TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("profit")} data-testid="header-profit">
                    Profit <SortIcon field="profit" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("profitPerMile")} data-testid="header-ppm">
                    Profit/Mile <SortIcon field="profitPerMile" />
                  </TableHead>
                  <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort("score")} data-testid="header-score">
                    Auto <SortIcon field="score" />
                  </TableHead>
                  <TableHead className="text-center">Final</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                      {debouncedSearch ? `No drivers match "${debouncedSearch}"` : "No driver data for this period"}
                    </TableCell>
                  </TableRow>
                ) : rows.map((row) => {
                  const profit = parseFloat(row.profitTotal);
                  return (
                    <TableRow key={row.driverUserId} data-testid={`row-driver-${row.driverUserId}`}>
                      <TableCell className="font-medium" data-testid={`text-driver-name-${row.driverUserId}`}>
                        <div className="flex items-center gap-2">
                          {row.driverName}
                          {row.profitLeak && (
                            <span title="Profit/mile below $0.15 — potential profit leak" data-testid={`badge-profit-leak-${row.driverUserId}`}>
                              <AlertCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                            </span>
                          )}
                          {row.missingRevenueCount > 0 && (
                            <Badge variant="outline" className="text-[9px] border-yellow-500/30 text-yellow-400" data-testid={`badge-missing-rev-${row.driverUserId}`}>
                              {row.missingRevenueCount} missing rev
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{row.dispatcherName || "Unassigned"}</TableCell>
                      <TableCell className="text-right" data-testid={`text-loads-${row.driverUserId}`}>{row.loadsCount}</TableCell>
                      <TableCell className="text-right" data-testid={`text-miles-${row.driverUserId}`}>{parseFloat(row.milesTotal).toLocaleString()}</TableCell>
                      <TableCell className="text-right" data-testid={`text-revenue-${row.driverUserId}`}>{formatMoney(row.revenueTotal)}</TableCell>
                      <TableCell className="text-right" data-testid={`text-pay-${row.driverUserId}`}>{formatMoney(row.driverPayTotal)}</TableCell>
                      <TableCell className="text-right text-muted-foreground" data-testid={`text-company-cost-${row.driverUserId}`}>
                        {parseFloat(row.companyCostTotal) > 0 ? formatMoney(row.companyCostTotal) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground" data-testid={`text-cost-per-mile-${row.driverUserId}`}>
                        {parseFloat(row.milesTotal) > 0
                          ? `$${(parseFloat(row.companyCostTotal) / parseFloat(row.milesTotal)).toFixed(2)}`
                          : "—"}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`} data-testid={`text-profit-${row.driverUserId}`}>
                        {formatMoney(row.profitTotal)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-ppm-${row.driverUserId}`}>
                        ${parseFloat(row.profitPerMile).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreBadge score={row.autoScore} label={`auto-${row.driverUserId}`} />
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreBadge score={row.finalScore} label={`final-${row.driverUserId}`} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDetailDriverId(row.driverUserId)}
                          data-testid={`button-view-details-${row.driverUserId}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-sm text-muted-foreground" data-testid="text-profitability-page">
                Page {page + 1} of {totalPages} · {total} drivers
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 0}
                  data-testid="button-profitability-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages - 1}
                  data-testid="button-profitability-next"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {detailDriverId && (
        <DetailModal
          driverUserId={detailDriverId}
          startDate={startDate}
          endDate={endDate}
          rangeType={rangeType}
          preset={preset}
          onClose={() => setDetailDriverId(null)}
        />
      )}
    </div>
  );
}

function DetailModal({
  driverUserId,
  startDate,
  endDate,
  rangeType,
  preset,
  onClose,
}: {
  driverUserId: number;
  startDate: string;
  endDate: string;
  rangeType: string;
  preset: RangePreset;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [overrideScore, setOverrideScore] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [loadsOpen, setLoadsOpen] = useState(true);
  const [payItemsOpen, setPayItemsOpen] = useState(true);
  const weeklyView = isWeeklyPreset(preset);

  const { user } = useAuth();
  const { data, isLoading } = useQuery<any>({
    queryKey: tenantQueryKey(user, "/api/profitability", driverUserId, startDate, endDate, rangeType),
    queryFn: async () => {
      const res = await fetch(`/api/profitability/${driverUserId}?startDate=${startDate}&endDate=${endDate}&rangeType=${rangeType}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!user?.id,
  });

  const overrideMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/profitability/${driverUserId}/override`, body),
    onSuccess: () => {
      toast({ title: "Score override saved" });
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/profitability") });
      setOverrideScore("");
      setOverrideReason("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const clearMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/profitability/${driverUserId}/override/clear`, body),
    onSuccess: () => {
      toast({ title: "Override cleared" });
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/profitability") });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleOverride() {
    if (!overrideScore) return;
    overrideMut.mutate({ weekStart: startDate, overrideScore, overrideReason: overrideReason || undefined });
  }

  function handleClear() {
    clearMut.mutate({ weekStart: startDate });
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-detail-title">
            {data?.driverName || "Driver"} — {formatDateShort(startDate)} – {formatDateShort(endDate)}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <SummaryCard icon={MapPin} label="Miles" value={parseFloat(data.milesTotal).toLocaleString()} testId="summary-miles" />
              <SummaryCard icon={DollarSign} label="Revenue" value={formatMoney(data.revenueTotal)} testId="summary-revenue" />
              <SummaryCard icon={Truck} label="Driver Pay" value={formatMoney(data.driverPayTotal)} testId="summary-pay" />
              <SummaryCard
                icon={Building2}
                label="Company Cost"
                value={parseFloat(data.companyCostTotal) > 0 ? formatMoney(data.companyCostTotal) : "$0.00"}
                testId="summary-company-cost"
                valueClass="text-muted-foreground"
              />
              <SummaryCard
                icon={parseFloat(data.profitTotal) >= 0 ? TrendingUp : TrendingDown}
                label="Profit"
                value={formatMoney(data.profitTotal)}
                testId="summary-profit"
                valueClass={parseFloat(data.profitTotal) >= 0 ? "text-emerald-400" : "text-red-400"}
              />
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Profit/Mile:</span>
                <span className="font-semibold text-sm" data-testid="text-detail-ppm">${parseFloat(data.profitPerMile).toFixed(2)}</span>
              </div>
              {parseFloat(data.milesTotal) > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Cost/Mile:</span>
                  <span className="font-semibold text-sm text-muted-foreground" data-testid="text-detail-cost-per-mile">
                    ${(parseFloat(data.companyCostTotal) / parseFloat(data.milesTotal)).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Auto Score:</span>
                <ScoreBadge score={data.autoScore} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Final Score:</span>
                <ScoreBadge score={data.finalScore} />
              </div>
              {data.overrideScore && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Overridden</Badge>
              )}
            </div>

            <Collapsible open={loadsOpen} onOpenChange={setLoadsOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 rounded-t-lg transition-colors">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Loads ({data.loads?.length || 0})</p>
                      {loadsOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-0">
                    {data.loads && data.loads.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Route</TableHead>
                              <TableHead className="text-right">Miles</TableHead>
                              <TableHead className="text-right">Revenue</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.loads.map((l: any) => (
                              <TableRow key={l.id}>
                                <TableCell className="text-sm">{l.pickupDate}</TableCell>
                                <TableCell className="text-sm">
                                  {l.pickupAddress}
                                  <span className="text-muted-foreground mx-1">{"\u2192"}</span>
                                  {l.deliveryAddress}
                                </TableCell>
                                <TableCell className="text-right text-sm">{parseFloat(l.miles || "0").toLocaleString()}</TableCell>
                                <TableCell className="text-right text-sm">
                                  {l.revenueAmount ? formatMoney(l.revenueAmount) : (
                                    <span className="text-yellow-400 text-xs">Missing</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-[10px]">{l.status}</Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground p-4">No loads in this period</p>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Collapsible open={payItemsOpen} onOpenChange={setPayItemsOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 rounded-t-lg transition-colors">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Pay Items ({data.payItems?.length || 0})</p>
                      {payItemsOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    {data.payItems && data.payItems.length > 0 ? (
                      <div className="space-y-1">
                        {data.payItems.map((pi: any) => (
                          <div key={pi.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className="text-[9px] flex-shrink-0">{pi.type}</Badge>
                              <span className="font-medium">{pi.category.replace(/_/g, " ")}</span>
                              {pi.description && <span className="text-muted-foreground text-xs truncate">— {pi.description}</span>}
                            </div>
                            <span className={`font-semibold flex-shrink-0 ml-3 tabular-nums ${pi.type === "DEDUCTION" ? "text-red-400" : "text-emerald-400"}`}>
                              {pi.type === "DEDUCTION" ? "-" : "+"}{formatMoney(pi.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No pay items in this period</p>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Card>
              <CardHeader className="pb-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Award className="w-4 h-4" /> Override Score
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {weeklyView ? (
                  <>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Select value={overrideScore} onValueChange={setOverrideScore}>
                        <SelectTrigger className="w-[100px]" data-testid="select-override-score">
                          <SelectValue placeholder="Score" />
                        </SelectTrigger>
                        <SelectContent>
                          {["A", "B", "C", "D", "F"].map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Reason (optional)"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        className="flex-1 min-w-[150px]"
                        data-testid="input-override-reason"
                      />
                      <Button onClick={handleOverride} disabled={!overrideScore || overrideMut.isPending} data-testid="button-save-override">
                        {overrideMut.isPending ? "Saving..." : "Save Override"}
                      </Button>
                    </div>
                    {data.overrideScore && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">Current override: <strong>{data.overrideScore}</strong></span>
                        {data.overrideReason && <span className="text-xs text-muted-foreground">— {data.overrideReason}</span>}
                        <Button variant="outline" size="sm" onClick={handleClear} disabled={clearMut.isPending} data-testid="button-clear-override">
                          <RotateCcw className="w-3 h-3 mr-1" />
                          {clearMut.isPending ? "Clearing..." : "Clear Override"}
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-override-disabled">
                    <Info className="w-4 h-4 flex-shrink-0" />
                    Score override available only in weekly view
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  testId,
  valueClass,
}: {
  icon: any;
  label: string;
  value: string;
  testId: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-lg font-bold ${valueClass || ""}`} data-testid={testId}>{value}</p>
      </CardContent>
    </Card>
  );
}
