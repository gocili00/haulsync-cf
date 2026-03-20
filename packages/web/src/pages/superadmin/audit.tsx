import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ScrollText, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const LIMIT = 50;

export default function SuperadminAudit() {
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [detailLog, setDetailLog] = useState<any>(null);

  const queryParams = new URLSearchParams();
  if (companyFilter !== "ALL") queryParams.set("companyId", companyFilter);
  if (actionFilter) queryParams.set("action", actionFilter);
  queryParams.set("limit", String(LIMIT));
  queryParams.set("offset", String(offset));

  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/superadmin/audit", companyFilter, actionFilter, offset],
    queryFn: async () => {
      const res = await fetch(`/api/superadmin/audit?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
  });

  const { data: companies } = useQuery<any[]>({
    queryKey: ["/api/companies"],
  });

  const actionColor: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    LOAD_VOIDED: "destructive", LOAD_DELETED: "destructive", IMPERSONATION_STARTED: "destructive",
    IMPERSONATION_ENDED: "default", LOAD_RESTORED: "default", PAYROLL_UNLOCKED: "destructive",
    USER_DISABLED: "secondary", USER_ENABLED: "default", COMPANY_DEACTIVATED: "destructive",
    COMPANY_ACTIVATED: "default", USER_ROLE_CHANGED: "secondary",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-sa-audit-title">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform-wide audit trail</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filter by action (e.g., LOAD_VOIDED)..."
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setOffset(0); }}
                className="pl-9"
                data-testid="input-sa-audit-action"
              />
            </div>
            <Select value={companyFilter} onValueChange={(v) => { setCompanyFilter(v); setOffset(0); }}>
              <SelectTrigger className="w-44" data-testid="select-sa-audit-company">
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Companies</SelectItem>
                {(companies ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent className="p-5 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(logs ?? []).map((log: any) => (
                    <TableRow key={log.id} data-testid={`row-sa-audit-${log.id}`}>
                      <TableCell className="text-muted-foreground text-xs tabular-nums">{log.id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : "\u2014"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionColor[log.action] || "outline"} className="text-[10px] font-mono">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.entity && <span className="text-muted-foreground text-xs">{log.entity} #{log.entityId}</span>}
                      </TableCell>
                      <TableCell className="text-sm">{log.actorName || `User #${log.actorId}`}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.companyName || "\u2014"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setDetailLog(log)} data-testid={`button-sa-audit-detail-${log.id}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {(logs ?? []).length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">No audit logs found.</div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Showing {offset + 1} - {offset + (logs?.length || 0)}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))} data-testid="button-sa-audit-prev">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Prev
          </Button>
          <Button variant="outline" size="sm" disabled={(logs?.length || 0) < LIMIT} onClick={() => setOffset(offset + LIMIT)} data-testid="button-sa-audit-next">
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      <Dialog open={!!detailLog} onOpenChange={(open) => { if (!open) setDetailLog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="w-5 h-5" />
              Audit Log #{detailLog?.id}
            </DialogTitle>
          </DialogHeader>
          {detailLog && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-y-2">
                <span className="text-muted-foreground">Action:</span>
                <Badge variant={actionColor[detailLog.action] || "outline"} className="text-[10px] font-mono w-fit">{detailLog.action}</Badge>
                <span className="text-muted-foreground">Entity:</span>
                <span>{detailLog.entity} #{detailLog.entityId}</span>
                <span className="text-muted-foreground">Actor:</span>
                <span>{detailLog.actorName || `User #${detailLog.actorId}`}</span>
                <span className="text-muted-foreground">Timestamp:</span>
                <span>{detailLog.createdAt ? new Date(detailLog.createdAt).toLocaleString() : "\u2014"}</span>
                <span className="text-muted-foreground">Company:</span>
                <span>{detailLog.companyName || "\u2014"}</span>
                {detailLog.ip && (
                  <>
                    <span className="text-muted-foreground">IP:</span>
                    <span className="font-mono text-xs">{detailLog.ip}</span>
                  </>
                )}
              </div>
              {(detailLog.before || detailLog.after || detailLog.metadata) && (
                <div className="space-y-2">
                  {detailLog.before && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Before:</p>
                      <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto">{JSON.stringify(detailLog.before, null, 2)}</pre>
                    </div>
                  )}
                  {detailLog.after && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">After:</p>
                      <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto">{JSON.stringify(detailLog.after, null, 2)}</pre>
                    </div>
                  )}
                  {detailLog.metadata && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Metadata:</p>
                      <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto">{JSON.stringify(detailLog.metadata, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
