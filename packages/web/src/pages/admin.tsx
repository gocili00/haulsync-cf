import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Truck, DollarSign, Activity, Server } from "lucide-react";

export default function AdminPage() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: auditLogs, isLoading: logsLoading } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
  });

  const { data: envInfo } = useQuery<{ hostname: string; environment: string; dbIdentifier: string }>({
    queryKey: ["/api/env-info"],
  });

  const summaryCards = [
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "Active Drivers", value: stats?.activeDrivers ?? 0, icon: Truck, color: "text-chart-2", bg: "bg-chart-2/10" },
    { label: "Total Loads", value: stats?.totalLoads ?? 0, icon: Truck, color: "text-chart-3", bg: "bg-chart-3/10" },
    { label: "Total Payroll", value: stats?.totalPayroll ? `$${Number(stats.totalPayroll).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "$0.00", icon: DollarSign, color: "text-chart-4", bg: "bg-chart-4/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-title">Admin Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Company overview and audit logs</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((c, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              {statsLoading ? (
                <div className="space-y-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-12" /></div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{c.label}</p>
                    <p className="text-2xl font-bold mt-1 tabular-nums">{c.value}</p>
                  </div>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-md ${c.bg} flex items-center justify-center`}>
                    <c.icon className={`w-5 h-5 ${c.color}`} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold" data-testid="text-audit-log-title">Company Audit Log</h3>
          </div>
          <Badge variant="secondary" className="text-xs">{(auditLogs ?? []).length} entries</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="p-5 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (auditLogs ?? []).length === 0 ? (
            <div className="p-8 text-center">
              <Activity className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No audit log entries yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(auditLogs ?? []).slice(0, 50).map((log: any) => (
                    <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{log.actorName || `User #${log.actorId}`}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{log.action}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.entity} #{log.entityId}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {envInfo && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground/60 pt-2" data-testid="text-env-info">
          <Server className="w-3 h-3" />
          <span>Environment: {envInfo.hostname} ({envInfo.environment})</span>
          <span className="mx-1">|</span>
          <span>DB: {envInfo.dbIdentifier}</span>
        </div>
      )}
    </div>
  );
}
