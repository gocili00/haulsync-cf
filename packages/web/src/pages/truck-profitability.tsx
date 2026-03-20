import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { tenantQueryKey } from "@/lib/tenantQueryKey";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Truck,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  MapPin,
  Building2,
  Info,
} from "lucide-react";

const PAGE_SIZE = 20;

type RangePreset = "this_week" | "last_week" | "mtd" | "last_month";

const presetLabels: Record<RangePreset, string> = {
  this_week: "This Week",
  last_week: "Last Week",
  mtd: "Month to Date",
  last_month: "Last Month",
};

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekBounds(date: Date): { start: string; end: string } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d); monday.setDate(diff);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return { start: toLocalDateStr(monday), end: toLocalDateStr(sunday) };
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
      return { startDate: toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: toLocalDateStr(now) };
    }
    case "last_month": {
      return {
        startDate: toLocalDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        endDate: toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    }
  }
}

function formatMoney(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n < 0
    ? `-$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMiles(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const OWNERSHIP_LABELS: Record<string, string> = {
  COMPANY_OWNED: "Company",
  OWNER_OPERATOR: "Owner-Op",
  LEASED: "Leased",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  IN_MAINTENANCE: "In Maint.",
};

export default function TruckProfitabilityPage() {
  const { user } = useAuth();
  const [preset, setPreset] = useState<RangePreset>("last_month");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [ownershipFilter, setOwnershipFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { startDate, endDate } = useMemo(() => computePresetDates(preset), [preset]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }

  function handlePresetChange(p: RangePreset) {
    setPreset(p);
    setPage(1);
  }

  const queryParams: Record<string, string> = {
    startDate,
    endDate,
    page: String(page),
    limit: String(PAGE_SIZE),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(ownershipFilter !== "ALL" ? { ownershipType: ownershipFilter } : {}),
    ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
  };

  const { data, isLoading } = useQuery<{
    items: any[];
    summary: {
      totalRevenue: string;
      totalDriverPay: string;
      totalCompanyCost: string;
      totalProfit: string;
      totalMiles: string;
      profitPerMile: string;
    };
    total: number;
    limit: number;
    offset: number;
    page: number;
    pageCount: number;
    loadsWithoutTruck: number;
    hasActiveCosts: boolean;
  }>({
    queryKey: tenantQueryKey(user, "/api/truck-profitability", queryParams),
    queryFn: async () => {
      const params = new URLSearchParams(queryParams).toString();
      const res = await fetch(`/api/truck-profitability?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!user?.id && !!user?.companyId,
  });

  const items = data?.items || [];
  const summary = data?.summary;
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;

  function SummaryCard({ label, value, icon: Icon, highlight }: { label: string; value: string; icon: any; highlight?: "positive" | "negative" | "neutral" }) {
    const colorClass = highlight === "positive" ? "text-emerald-400" : highlight === "negative" ? "text-red-400" : "text-foreground";
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
          <p className={`text-lg font-bold ${colorClass}`} data-testid={`summary-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6" />
            Truck Profitability
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Evaluate fleet performance and cost allocation by truck</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(presetLabels) as RangePreset[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={preset === p ? "default" : "outline"}
              onClick={() => handlePresetChange(p)}
              data-testid={`button-preset-${p}`}
            >
              {presetLabels[p]}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Total Revenue" value={formatMoney(summary.totalRevenue)} icon={DollarSign} />
          <SummaryCard label="Driver Pay" value={formatMoney(summary.totalDriverPay)} icon={DollarSign} />
          <SummaryCard label="Company Cost" value={formatMoney(summary.totalCompanyCost)} icon={Building2} />
          <SummaryCard
            label="Total Profit"
            value={formatMoney(summary.totalProfit)}
            icon={parseFloat(summary.totalProfit) >= 0 ? TrendingUp : TrendingDown}
            highlight={parseFloat(summary.totalProfit) >= 0 ? "positive" : "negative"}
          />
          <SummaryCard label="Total Miles" value={formatMiles(summary.totalMiles)} icon={MapPin} />
          <SummaryCard
            label="Profit / Mile"
            value={`$${parseFloat(summary.profitPerMile).toFixed(3)}`}
            icon={TrendingUp}
            highlight={parseFloat(summary.profitPerMile) >= 0.15 ? "positive" : "negative"}
          />
        </div>
      )}

      {/* Profit leak legend */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
        <span>Profit leak: trucks earning less than $0.15/mile</span>
      </div>

      {data && (data.loadsWithoutTruck ?? 0) > 0 && (
        <Card className="border-orange-500/30">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0" />
            <p className="text-sm text-orange-300" data-testid="text-loads-without-truck-banner">
              <span className="font-semibold">{data.loadsWithoutTruck}</span> load{data.loadsWithoutTruck !== 1 ? "s" : ""} are missing truck assignment and are excluded from truck profitability.
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.hasActiveCosts === false && (
        <Card className="border-muted">
          <CardContent className="flex items-center gap-3 py-3">
            <Info className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-active-costs-banner-trucks">
              No active company cost defaults configured. Profitability may be overstated.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search truck, VIN, make…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            data-testid="input-truck-search"
          />
        </div>
        <Select value={ownershipFilter} onValueChange={(v) => { setOwnershipFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]" data-testid="select-trigger-ownership-filter">
            <SelectValue placeholder="Ownership" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Ownership</SelectItem>
            <SelectItem value="COMPANY_OWNED">Company</SelectItem>
            <SelectItem value="OWNER_OPERATOR">Owner-Op</SelectItem>
            <SelectItem value="LEASED">Leased</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[130px]" data-testid="select-trigger-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="IN_MAINTENANCE">In Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {total} truck{total !== 1 ? "s" : ""} with loads in range
            </p>
            <p className="text-xs text-muted-foreground">{startDate} → {endDate}</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No trucks with loads found in the selected range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Truck</TableHead>
                    <TableHead>Ownership</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Miles</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Driver Pay</TableHead>
                    <TableHead className="text-right">Company Cost</TableHead>
                    <TableHead className="text-right">Cost/Mile</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Profit/Mile</TableHead>
                    <TableHead className="text-right">Loads</TableHead>
                    <TableHead>Drivers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row: any) => {
                    const profit = parseFloat(row.profit);
                    const profitPerMile = parseFloat(row.profitPerMile);
                    const isProfit = profit >= 0;
                    return (
                      <TableRow key={row.truckId} data-testid={`row-truck-prof-${row.truckId}`}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {row.profitLeak && (
                              <AlertCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" data-testid={`icon-profit-leak-${row.truckId}`} />
                            )}
                            <span className="font-medium">#{row.truckNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {OWNERSHIP_LABELS[row.ownershipType] || row.ownershipType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.status === "ACTIVE" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {STATUS_LABELS[row.status] || row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatMiles(row.miles)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatMoney(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {formatMoney(row.driverPay)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {formatMoney(row.companyCost)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          ${parseFloat(row.companyCostPerMile).toFixed(3)}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                          {formatMoney(row.profit)}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${profitPerMile >= 0.15 ? "text-emerald-400" : profitPerMile >= 0 ? "text-yellow-400" : "text-red-400"}`}>
                          ${profitPerMile.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {row.loadCount}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[160px]">
                            {(row.assignedDrivers || []).slice(0, 3).map((d: any) => (
                              <span key={d.id} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {d.firstName} {d.lastName?.charAt(0)}.
                              </span>
                            ))}
                            {row.assignedDrivers?.length > 3 && (
                              <span className="text-xs text-muted-foreground">+{row.assignedDrivers.length - 3}</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
