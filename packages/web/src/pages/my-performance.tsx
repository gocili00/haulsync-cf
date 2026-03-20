import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { tenantQueryKey } from "@/lib/tenantQueryKey";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Activity,
  Truck,
  Users,
  DollarSign,
  Route,
  Package,
  TrendingUp,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";

const PAY_MODEL_LABELS: Record<string, string> = {
  PER_TRUCK: "Per Truck",
  PERCENT_REVENUE: "% of Revenue",
  PER_LOAD: "Per Load",
};

const PAY_MODEL_DESC: Record<string, string> = {
  PER_TRUCK: "Earnings based on number of assigned trucks",
  PERCENT_REVENUE: "Earnings based on percentage of revenue handled",
  PER_LOAD: "Earnings based on number of loads dispatched",
};

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export default function MyPerformancePage() {
  const { user } = useAuth();

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstOfMonth.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);

  const { data, isLoading } = useQuery<{ summary: any }>({
    queryKey: tenantQueryKey(user, "/api/dispatcher-performance", { startDate, endDate }),
    enabled: !!user?.id && !!user?.companyId,
  });

  const summary = data?.summary;

  const summaryCards = [
    {
      label: "My Earnings",
      value: summary ? fmt$(summary.earnings) : "—",
      icon: DollarSign,
      color: "text-green-400",
      bg: "bg-green-400/10",
      testId: "card-earnings",
    },
    {
      label: "Loads Handled",
      value: summary ? fmtNum(summary.loadsHandled) : "—",
      icon: Package,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
      testId: "card-loads-handled",
    },
    {
      label: "Revenue Handled",
      value: summary ? fmt$(summary.revenueHandled) : "—",
      icon: TrendingUp,
      color: "text-violet-400",
      bg: "bg-violet-400/10",
      testId: "card-revenue-handled",
    },
    {
      label: "Miles Handled",
      value: summary ? fmtNum(summary.milesHandled) : "—",
      icon: Route,
      color: "text-orange-400",
      bg: "bg-orange-400/10",
      testId: "card-miles-handled",
    },
    {
      label: "Assigned Drivers",
      value: summary ? String(summary.assignedDrivers) : "—",
      icon: Users,
      color: "text-sky-400",
      bg: "bg-sky-400/10",
      testId: "card-assigned-drivers",
    },
    {
      label: "Assigned Trucks",
      value: summary ? String(summary.assignedTrucks) : "—",
      icon: Truck,
      color: "text-amber-400",
      bg: "bg-amber-400/10",
      testId: "card-assigned-trucks",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">My Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View your dispatch activity and earnings for the selected period
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Date Range</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="start-date" className="text-xs">From</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
                data-testid="input-start-date"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="end-date" className="text-xs">To</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9"
                data-testid="input-end-date"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} data-testid={`stat-${card.testId}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`${card.bg} rounded-lg p-2 flex-shrink-0`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground leading-none mb-1">{card.label}</p>
                  {isLoading ? (
                    <Skeleton className="h-5 w-20" />
                  ) : (
                    <p className="text-lg font-bold tabular-nums" data-testid={`value-${card.testId}`}>{card.value}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Pay Settings</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-2/3" />
            </div>
          ) : summary?.payModel ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Pay Model</span>
                <Badge variant="secondary" data-testid="badge-pay-model">
                  {PAY_MODEL_LABELS[summary.payModel] ?? summary.payModel}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Pay Rate</span>
                <span className="text-sm font-medium tabular-nums" data-testid="text-pay-rate">
                  {summary.payModel === "PERCENT_REVENUE"
                    ? `${summary.payRate}%`
                    : summary.payModel === "PER_TRUCK"
                    ? `${fmt$(summary.payRate)} / truck`
                    : `${fmt$(summary.payRate)} / load`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Assigned Trucks</span>
                <span className="text-sm font-medium" data-testid="text-truck-access-count">
                  {summary.assignedTrucks === 0
                    ? "All trucks (no restriction)"
                    : `${summary.assignedTrucks} truck${summary.assignedTrucks !== 1 ? "s" : ""}`}
                </span>
              </div>
              {summary.assignedDrivers > 0 && summary.assignedTrucks === 0 && (
                <div className="flex items-start gap-2 text-xs text-yellow-500 border border-yellow-500/20 rounded p-2 bg-yellow-500/5" data-testid="warn-no-truck-access">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>No truck access restrictions configured. Contact your admin if specific truck access should be assigned.</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground italic border-t pt-3">
                {PAY_MODEL_DESC[summary.payModel]}
              </p>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No pay model configured yet. Contact your admin.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
