import { useState, useEffect, useRef, useCallback } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, User as UserIcon, Phone, Mail, CreditCard, Users, Truck, AlertTriangle } from "lucide-react";

function isProfileIncomplete(driver: any): boolean {
  const p = driver?.profile;
  if (!p) return true;
  if (!p.employmentType) return true;
  if (!p.fuelPaidBy) return true;
  const payModel = p.payModel || "CPM";
  if (payModel === "CPM" && (!p.ratePerMile || parseFloat(p.ratePerMile) <= 0)) return true;
  if (payModel === "REVENUE_PERCENT" && (!p.revenueSharePercent || parseFloat(p.revenueSharePercent) <= 0)) return true;
  if (payModel === "FLAT_FEE" && (!p.flatFeeAmount || parseFloat(p.flatFeeAmount) <= 0)) return true;
  return false;
}

const PAGE_LIMIT = 20;

export default function DriversPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [accumulatedItems, setAccumulatedItems] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setOffset(0);
      setAccumulatedItems([]);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const { data, isLoading } = useQuery<{ items: any[]; total: number; offset: number; hasMore: boolean }>({
    queryKey: tenantQueryKey(user, "/api/drivers", { search: debouncedSearch, limit: String(PAGE_LIMIT), offset: String(offset) }),
    enabled: !!user?.id && !!user?.companyId,
  });

  useEffect(() => {
    if (data?.items) {
      if (data.offset === 0) {
        setAccumulatedItems(data.items);
      } else {
        setAccumulatedItems((prev) => {
          const existingIds = new Set(prev.map((d: any) => d.id));
          const newItems = data.items.filter((d: any) => !existingIds.has(d.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [data]);

  const { data: dispatchers } = useQuery<any[]>({
    queryKey: tenantQueryKey(user, "/api/dispatchers"),
    enabled: !!user?.id && !!user?.companyId && (user?.role === "ADMIN" || user?.role === "SUPERADMIN"),
  });

  const canManageDrivers = user?.role === "ADMIN" || user?.role === "DISPATCHER";
  const canAssignDispatcher = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-drivers-title">Drivers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.role === "DISPATCHER" ? "Your assigned drivers" : "Manage your driver roster"}
          </p>
        </div>
        {canManageDrivers && (
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingDriver(null); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-driver">
                <Plus className="w-4 h-4 mr-2" />
                Add Driver
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingDriver ? "Edit Driver" : "Add Driver"}</DialogTitle>
              </DialogHeader>
              <DriverForm
                driver={editingDriver}
                onSuccess={() => {
                  setDialogOpen(false);
                  setEditingDriver(null);
                  setOffset(0);
                  setAccumulatedItems([]);
                  queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/drivers") });
                  toast({ title: editingDriver ? "Driver updated" : "Driver added" });
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search drivers..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
          data-testid="input-search-drivers"
        />
      </div>

      {isLoading && accumulatedItems.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : accumulatedItems.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <UserIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No drivers found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "Try a different search term" : "Add your first driver to get started"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {accumulatedItems.map((driver: any) => (
              <DriverCard
                key={driver.id}
                driver={driver}
                dispatchers={dispatchers ?? []}
                canEdit={canManageDrivers}
                canAssignDispatcher={canAssignDispatcher}
                onEdit={() => {
                  setEditingDriver(driver);
                  setDialogOpen(true);
                }}
              />
            ))}
          </div>
          {data?.hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOffset((prev) => prev + PAGE_LIMIT)}
                disabled={isLoading}
                data-testid="button-load-more-drivers"
              >
                {isLoading ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DriverCard({ driver, dispatchers, canEdit, canAssignDispatcher, onEdit }: {
  driver: any;
  dispatchers: any[];
  canEdit: boolean;
  canAssignDispatcher: boolean;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const empTypeLabels: Record<string, string> = {
    W2_COMPANY_DRIVER: "W2",
    N1099_COMPANY_DRIVER: "1099",
    OWNER_OPERATOR: "O/O",
    LEASE_TO_PURCHASE: "LTP",
  };

  const { user } = useAuth();
  const assignMutation = useMutation({
    mutationFn: async (dispatcherId: number | null) => {
      return apiRequest("PATCH", `/api/drivers/${driver.id}/assign-dispatcher`, { dispatcherId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/drivers") });
      toast({ title: "Dispatcher assignment updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const initials = `${(driver.firstName || "")[0] || ""}${(driver.lastName || "")[0] || ""}`.toUpperCase();
  const currentDispatcherId = driver.profile?.assignedDispatcherId;

  const incomplete = isProfileIncomplete(driver);

  return (
    <Card className="hover-elevate" data-testid={`card-driver-${driver.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar>
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold truncate" data-testid={`text-driver-name-${driver.id}`}>{driver.firstName} {driver.lastName}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <Badge variant={driver.profile?.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">
                  {driver.profile?.status || "ACTIVE"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {empTypeLabels[driver.profile?.employmentType] || "W2"}
                </Badge>
                {incomplete && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[10px] text-yellow-500"
                    title="Profile incomplete — pay setup may be missing"
                    data-testid={`badge-profile-incomplete-${driver.id}`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Incomplete
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 text-xs text-muted-foreground">
          {driver.email && (
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{driver.email}</span>
            </div>
          )}
          {driver.profile?.phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{driver.profile.phone}</span>
            </div>
          )}
          {driver.profile?.ratePerMile && (
            <div className="flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{(Number(driver.profile.ratePerMile) * 100).toFixed(0)} CPM (${Number(driver.profile.ratePerMile).toFixed(2)}/mi)</span>
            </div>
          )}
          <div className="flex items-center gap-2" data-testid={`text-driver-last-truck-${driver.id}`}>
            <Truck className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Last truck: {driver.lastTruckNumber ? driver.lastTruckNumber : "—"}</span>
          </div>
        </div>

        {user?.role !== "DISPATCHER" && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">Dispatcher:</span>
            {canAssignDispatcher ? (
              <Select
                value={currentDispatcherId ? String(currentDispatcherId) : "unassigned"}
                onValueChange={(v) => {
                  const newId = v === "unassigned" ? null : parseInt(v);
                  assignMutation.mutate(newId);
                }}
              >
                <SelectTrigger className="h-7 text-xs flex-1 min-w-0" data-testid={`select-dispatcher-${driver.id}`}>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {dispatchers.map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.firstName} {d.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-foreground text-xs" data-testid={`text-assigned-dispatcher-${driver.id}`}>
                {driver.assignedDispatcherName || "Unassigned"}
              </span>
            )}
          </div>
        </div>
        )}

        {canEdit && (
          <div className="mt-3 pt-3 border-t">
            <Button variant="ghost" size="sm" className="w-full" onClick={onEdit} data-testid={`button-edit-driver-${driver.id}`}>
              Edit Profile
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DriverForm({ driver, onSuccess }: { driver?: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    firstName: driver?.firstName || "",
    lastName: driver?.lastName || "",
    email: driver?.email || "",
    password: "",
    phone: driver?.profile?.phone || "",
    address: driver?.profile?.address || "",
    cdlNumber: driver?.profile?.cdlNumber || "",
    cdlExpiration: driver?.profile?.cdlExpiration || "",
    medicalExpiration: driver?.profile?.medicalExpiration || "",
    ratePerMileCpm: driver?.profile?.ratePerMile ? (Number(driver.profile.ratePerMile) * 100).toFixed(0) : "",
    payModel: driver?.profile?.payModel || "CPM",
    revenueSharePercent: driver?.profile?.revenueSharePercent ? String(driver.profile.revenueSharePercent) : "",
    flatFeeAmount: driver?.profile?.flatFeeAmount ? String(driver.profile.flatFeeAmount) : "",
    fuelPaidBy: driver?.profile?.fuelPaidBy || "COMPANY",
    employmentType: driver?.profile?.employmentType || "W2_COMPANY_DRIVER",
    status: driver?.profile?.status || "ACTIVE",
    notes: driver?.profile?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (driver) {
        return apiRequest("PATCH", `/api/drivers/${driver.id}`, data);
      }
      return apiRequest("POST", "/api/drivers", data);
    },
    onSuccess: () => onSuccess(),
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ratePerMile = form.ratePerMileCpm ? (Number(form.ratePerMileCpm) / 100).toFixed(4) : "0.0000";
    mutation.mutate({
      ...form,
      ratePerMile,
      ratePerMileCpm: undefined,
      revenueSharePercent: form.revenueSharePercent ? Number(form.revenueSharePercent) : null,
      flatFeeAmount: form.flatFeeAmount ? form.flatFeeAmount : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>First name</Label>
          <Input data-testid="input-driver-first-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Last name</Label>
          <Input data-testid="input-driver-last-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input data-testid="input-driver-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </div>
      {!driver && (
        <div className="space-y-1.5">
          <Label>Password</Label>
          <Input data-testid="input-driver-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Phone</Label>
        <Input data-testid="input-driver-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
      </div>
      <div className="space-y-1.5">
        <Label>Address</Label>
        <Input data-testid="input-driver-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>CDL Number</Label>
          <Input data-testid="input-driver-cdl" value={form.cdlNumber} onChange={(e) => setForm({ ...form, cdlNumber: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>CDL Expiration</Label>
          <Input data-testid="input-driver-cdl-exp" type="date" value={form.cdlExpiration} onChange={(e) => setForm({ ...form, cdlExpiration: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Medical Expiration</Label>
          <Input data-testid="input-driver-med-exp" type="date" value={form.medicalExpiration} onChange={(e) => setForm({ ...form, medicalExpiration: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Rate (CPM)</Label>
          <Input data-testid="input-driver-rate" type="number" value={form.ratePerMileCpm} onChange={(e) => setForm({ ...form, ratePerMileCpm: e.target.value })} placeholder="e.g. 65 for $0.65/mi" />
        </div>
      </div>
      <div className="border-t pt-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pay Model & Fuel</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Pay Model</Label>
            <Select value={form.payModel} onValueChange={(v) => setForm({ ...form, payModel: v })}>
              <SelectTrigger data-testid="select-pay-model"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CPM">CPM (Cents Per Mile)</SelectItem>
                <SelectItem value="REVENUE_PERCENT">Revenue %</SelectItem>
                <SelectItem value="FLAT_FEE">Flat Fee / Week</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fuel Paid By</Label>
            <Select value={form.fuelPaidBy} onValueChange={(v) => setForm({ ...form, fuelPaidBy: v })}>
              <SelectTrigger data-testid="select-fuel-paid-by"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="COMPANY">Company</SelectItem>
                <SelectItem value="DRIVER">Driver</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {form.payModel === "REVENUE_PERCENT" && (
          <div className="space-y-1.5">
            <Label>Revenue Share %</Label>
            <Input
              data-testid="input-revenue-share-percent"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.revenueSharePercent}
              onChange={(e) => setForm({ ...form, revenueSharePercent: e.target.value })}
              placeholder="e.g. 25 for 25%"
            />
          </div>
        )}
        {form.payModel === "FLAT_FEE" && (
          <div className="space-y-1.5">
            <Label>Flat Fee Amount ($/week)</Label>
            <Input
              data-testid="input-flat-fee-amount"
              type="number"
              min="0"
              step="0.01"
              value={form.flatFeeAmount}
              onChange={(e) => setForm({ ...form, flatFeeAmount: e.target.value })}
              placeholder="e.g. 1500.00"
            />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Employment Type</Label>
          <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}>
            <SelectTrigger data-testid="select-employment-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="W2_COMPANY_DRIVER">W2 Company Driver</SelectItem>
              <SelectItem value="N1099_COMPANY_DRIVER">1099 Company Driver</SelectItem>
              <SelectItem value="OWNER_OPERATOR">Owner Operator</SelectItem>
              <SelectItem value="LEASE_TO_PURCHASE">Lease To Purchase</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger data-testid="select-driver-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea data-testid="input-driver-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="resize-none" rows={3} />
      </div>
      <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-save-driver">
        {mutation.isPending ? "Saving..." : driver ? "Update Driver" : "Create Driver"}
      </Button>
    </form>
  );
}
