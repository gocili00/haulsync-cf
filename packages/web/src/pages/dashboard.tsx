import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { tenantQueryKey } from "@/lib/tenantQueryKey";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Truck, DollarSign, Clock, CheckCircle2, AlertCircle } from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery<any>({
    queryKey: tenantQueryKey(user, "/api/dashboard/stats"),
    enabled: !!user?.id && !!user?.companyId,
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const widgets = [
    {
      label: "This Week Miles",
      value: stats?.weekMiles ?? 0,
      icon: TrendingUp,
      suffix: "mi",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "This Week Pay",
      value: stats?.weekPay ? `$${Number(stats.weekPay).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "$0.00",
      icon: DollarSign,
      suffix: "",
      color: "text-chart-2",
      bgColor: "bg-chart-2/10",
    },
    {
      label: "Pending Loads",
      value: stats?.pendingLoads ?? 0,
      icon: Truck,
      suffix: "",
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
    {
      label: "Pending Approvals",
      value: stats?.pendingApprovals ?? 0,
      icon: Clock,
      suffix: "",
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">
          {getGreeting()}, {user?.firstName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here's your overview for this week
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {widgets.map((w, i) => (
          <Card key={i} data-testid={`card-widget-${i}`}>
            <CardContent className="p-5">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{w.label}</p>
                    <p className="text-2xl font-bold tabular-nums">
                      {typeof w.value === "number" ? w.value.toLocaleString() : w.value}
                      {w.suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{w.suffix}</span>}
                    </p>
                  </div>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-md ${w.bgColor} flex items-center justify-center`}>
                    <w.icon className={`w-5 h-5 ${w.color}`} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentLoads />
        <RecentPayItems />
      </div>
    </div>
  );
}

function RecentLoads() {
  const { user } = useAuth();
  const { data: loads, isLoading } = useQuery<{items: any[]}>({
    queryKey: tenantQueryKey(user, "/api/loads", { limit: "5" }),
    enabled: !!user?.id && !!user?.companyId,
  });

  const recentLoads = (loads?.items ?? []);

  const statusColors: Record<string, string> = {
    DRAFT: "secondary",
    BOL_UPLOADED: "default",
    OCR_DONE: "default",
    SUBMITTED: "default",
    VERIFIED: "default",
    APPROVED: "default",
    LOCKED: "outline",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <h3 className="font-semibold">Recent Loads</h3>
        <Badge variant="secondary" className="text-xs">{recentLoads.length}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : recentLoads.length === 0 ? (
          <div className="p-8 text-center">
            <Truck className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No loads yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentLoads.map((load: any) => (
              <div key={load.id} className="px-5 py-3 flex items-center justify-between gap-3" data-testid={`row-load-${load.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{load.pickupAddress}</p>
                  <p className="text-xs text-muted-foreground truncate">{load.deliveryAddress}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {load.finalMiles && (
                    <span className="text-xs text-muted-foreground tabular-nums">{Number(load.finalMiles).toLocaleString()} mi</span>
                  )}
                  <Badge variant={statusColors[load.status] as any || "secondary"} className="text-[10px]">
                    {load.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentPayItems() {
  const { user } = useAuth();
  const { data: payItems, isLoading } = useQuery<{items: any[]}>({
    queryKey: tenantQueryKey(user, "/api/pay-items", { limit: "5" }),
    enabled: !!user?.id && !!user?.companyId,
  });

  const recent = (payItems?.items ?? []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <h3 className="font-semibold">Recent Pay Items</h3>
        <Badge variant="secondary" className="text-xs">{recent.length}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : recent.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No pay items yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((item: any) => (
              <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3" data-testid={`row-pay-item-${item.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.category.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">{item.description || item.type}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-sm font-medium tabular-nums ${item.type === "DEDUCTION" ? "text-destructive" : "text-chart-2"}`}>
                    {item.type === "DEDUCTION" ? "-" : "+"}${Number(item.amount).toFixed(2)}
                  </span>
                  <Badge variant={item.status === "APPROVED" ? "default" : "secondary"} className="text-[10px]">
                    {item.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
