import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, DollarSign, ArrowUpRight, ArrowDownRight, RotateCcw, Check, User, ChevronRight, ChevronDown, Search, MapPin, Clock } from "lucide-react";

const CATEGORIES = [
  "EXTRA_STOP", "LAYOVER", "DETENTION", "BREAKDOWN",
  "INSPECTION_L1", "INSPECTION_L2", "INSPECTION_L3",
  "SAFETY_BONUS", "ESCROW", "ADVANCE", "FUEL", "INSURANCE", "OTHER"
];

export default function PayItemsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [accumulatedItems, setAccumulatedItems] = useState<any[]>([]);
  const [expandedDrivers, setExpandedDrivers] = useState<Set<number>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const isManager = user?.role === "DISPATCHER" || user?.role === "ADMIN" || user?.role === "SUPERADMIN";
  const isDriver = user?.role === "DRIVER";

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setOffset(0);
      setAccumulatedItems([]);
    }, 300);
  }, []);

  const handleTypeFilterChange = useCallback((value: string) => {
    setTypeFilter(value);
    setOffset(0);
    setAccumulatedItems([]);
  }, []);

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value);
    setOffset(0);
    setAccumulatedItems([]);
  }, []);

  const queryParams: Record<string, string> = { limit: "20", offset: String(offset) };
  if (debouncedSearch) queryParams.search = debouncedSearch;
  if (typeFilter !== "ALL") queryParams.type = typeFilter;
  if (statusFilter !== "ALL") queryParams.status = statusFilter;
  if (isManager) queryParams.groupByDriver = "true";

  const { data: payItemsData, isLoading } = useQuery<{ items: any[]; total: number; offset: number; hasMore: boolean }>({
    queryKey: tenantQueryKey(user, "/api/pay-items", queryParams),
  });

  useEffect(() => {
    if (payItemsData?.items) {
      if (payItemsData.offset === 0) {
        setAccumulatedItems(payItemsData.items);
      } else {
        setAccumulatedItems(prev => {
          const existingIds = new Set(prev.map((i: any) => i.id));
          const newItems = payItemsData.items.filter((i: any) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [payItemsData]);

  const { data: driversData } = useQuery<{ items: any[] }>({
    queryKey: tenantQueryKey(user, "/api/drivers", { limit: "100" }),
    enabled: isManager,
  });

  const drivers = driversData?.items;

  const approveMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("PATCH", `/api/pay-items/${id}/status`, { status: "APPROVED" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/pay-items") });
      toast({ title: "Pay item approved" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const typeIcons: Record<string, any> = {
    EARNING: <ArrowUpRight className="w-3.5 h-3.5 text-chart-2" />,
    DEDUCTION: <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />,
    REIMBURSEMENT: <RotateCcw className="w-3.5 h-3.5 text-primary" />,
  };

  const canApprove = user?.role === "DISPATCHER" || user?.role === "ADMIN";

  const driverGroups = useMemo(() => {
    if (!isManager || !drivers) return [];
    const groups: Record<number, { driver: any; items: any[]; totalAmount: number; pendingCount: number }> = {};

    for (const d of drivers) {
      groups[d.id] = { driver: d, items: [], totalAmount: 0, pendingCount: 0 };
    }

    for (const pi of accumulatedItems) {
      const dId = pi.driverUserId;
      if (!groups[dId]) {
        groups[dId] = {
          driver: { id: dId, firstName: pi.driverName?.split(" ")[0] || "Unknown", lastName: pi.driverName?.split(" ").slice(1).join(" ") || "" },
          items: [],
          totalAmount: 0,
          pendingCount: 0,
        };
      }
      groups[dId].items.push(pi);
      const amt = Number(pi.amount || 0);
      groups[dId].totalAmount += pi.type === "DEDUCTION" ? -amt : amt;
      if (pi.status === "SUBMITTED" || pi.status === "DRAFT") {
        groups[dId].pendingCount++;
      }
    }

    return Object.values(groups)
      .filter(g => g.items.length > 0)
      .sort((a, b) => {
        return `${a.driver.firstName} ${a.driver.lastName}`.localeCompare(`${b.driver.firstName} ${b.driver.lastName}`);
      });
  }, [isManager, drivers, accumulatedItems]);

  useEffect(() => {
    if (isManager && driverGroups.length > 0 && expandedDrivers.size === 0) {
      const first = driverGroups.find(g => g.items.length > 0);
      if (first) {
        setExpandedDrivers(new Set([first.driver.id]));
      }
    }
  }, [driverGroups.length > 0 && isManager]);

  const toggleDriver = (driverId: number) => {
    setExpandedDrivers(prev => {
      const next = new Set(prev);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      return next;
    });
  };

  const handleLoadMore = () => {
    setOffset(prev => prev + 20);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-pay-items-title">Pay Items</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isManager ? "Manage pay items grouped by driver" : "Manage earnings, deductions, and reimbursements"}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-pay-item">
              <Plus className="w-4 h-4 mr-2" />
              Add Pay Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Pay Item</DialogTitle>
            </DialogHeader>
            <PayItemForm
              onSuccess={() => {
                setDialogOpen(false);
                queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/pay-items") });
                toast({ title: "Pay item created" });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        {isManager && (
          <div className="relative flex-1 max-w-sm min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search drivers or descriptions..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
              data-testid="input-search-pay-items"
            />
          </div>
        )}
        <Select value={typeFilter} onValueChange={handleTypeFilterChange}>
          <SelectTrigger className="w-40" data-testid="select-pay-type-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            <SelectItem value="EARNING">Earnings</SelectItem>
            <SelectItem value="DEDUCTION">Deductions</SelectItem>
            <SelectItem value="REIMBURSEMENT">Reimbursements</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-40" data-testid="select-pay-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="SUBMITTED">Submitted</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="LOCKED">Locked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && accumulatedItems.length === 0 ? (
        <Card><CardContent className="p-5"><div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div></CardContent></Card>
      ) : isManager ? (
        <GroupedPayItemsView
          driverGroups={driverGroups}
          expandedDrivers={expandedDrivers}
          toggleDriver={toggleDriver}
          typeIcons={typeIcons}
          canApprove={canApprove}
          approveMutation={approveMutation}
          search={search}
          typeFilter={typeFilter}
          statusFilter={statusFilter}
        />
      ) : (
        <FlatPayItemsTable
          items={accumulatedItems}
          typeIcons={typeIcons}
          canApprove={canApprove}
          approveMutation={approveMutation}
        />
      )}

      {payItemsData?.hasMore && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoading}
            data-testid="button-load-more-pay-items"
          >
            {isLoading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function GroupedPayItemsView({
  driverGroups,
  expandedDrivers,
  toggleDriver,
  typeIcons,
  canApprove,
  approveMutation,
  search,
  typeFilter,
  statusFilter,
}: {
  driverGroups: any[];
  expandedDrivers: Set<number>;
  toggleDriver: (id: number) => void;
  typeIcons: Record<string, any>;
  canApprove: boolean;
  approveMutation: any;
  search: string;
  typeFilter: string;
  statusFilter: string;
}) {
  if (driverGroups.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <DollarSign className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No pay items found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search || typeFilter !== "ALL" || statusFilter !== "ALL" ? "Adjust your filters" : "Add your first pay item"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {driverGroups.map((group) => {
        const isExpanded = expandedDrivers.has(group.driver.id);
        const driverName = `${group.driver.firstName} ${group.driver.lastName}`;

        return (
          <Card key={group.driver.id} data-testid={`card-pay-driver-group-${group.driver.id}`}>
            <div
              className="flex items-center gap-4 p-4 cursor-pointer hover-elevate"
              onClick={() => toggleDriver(group.driver.id)}
              data-testid={`button-expand-pay-driver-${group.driver.id}`}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base truncate" data-testid={`text-pay-driver-name-${group.driver.id}`}>{driverName}</p>
                {group.driver.email && (
                  <p className="text-xs text-muted-foreground mt-0.5">{group.driver.email}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]" data-testid={`badge-pay-count-${group.driver.id}`}>
                  <DollarSign className="w-3 h-3 mr-1" />
                  {group.items.length} items
                </Badge>
                <Badge
                  variant="secondary"
                  className={`text-[10px] ${group.totalAmount >= 0 ? "text-chart-2" : "text-destructive"}`}
                  data-testid={`badge-pay-total-${group.driver.id}`}
                >
                  {group.totalAmount >= 0 ? "+" : ""}${Math.abs(group.totalAmount).toFixed(2)}
                </Badge>
                {group.pendingCount > 0 && (
                  <Badge variant="default" className="text-[10px]" data-testid={`badge-pay-pending-${group.driver.id}`}>
                    <Clock className="w-3 h-3 mr-1" />
                    {group.pendingCount} pending
                  </Badge>
                )}
              </div>
              <div className="flex-shrink-0">
                {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
              </div>
            </div>

            {isExpanded && (
              <CardContent className="p-0 border-t">
                {group.items.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-sm text-muted-foreground">No pay items for this driver</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                          {canApprove && <TableHead className="w-20"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.items.map((item: any) => (
                          <PayItemRow key={item.id} item={item} typeIcons={typeIcons} canApprove={canApprove} approveMutation={approveMutation} showDriver={false} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function FlatPayItemsTable({
  items,
  typeIcons,
  canApprove,
  approveMutation,
}: {
  items: any[];
  typeIcons: Record<string, any>;
  canApprove: boolean;
  approveMutation: any;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <DollarSign className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No pay items found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                {canApprove && <TableHead className="w-20"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item: any) => (
                <PayItemRow key={item.id} item={item} typeIcons={typeIcons} canApprove={canApprove} approveMutation={approveMutation} showDriver={false} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PayItemRow({ item, typeIcons, canApprove, approveMutation, showDriver }: { item: any; typeIcons: Record<string, any>; canApprove: boolean; approveMutation: any; showDriver: boolean }) {
  return (
    <TableRow data-testid={`row-pay-item-table-${item.id}`}>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {typeIcons[item.type]}
          <span className="text-xs font-medium">{item.type}</span>
        </div>
      </TableCell>
      <TableCell className="text-sm">{item.category.replace(/_/g, " ")}</TableCell>
      {showDriver && <TableCell className="text-sm">{item.driverName || "—"}</TableCell>}
      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{item.description || "—"}</TableCell>
      <TableCell className="text-right">
        <span className={`text-sm font-semibold tabular-nums ${item.type === "DEDUCTION" ? "text-destructive" : "text-chart-2"}`}>
          {item.type === "DEDUCTION" ? "-" : "+"}${Number(item.amount).toFixed(2)}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={item.status === "APPROVED" ? "default" : "secondary"} className="text-[10px]">
          {item.status}
        </Badge>
      </TableCell>
      {canApprove && (
        <TableCell>
          {item.status === "SUBMITTED" && (
            <Button
              variant="ghost" size="sm"
              onClick={() => approveMutation.mutate(item.id)}
              disabled={approveMutation.isPending}
              data-testid={`button-approve-pay-item-${item.id}`}
            >
              <Check className="w-4 h-4" />
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

function PayItemForm({ onSuccess }: { onSuccess: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: driversData } = useQuery<{ items: any[] }>({
    queryKey: tenantQueryKey(user, "/api/drivers", { limit: "100" }),
  });

  const drivers = driversData?.items;

  const [form, setForm] = useState({
    driverUserId: user?.role === "DRIVER" ? user?.id?.toString() || "" : "",
    type: "EARNING",
    category: "OTHER",
    amount: "",
    description: "",
    status: user?.role === "DRIVER" ? "SUBMITTED" : "DRAFT",
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/pay-items", data),
    onSuccess: () => onSuccess(),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      driverUserId: parseInt(form.driverUserId),
      amount: form.amount,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {user?.role !== "DRIVER" && (
        <div className="space-y-1.5">
          <Label>Driver</Label>
          <Select value={form.driverUserId} onValueChange={(v) => setForm({ ...form, driverUserId: v })}>
            <SelectTrigger data-testid="select-pay-item-driver"><SelectValue placeholder="Select driver" /></SelectTrigger>
            <SelectContent>
              {(drivers ?? []).map((d: any) => (
                <SelectItem key={d.id} value={d.id.toString()}>{d.firstName} {d.lastName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger data-testid="select-pay-item-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EARNING">Earning</SelectItem>
              <SelectItem value="DEDUCTION">Deduction</SelectItem>
              <SelectItem value="REIMBURSEMENT">Reimbursement</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger data-testid="select-pay-item-category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Amount ($)</Label>
        <Input data-testid="input-pay-item-amount" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required placeholder="0.00" />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea data-testid="input-pay-item-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="resize-none" rows={2} placeholder="Optional note..." />
      </div>
      <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-save-pay-item">
        {mutation.isPending ? "Saving..." : "Add Pay Item"}
      </Button>
    </form>
  );
}
