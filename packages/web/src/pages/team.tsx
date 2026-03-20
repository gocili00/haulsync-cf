import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { tenantQueryKey } from "@/lib/tenantQueryKey";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Users, UserPlus, Mail, Copy, CheckCircle2, XCircle, Clock, Ban,
  Shield, Truck, Radio, UserCog, Settings2, UserX, UserCheck, Trash2,
  DollarSign, Search, Plus, Pencil,
} from "lucide-react";

const roleIcons: Record<string, typeof Shield> = {
  ADMIN: Shield,
  DISPATCHER: Radio,
  DRIVER: Truck,
  SUPERADMIN: UserCog,
};

const roleLabels: Record<string, string> = {
  DRIVER: "Driver",
  DISPATCHER: "Dispatcher",
  ADMIN: "Admin",
  SUPERADMIN: "Super Admin",
};

function canDeleteUser(currentRole: string, targetRole: string): boolean {
  if (currentRole === "SUPERADMIN") return true;
  if (currentRole === "ADMIN") return targetRole === "DISPATCHER" || targetRole === "DRIVER";
  if (currentRole === "DISPATCHER") return targetRole === "DRIVER";
  return false;
}

export default function TeamPage() {
  const { user } = useAuth();

  const titleByRole: Record<string, string> = {
    DISPATCHER: "My Drivers",
    ADMIN: "Team Management",
    SUPERADMIN: "Team Management",
  };

  const subtitleByRole: Record<string, string> = {
    DISPATCHER: "View and manage your assigned drivers",
    ADMIN: "Manage dispatchers, drivers, invites, and company settings",
    SUPERADMIN: "Manage users, invites, and company settings",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-team-title">
            {titleByRole[user?.role || ""] || "Team"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {subtitleByRole[user?.role || ""] || ""}
          </p>
        </div>
      </div>

      {user?.companyId && (user?.role === "ADMIN" || user?.role === "SUPERADMIN") && (
        <CompanySettingsSection companyId={user.companyId} userRole={user.role} />
      )}
      {user?.companyId && (user?.role === "ADMIN" || user?.role === "SUPERADMIN") && (
        <CompanyCostSection companyId={user.companyId} />
      )}
      {user?.companyId && (user?.role === "ADMIN" || user?.role === "SUPERADMIN") && (
        <TrucksSection companyId={user.companyId} />
      )}
      {user?.companyId && (user?.role === "ADMIN" || user?.role === "SUPERADMIN") && (
        <DispatcherTrucksSection companyId={user.companyId} />
      )}
      {user?.companyId && <UsersSection companyId={user.companyId} currentUserId={user.id} userRole={user.role} />}
      {user?.companyId && (user?.role === "ADMIN" || user?.role === "SUPERADMIN") && (
        <TeamInvitesSection companyId={user.companyId} userRole={user.role} />
      )}
    </div>
  );
}

function CompanySettingsSection({ companyId, userRole }: { companyId: number; userRole: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [revenueMode, setRevenueMode] = useState<string>("");
  const [revenueRpm, setRevenueRpm] = useState("");
  const [revenueFlat, setRevenueFlat] = useState("");
  const [revenueDirty, setRevenueDirty] = useState(false);

  const { data: settings, isLoading } = useQuery<any>({
    queryKey: tenantQueryKey(user, "/api/company-settings"),
    enabled: !!user?.id && !!user?.companyId,
  });

  useEffect(() => {
    if (settings) {
      setRevenueMode(settings.defaultRevenueMode ?? "MANUAL");
      setRevenueRpm(settings.defaultRevenueRpm ?? "");
      setRevenueFlat(settings.defaultRevenueFlat ?? "");
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      return apiRequest("PUT", "/api/company-settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/company-settings") });
      setRevenueDirty(false);
      toast({ title: "Settings updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const currentMode = revenueMode ?? settings?.defaultRevenueMode ?? "MANUAL";
  const currentRpm = revenueRpm !== "" ? revenueRpm : (settings?.defaultRevenueRpm ?? "");
  const currentFlat = revenueFlat !== "" ? revenueFlat : (settings?.defaultRevenueFlat ?? "");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Company Settings</h3>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Allow admins to invite other admins</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, company admins can invite additional admin users
                </p>
              </div>
              <Switch
                checked={settings?.allowAdminInvites || false}
                onCheckedChange={(checked) => updateMutation.mutate({ allowAdminInvites: checked })}
                disabled={updateMutation.isPending}
                data-testid="switch-allow-admin-invites"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Dispatchers can see unassigned drivers</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, dispatchers can also view loads from drivers not assigned to anyone
                </p>
              </div>
              <Switch
                checked={settings?.dispatcherCanSeeUnassigned || false}
                onCheckedChange={(checked) => updateMutation.mutate({ dispatcherCanSeeUnassigned: checked })}
                disabled={updateMutation.isPending}
                data-testid="switch-dispatcher-see-unassigned"
              />
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">Revenue Defaults</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Set how revenue is calculated for new loads. This can be overridden per load.
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Revenue Mode</Label>
                  <Select
                    value={currentMode}
                    onValueChange={(val) => { setRevenueMode(val); setRevenueDirty(true); }}
                    data-testid="select-revenue-mode"
                  >
                    <SelectTrigger data-testid="select-trigger-revenue-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANUAL">Manual Entry</SelectItem>
                      <SelectItem value="AUTO_RPM">Auto (Rate Per Mile)</SelectItem>
                      <SelectItem value="FLAT">Flat Rate Per Load</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {currentMode === "AUTO_RPM" && (
                  <div>
                    <Label className="text-xs">Default Rate Per Mile ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 2.50"
                      value={currentRpm}
                      onChange={(e) => { setRevenueRpm(e.target.value); setRevenueDirty(true); }}
                      data-testid="input-revenue-rpm"
                    />
                  </div>
                )}

                {currentMode === "FLAT" && (
                  <div>
                    <Label className="text-xs">Default Flat Rate ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 500.00"
                      value={currentFlat}
                      onChange={(e) => { setRevenueFlat(e.target.value); setRevenueDirty(true); }}
                      data-testid="input-revenue-flat"
                    />
                  </div>
                )}

                {revenueDirty && (
                  <Button
                    size="sm"
                    onClick={() => updateMutation.mutate({
                      defaultRevenueMode: currentMode,
                      defaultRevenueRpm: currentMode === "AUTO_RPM" ? currentRpm || null : null,
                      defaultRevenueFlat: currentMode === "FLAT" ? currentFlat || null : null,
                    })}
                    disabled={updateMutation.isPending}
                    data-testid="button-save-revenue-settings"
                  >
                    Save Revenue Settings
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const EMP_TYPE_OPTIONS = [
  { value: "ALL", label: "All Drivers" },
  { value: "W2_COMPANY_DRIVER", label: "W2 Company Driver" },
  { value: "N1099_COMPANY_DRIVER", label: "1099 Company Driver" },
  { value: "OWNER_OPERATOR", label: "Owner Operator" },
  { value: "LEASE_TO_PURCHASE", label: "Lease To Purchase" },
];

const EMP_TYPE_LABEL: Record<string, string> = {
  W2_COMPANY_DRIVER: "W2",
  N1099_COMPANY_DRIVER: "1099",
  OWNER_OPERATOR: "Owner Op",
  LEASE_TO_PURCHASE: "LTP",
};

const COST_SCOPE_OPTIONS = [
  { value: "GLOBAL",      label: "Global",      desc: "Divided across all fleet miles (e.g. office, software)" },
  { value: "DRIVER_TYPE", label: "Driver Type",  desc: "Shared across drivers of this employment type" },
  { value: "TRUCK",       label: "Per Truck",    desc: "Applied directly per driver/truck (e.g. truck payment, insurance)" },
];

const COST_SCOPE_LABEL: Record<string, string> = {
  GLOBAL: "Global",
  DRIVER_TYPE: "Type",
  TRUCK: "Per Truck",
};

const COST_TEMPLATES: Record<string, { name: string; amount: string; frequency: string; employmentType: string | null; costScope: string }[]> = {
  general: [
    { name: "General Liability Insurance", amount: "200.00", frequency: "MONTHLY", employmentType: null, costScope: "GLOBAL" },
    { name: "Cargo Insurance",             amount: "150.00", frequency: "MONTHLY", employmentType: null, costScope: "GLOBAL" },
    { name: "Workers Comp Insurance",      amount: "175.00", frequency: "MONTHLY", employmentType: null, costScope: "GLOBAL" },
    { name: "ELD / Telematics",            amount: "35.00",  frequency: "MONTHLY", employmentType: null, costScope: "GLOBAL" },
    { name: "Drug Testing",                amount: "25.00",  frequency: "MONTHLY", employmentType: null, costScope: "GLOBAL" },
    { name: "Compliance / FMCSA Fees",     amount: "15.00",  frequency: "MONTHLY", employmentType: null, costScope: "GLOBAL" },
  ],
  w2: [
    { name: "Truck Payment",        amount: "1800.00", frequency: "MONTHLY", employmentType: "W2_COMPANY_DRIVER", costScope: "TRUCK" },
    { name: "Truck Insurance",      amount: "400.00",  frequency: "MONTHLY", employmentType: "W2_COMPANY_DRIVER", costScope: "TRUCK" },
    { name: "Maintenance Reserve",  amount: "300.00",  frequency: "MONTHLY", employmentType: "W2_COMPANY_DRIVER", costScope: "TRUCK" },
    { name: "Fuel Cost Allocation", amount: "500.00",  frequency: "WEEKLY",  employmentType: "W2_COMPANY_DRIVER", costScope: "DRIVER_TYPE" },
  ],
  ownerOp: [
    { name: "Dispatch Fee",    amount: "100.00", frequency: "WEEKLY", employmentType: "OWNER_OPERATOR", costScope: "DRIVER_TYPE" },
    { name: "Trailer Rental",  amount: "250.00", frequency: "WEEKLY", employmentType: "OWNER_OPERATOR", costScope: "DRIVER_TYPE" },
    { name: "Insurance Assist",amount: "500.00", frequency: "MONTHLY",employmentType: "OWNER_OPERATOR", costScope: "TRUCK" },
  ],
  lease: [
    { name: "Lease Payment",       amount: "600.00", frequency: "WEEKLY",  employmentType: "LEASE_TO_PURCHASE", costScope: "TRUCK" },
    { name: "Insurance Escrow",    amount: "150.00", frequency: "WEEKLY",  employmentType: "LEASE_TO_PURCHASE", costScope: "TRUCK" },
    { name: "Maintenance Escrow",  amount: "100.00", frequency: "WEEKLY",  employmentType: "LEASE_TO_PURCHASE", costScope: "TRUCK" },
    { name: "Compliance",          amount: "50.00",  frequency: "MONTHLY", employmentType: "LEASE_TO_PURCHASE", costScope: "DRIVER_TYPE" },
  ],
};

const TEMPLATE_OPTIONS = [
  { value: "general", label: "General / All Drivers" },
  { value: "w2", label: "W2 Company Driver Costs" },
  { value: "ownerOp", label: "Owner Operator Costs" },
  { value: "lease", label: "Lease To Purchase Costs" },
];

function CompanyCostSection({ companyId }: { companyId: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [amount, setAmount] = useState("");
  const [employmentType, setEmploymentType] = useState("ALL");
  const [costScope, setCostScope] = useState("GLOBAL");
  const [costTruckId, setCostTruckId] = useState<string>("NONE");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkTemplate, setBulkTemplate] = useState("general");
  const [bulkRows, setBulkRows] = useState<{ checked: boolean; name: string; amount: string; frequency: string; employmentType: string | null; costScope: string }[]>([]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  const offset = (page - 1) * limit;

  const { data, isLoading, isFetching } = useQuery<{ items: any[]; total: number; page: number; pageCount: number }>({
    queryKey: tenantQueryKey(user, "/api/company-costs/items", { search: debouncedSearch, limit: String(limit), offset: String(offset) }),
    enabled: !!user?.id && !!user?.companyId,
  });

  const { data: trucksData } = useQuery<any[]>({
    queryKey: tenantQueryKey(user, "/api/trucks"),
    enabled: !!user?.id && !!user?.companyId,
  });

  const costItems = data?.items;

  function invalidateCosts() {
    queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/company-costs/items") });
    queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/profitability") });
  }

  const createMutation = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/company-costs/items", d),
    onSuccess: () => {
      invalidateCosts();
      resetForm();
      toast({ title: "Cost item added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => apiRequest("PATCH", `/api/company-costs/items/${id}`, d),
    onSuccess: () => {
      invalidateCosts();
      resetForm();
      toast({ title: "Cost item updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/company-costs/items/${id}`),
    onSuccess: () => {
      invalidateCosts();
      toast({ title: "Cost item deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiRequest("PATCH", `/api/company-costs/items/${id}`, { enabled }),
    onSuccess: () => invalidateCosts(),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const bulkMutation = useMutation({
    mutationFn: (items: any[]) => apiRequest("POST", "/api/company-costs/items/bulk", { items }),
    onSuccess: () => {
      invalidateCosts();
      setShowBulkDialog(false);
      toast({ title: "Template items added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function resetForm() {
    setShowForm(false);
    setEditItem(null);
    setName("");
    setFrequency("MONTHLY");
    setAmount("");
    setEmploymentType("ALL");
    setCostScope("GLOBAL");
    setCostTruckId("NONE");
  }

  function startEdit(item: any) {
    setEditItem(item);
    setName(item.name);
    setFrequency(item.frequency);
    setAmount(item.amount);
    setEmploymentType(item.employmentType || "ALL");
    setCostScope(item.costScope || "GLOBAL");
    setCostTruckId(item.truckId ? String(item.truckId) : "NONE");
    setShowForm(true);
  }

  function handleSave() {
    if (!name.trim() || !amount) return;
    const empType = employmentType === "ALL" ? null : employmentType;
    const truckIdVal = costScope === "TRUCK" && costTruckId !== "NONE" ? parseInt(costTruckId) : null;
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, name: name.trim(), frequency, amount, employmentType: empType, costScope, truckId: truckIdVal });
    } else {
      createMutation.mutate({ name: name.trim(), frequency, amount, employmentType: empType, costScope, truckId: truckIdVal });
    }
  }

  function openBulkDialog() {
    setBulkTemplate("general");
    setBulkRows(COST_TEMPLATES.general.map((t) => ({ ...t, checked: true })));
    setShowBulkDialog(true);
  }

  function handleTemplateChange(val: string) {
    setBulkTemplate(val);
    setBulkRows((COST_TEMPLATES[val] || []).map((t) => ({ ...t, checked: true })));
  }

  function handleBulkSubmit() {
    const selected = bulkRows.filter((r) => r.checked);
    if (selected.length === 0) return;
    bulkMutation.mutate(selected.map((r) => ({
      name: r.name,
      amount: r.amount,
      frequency: r.frequency,
      employmentType: r.employmentType,
      costScope: r.costScope,
    })));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Company Cost Defaults</h3>
          {data?.total != null && (
            <Badge variant="secondary" data-testid="badge-cost-items-count">{data.total}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openBulkDialog}
            data-testid="button-add-template"
          >
            Add Template
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => { resetForm(); setShowForm(true); }}
            data-testid="button-add-cost-item"
          >
            Add Cost Item
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Three cost scopes: <span className="text-blue-400 font-medium">Per Truck</span> — applied directly per driver (truck payment, insurance); <span className="text-violet-400 font-medium">Driver Type</span> — divided among that employment type; <span className="text-muted-foreground font-medium">Global</span> — divided across all fleet miles.
        </p>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search cost items..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
            data-testid="input-search-cost-items"
          />
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <div className="space-y-2">
            {(!costItems || costItems.length === 0) && !showForm && (
              <p className="text-sm text-muted-foreground py-2" data-testid="text-no-cost-items">No cost items found.</p>
            )}
            {costItems?.map((item: any) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 border rounded-md p-3"
                data-testid={`row-cost-item-${item.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                    <span>${parseFloat(item.amount).toFixed(2)} / {item.frequency === "WEEKLY" ? "week" : "month"}</span>
                    <span>·</span>
                    <span data-testid={`text-cost-item-applies-${item.id}`}>
                      {item.employmentType ? EMP_TYPE_LABEL[item.employmentType] || item.employmentType : "All drivers"}
                    </span>
                    <span>·</span>
                    <span className={`font-medium ${item.costScope === "TRUCK" ? "text-blue-400" : item.costScope === "DRIVER_TYPE" ? "text-violet-400" : "text-muted-foreground"}`} data-testid={`text-cost-scope-${item.id}`}>
                      {COST_SCOPE_LABEL[item.costScope || "GLOBAL"] || "Global"}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={item.enabled}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: item.id, enabled: checked })}
                    data-testid={`switch-cost-item-${item.id}`}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(item)}
                    data-testid={`button-edit-cost-item-${item.id}`}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => deleteMutation.mutate(item.id)}
                    data-testid={`button-delete-cost-item-${item.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {showForm && (
              <div className="border rounded-md p-3 space-y-3" data-testid="form-cost-item">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    placeholder="e.g. Insurance, Truck Payment"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-cost-item-name"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label className="text-xs">Frequency</Label>
                    <Select value={frequency} onValueChange={setFrequency}>
                      <SelectTrigger data-testid="select-trigger-cost-frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      data-testid="input-cost-item-amount"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Cost Scope</Label>
                  <Select value={costScope} onValueChange={setCostScope}>
                    <SelectTrigger data-testid="select-trigger-cost-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COST_SCOPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          <div>
                            <div className="font-medium text-xs">{o.label}</div>
                            <div className="text-[10px] text-muted-foreground">{o.desc}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {costScope === "TRUCK" && trucksData && trucksData.length > 0 && (
                  <div>
                    <Label className="text-xs">Assign to Specific Truck <span className="text-muted-foreground">(optional)</span></Label>
                    <Select value={costTruckId} onValueChange={setCostTruckId}>
                      <SelectTrigger data-testid="select-trigger-cost-truck">
                        <SelectValue placeholder="All trucks (proportional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">All trucks (proportional)</SelectItem>
                        {trucksData.filter((t: any) => t.status === "ACTIVE" || t.status === "IN_MAINTENANCE").map((t: any) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            #{t.truckNumber}{t.make ? ` — ${t.make}${t.model ? " " + t.model : ""}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">If assigned, cost applies only to loads on that truck. Otherwise divided proportionally among all trucks.</p>
                  </div>
                )}
                {costScope !== "GLOBAL" && (
                  <div>
                    <Label className="text-xs">Applies To (Driver Type)</Label>
                    <Select value={employmentType} onValueChange={setEmploymentType}>
                      <SelectTrigger data-testid="select-trigger-cost-applies-to">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMP_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={createMutation.isPending || updateMutation.isPending || !name.trim() || !amount}
                    data-testid="button-save-cost-item"
                  >
                    {editItem ? "Update" : "Add"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={resetForm}
                    data-testid="button-cancel-cost-item"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {(data?.pageCount ?? 1) > 1 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="button-cost-items-prev"
            >
              Prev
            </Button>
            <span className="text-xs text-muted-foreground" data-testid="text-cost-items-page">
              Page {data?.page ?? page} of {data?.pageCount ?? 1}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= (data?.pageCount ?? 1) || isFetching}
              onClick={() => setPage((p) => p + 1)}
              data-testid="button-cost-items-next"
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Cost Template</DialogTitle>
            <DialogDescription>Select a template and customize the items to add.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Template</Label>
              <Select value={bulkTemplate} onValueChange={handleTemplateChange}>
                <SelectTrigger data-testid="select-trigger-bulk-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {bulkRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2 border rounded-md p-2" data-testid={`row-bulk-item-${idx}`}>
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => {
                      const updated = [...bulkRows];
                      updated[idx] = { ...updated[idx], checked: e.target.checked };
                      setBulkRows(updated);
                    }}
                    data-testid={`checkbox-bulk-item-${idx}`}
                  />
                  <Input
                    value={row.name}
                    onChange={(e) => {
                      const updated = [...bulkRows];
                      updated[idx] = { ...updated[idx], name: e.target.value };
                      setBulkRows(updated);
                    }}
                    className="flex-1 h-8 text-sm"
                    data-testid={`input-bulk-name-${idx}`}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.amount}
                    onChange={(e) => {
                      const updated = [...bulkRows];
                      updated[idx] = { ...updated[idx], amount: e.target.value };
                      setBulkRows(updated);
                    }}
                    className="w-24 h-8 text-sm"
                    data-testid={`input-bulk-amount-${idx}`}
                  />
                  <Select
                    value={row.frequency}
                    onValueChange={(val) => {
                      const updated = [...bulkRows];
                      updated[idx] = { ...updated[idx], frequency: val };
                      setBulkRows(updated);
                    }}
                  >
                    <SelectTrigger className="w-24 h-8 text-xs" data-testid={`select-bulk-freq-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={row.employmentType || "ALL"}
                    onValueChange={(val) => {
                      const updated = [...bulkRows];
                      updated[idx] = { ...updated[idx], employmentType: val === "ALL" ? null : val };
                      setBulkRows(updated);
                    }}
                  >
                    <SelectTrigger className="w-28 h-8 text-xs" data-testid={`select-bulk-applies-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EMP_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={row.costScope || "GLOBAL"}
                    onValueChange={(val) => {
                      const updated = [...bulkRows];
                      updated[idx] = { ...updated[idx], costScope: val };
                      setBulkRows(updated);
                    }}
                  >
                    <SelectTrigger className="w-28 h-8 text-xs" data-testid={`select-bulk-scope-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COST_SCOPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBulkDialog(false)}
              data-testid="button-cancel-bulk"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleBulkSubmit}
              disabled={bulkMutation.isPending || bulkRows.filter((r) => r.checked).length === 0}
              data-testid="button-submit-bulk"
            >
              {bulkMutation.isPending ? "Adding..." : `Add ${bulkRows.filter((r) => r.checked).length} Items`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function UsersSection({ companyId, currentUserId, userRole }: { companyId: number; currentUserId: number; userRole: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [editingDispatcherPay, setEditingDispatcherPay] = useState<any>(null);
  const [dispPayModel, setDispPayModel] = useState("PER_LOAD");
  const [dispPayRate, setDispPayRate] = useState("0");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [accumulatedUsers, setAccumulatedUsers] = useState<any[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const LIMIT = 20;

  const dispatcherPayMutation = useMutation({
    mutationFn: async ({ id, payModel, payRate }: { id: number; payModel: string; payRate: string }) =>
      apiRequest("PATCH", `/api/dispatchers/${id}/pay`, { payModel, payRate: parseFloat(payRate) || 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/team/users") });
      setEditingDispatcherPay(null);
      toast({ title: "Dispatcher pay settings updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setOffset(0);
      setAccumulatedUsers([]);
    }, 300);
  }, []);

  const { data, isLoading } = useQuery<{ items: any[]; total: number; offset: number; hasMore: boolean }>({
    queryKey: tenantQueryKey(user, "/api/team/users", { search: debouncedSearch, limit: String(LIMIT), offset: String(offset) }),
    enabled: !!user?.id && !!user?.companyId,
  });

  useEffect(() => {
    if (data?.items) {
      if (data.offset === 0) {
        setAccumulatedUsers(data.items);
      } else {
        setAccumulatedUsers(prev => {
          const existingIds = new Set(prev.map((u: any) => u.id));
          const newItems = data.items.filter((u: any) => !existingIds.has(u.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [data]);

  const deactivateMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("PATCH", `/api/team/users/${userId}/deactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/team/users") });
      toast({ title: "User deactivated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("PATCH", `/api/team/users/${userId}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/team/users") });
      toast({ title: "User activated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/team/users") });
      setDeleteTarget(null);
      toast({ title: "User deleted" });
    },
    onError: (err: any) => {
      setDeleteTarget(null);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const showDeactivate = userRole === "ADMIN" || userRole === "SUPERADMIN";

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold">
              {userRole === "DISPATCHER" ? "Drivers" : "Team Members"}
            </h3>
          </div>
          <Badge variant="secondary" className="text-xs">{data?.total ?? 0} {userRole === "DISPATCHER" ? "drivers" : "members"}</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={userRole === "DISPATCHER" ? "Search drivers..." : "Search team members..."}
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
                data-testid="input-search-users"
              />
            </div>
          </div>
          {isLoading && offset === 0 ? (
            <div className="p-5 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : accumulatedUsers.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {userRole === "DISPATCHER" ? "No drivers assigned yet" : "No team members yet"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accumulatedUsers.map((u: any) => {
                    const RoleIcon = roleIcons[u.role] || Users;
                    const isSelf = u.id === currentUserId;
                    const isActive = u.isActive !== false;
                    const canDelete = !isSelf && canDeleteUser(userRole, u.role);
                    return (
                      <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <RoleIcon className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <span className="text-sm font-medium" data-testid={`text-user-name-${u.id}`}>
                              {u.firstName} {u.lastName}
                              {isSelf && <span className="text-muted-foreground ml-1">(you)</span>}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground" data-testid={`text-user-email-${u.id}`}>
                          {u.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]" data-testid={`badge-user-role-${u.id}`}>
                            {roleLabels[u.role] || u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isActive ? "default" : "destructive"}
                            className="text-[10px]"
                            data-testid={`badge-user-status-${u.id}`}
                          >
                            {isActive ? "Active" : "Deactivated"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 flex-wrap">
                            {showDeactivate && !isSelf && u.role !== "SUPERADMIN" && (
                              isActive ? (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => deactivateMutation.mutate(u.id)}
                                  disabled={deactivateMutation.isPending}
                                  data-testid={`button-deactivate-user-${u.id}`}
                                >
                                  <UserX className="w-3.5 h-3.5 mr-1" />
                                  Deactivate
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => activateMutation.mutate(u.id)}
                                  disabled={activateMutation.isPending}
                                  data-testid={`button-activate-user-${u.id}`}
                                >
                                  <UserCheck className="w-3.5 h-3.5 mr-1" />
                                  Activate
                                </Button>
                              )
                            )}
                            {(userRole === "ADMIN" || userRole === "SUPERADMIN") && u.role === "DISPATCHER" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingDispatcherPay(u);
                                  setDispPayModel(u.dispatcherPayModel || "PER_LOAD");
                                  setDispPayRate(String(u.dispatcherPayRate || "0"));
                                }}
                                data-testid={`button-pay-settings-${u.id}`}
                              >
                                <DollarSign className="w-3.5 h-3.5 mr-1" />
                                Pay
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeleteTarget(u)}
                                data-testid={`button-delete-user-${u.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                Delete
                              </Button>
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
          {data?.hasMore && (
            <div className="p-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOffset(prev => prev + LIMIT)}
                disabled={isLoading}
                data-testid="button-load-more-users"
              >
                {isLoading ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.firstName} {deleteTarget?.lastName}
              </span>{" "}
              ({deleteTarget?.email})? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingDispatcherPay} onOpenChange={(open) => { if (!open) setEditingDispatcherPay(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Dispatcher Pay Settings</DialogTitle>
            <DialogDescription>
              Set the pay model and rate for{" "}
              <span className="font-medium text-foreground">
                {editingDispatcherPay?.firstName} {editingDispatcherPay?.lastName}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Pay Model</Label>
              <Select value={dispPayModel} onValueChange={setDispPayModel}>
                <SelectTrigger data-testid="select-dispatcher-pay-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PER_LOAD">Per Load</SelectItem>
                  <SelectItem value="PER_TRUCK">Per Truck</SelectItem>
                  <SelectItem value="PERCENT_REVENUE">% of Revenue</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {dispPayModel === "PER_LOAD" && "Earnings = loads handled × rate"}
                {dispPayModel === "PER_TRUCK" && "Earnings = assigned trucks × rate"}
                {dispPayModel === "PERCENT_REVENUE" && "Earnings = revenue handled × (rate / 100)"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Pay Rate {dispPayModel === "PERCENT_REVENUE" ? "(%)" : "($)"}
              </Label>
              <Input
                type="number"
                min="0"
                step={dispPayModel === "PERCENT_REVENUE" ? "0.01" : "0.01"}
                value={dispPayRate}
                onChange={(e) => setDispPayRate(e.target.value)}
                placeholder={dispPayModel === "PERCENT_REVENUE" ? "e.g. 5 for 5%" : "e.g. 25.00"}
                data-testid="input-dispatcher-pay-rate"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingDispatcherPay(null)}>Cancel</Button>
            <Button
              onClick={() => editingDispatcherPay && dispatcherPayMutation.mutate({
                id: editingDispatcherPay.id,
                payModel: dispPayModel,
                payRate: dispPayRate,
              })}
              disabled={dispatcherPayMutation.isPending}
              data-testid="button-save-dispatcher-pay"
            >
              {dispatcherPayMutation.isPending ? "Saving..." : "Save Pay Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TeamInvitesSection({ companyId, userRole }: { companyId: number; userRole: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("DRIVER");
  const [lastInviteLink, setLastInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [inviteOffset, setInviteOffset] = useState(0);
  const [accumulatedInvites, setAccumulatedInvites] = useState<any[]>([]);
  const INVITE_LIMIT = 20;

  const { data: settings } = useQuery<any>({
    queryKey: tenantQueryKey(user, "/api/company-settings"),
    enabled: !!user?.id && !!user?.companyId,
  });

  const { data: invitesData, isLoading: invitesLoading } = useQuery<{ items: any[]; total: number; offset: number; hasMore: boolean }>({
    queryKey: tenantQueryKey(user, "/api/invites", { limit: String(INVITE_LIMIT), offset: String(inviteOffset) }),
    enabled: !!user?.id && !!user?.companyId,
  });

  useEffect(() => {
    if (invitesData?.items) {
      if (invitesData.offset === 0) {
        setAccumulatedInvites(invitesData.items);
      } else {
        setAccumulatedInvites(prev => {
          const existingIds = new Set(prev.map((inv: any) => inv.id));
          const newItems = invitesData.items.filter((inv: any) => !existingIds.has(inv.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [invitesData]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/invites", {
        email: inviteEmail,
        role: inviteRole,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/invites") });
      setLastInviteLink(data.inviteLink);
      setInviteEmail("");
      toast({ title: "Invite created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      return apiRequest("POST", "/api/invites/revoke", { inviteId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/invites") });
      toast({ title: "Invite revoked" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: "Link copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "active": return <Clock className="w-3 h-3" />;
      case "accepted": return <CheckCircle2 className="w-3 h-3" />;
      case "revoked": return <Ban className="w-3 h-3" />;
      case "expired": return <XCircle className="w-3 h-3" />;
      default: return null;
    }
  };

  const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "active": return "default";
      case "accepted": return "secondary";
      case "revoked": return "destructive";
      case "expired": return "outline";
      default: return "secondary";
    }
  };

  const canInviteAdmin = userRole === "SUPERADMIN" || (userRole === "ADMIN" && settings?.allowAdminInvites);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Team Invites</h3>
        </div>
        <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) setLastInviteLink(""); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-invite">
              <Mail className="w-4 h-4 mr-2" />
              Send Invite
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
            </DialogHeader>
            {lastInviteLink ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-chart-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Invite sent! Share this link with the invitee:</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={lastInviteLink}
                    readOnly
                    className="text-xs font-mono"
                    data-testid="input-invite-link"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyLink(lastInviteLink)}
                    data-testid="button-copy-invite-link"
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">This link expires in 7 days. The invitee will set their own password.</p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setLastInviteLink(""); }}
                  data-testid="button-send-another-invite"
                >
                  Send Another Invite
                </Button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                    data-testid="input-invite-email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger data-testid="select-invite-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DRIVER">Driver</SelectItem>
                      <SelectItem value="DISPATCHER">Dispatcher</SelectItem>
                      {canInviteAdmin && <SelectItem value="ADMIN">Admin</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createMutation.isPending || !inviteEmail}
                  data-testid="button-send-invite"
                >
                  {createMutation.isPending ? "Creating..." : "Create Invite"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {invitesLoading && inviteOffset === 0 ? (
          <div className="p-5 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : accumulatedInvites.length === 0 ? (
          <div className="p-8 text-center">
            <Mail className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No invites sent yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accumulatedInvites.map((inv: any) => (
                  <TableRow key={inv.id} data-testid={`row-invite-${inv.id}`}>
                    <TableCell className="text-sm" data-testid={`text-invite-email-${inv.id}`}>{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]" data-testid={`badge-invite-role-${inv.id}`}>
                        {roleLabels[inv.role] || inv.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(inv.status)} className="text-[10px] gap-1" data-testid={`badge-invite-status-${inv.id}`}>
                        {statusIcon(inv.status)}
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "\u2014"}
                    </TableCell>
                    <TableCell>
                      {inv.status === "active" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeMutation.mutate(inv.id)}
                          disabled={revokeMutation.isPending}
                          data-testid={`button-revoke-invite-${inv.id}`}
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {invitesData?.hasMore && (
          <div className="p-4 flex justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInviteOffset(prev => prev + INVITE_LIMIT)}
              disabled={invitesLoading}
              data-testid="button-load-more-invites"
            >
              {invitesLoading ? "Loading..." : "Load more"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Trucks Section ───────────────────────────────────────────────────────────

const OWNERSHIP_LABELS: Record<string, string> = {
  COMPANY_OWNED: "Company Owned",
  OWNER_OPERATOR: "Owner Operator",
  LEASED: "Leased",
};

const TRUCK_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  IN_MAINTENANCE: "In Maintenance",
};

const TRUCKS_PER_PAGE = 15;

function TrucksSection({ companyId }: { companyId: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingTruck, setEditingTruck] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [truckSearch, setTruckSearch] = useState("");
  const [truckPage, setTruckPage] = useState(0);

  const { data: trucks, isLoading } = useQuery<any[]>({
    queryKey: tenantQueryKey(user, "/api/trucks"),
    enabled: !!user?.id && !!companyId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/trucks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/trucks") });
      setDeleteId(null);
      toast({ title: "Truck removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openAdd = () => { setEditingTruck(null); setShowForm(true); };
  const openEdit = (truck: any) => { setEditingTruck(truck); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingTruck(null); };

  const filteredTrucks = (trucks ?? []).filter((t: any) => {
    if (!truckSearch.trim()) return true;
    const q = truckSearch.toLowerCase();
    return (
      (t.truckNumber || "").toLowerCase().includes(q) ||
      (t.make || "").toLowerCase().includes(q) ||
      (t.model || "").toLowerCase().includes(q) ||
      (t.vin || "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filteredTrucks.length / TRUCKS_PER_PAGE);
  const paginatedTrucks = filteredTrucks.slice(truckPage * TRUCKS_PER_PAGE, (truckPage + 1) * TRUCKS_PER_PAGE);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-base">Fleet — Trucks</h2>
          {trucks && <span className="text-xs text-muted-foreground">({trucks.length})</span>}
        </div>
        <Button size="sm" onClick={openAdd} data-testid="button-add-truck">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Truck
        </Button>
      </CardHeader>
      <CardContent>
        {/* Search bar */}
        {trucks && trucks.length > 0 && (
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search trucks..."
              value={truckSearch}
              onChange={(e) => { setTruckSearch(e.target.value); setTruckPage(0); }}
              className="pl-8 h-8 text-sm"
            />
          </div>
        )}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !trucks || trucks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No trucks added yet</p>
        ) : filteredTrucks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No trucks match your search</p>
        ) : (
          <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck #</TableHead>
                  <TableHead>Make / Model</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>VIN</TableHead>
                  <TableHead>Ownership</TableHead>
                  <TableHead className="text-right">Monthly Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTrucks.map((truck: any) => (
                  <TableRow key={truck.id} data-testid={`row-truck-${truck.id}`}>
                    <TableCell className="font-medium">#{truck.truckNumber}</TableCell>
                    <TableCell>{[truck.make, truck.model].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell>{truck.year || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{truck.vin || "—"}</TableCell>
                    <TableCell>{OWNERSHIP_LABELS[truck.ownershipType] || truck.ownershipType || "—"}</TableCell>
                    <TableCell className="text-right">
                      {truck.monthlyCost ? `$${Number(truck.monthlyCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={truck.status === "ACTIVE" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {TRUCK_STATUS_LABELS[truck.status] || truck.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(truck)}
                          data-testid={`button-edit-truck-${truck.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(truck.id)}
                          data-testid={`button-delete-truck-${truck.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {truckPage * TRUCKS_PER_PAGE + 1}–{Math.min((truckPage + 1) * TRUCKS_PER_PAGE, filteredTrucks.length)} of {filteredTrucks.length} trucks
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => setTruckPage(p => Math.max(0, p - 1))}
                  disabled={truckPage === 0}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  {truckPage + 1} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => setTruckPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={truckPage >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
          </>
        )}
      </CardContent>

      <Dialog open={showForm} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTruck ? "Edit Truck" : "Add Truck"}</DialogTitle>
          </DialogHeader>
          <TruckForm
            truck={editingTruck}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/trucks") });
              closeForm();
              toast({ title: editingTruck ? "Truck updated" : "Truck added" });
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Truck</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this truck? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-truck"
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TruckForm({ truck, onSuccess }: { truck?: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    truckNumber: truck?.truckNumber || "",
    vin: truck?.vin || "",
    make: truck?.make || "",
    model: truck?.model || "",
    year: truck?.year ? String(truck.year) : "",
    ownershipType: truck?.ownershipType || "COMPANY_OWNED",
    monthlyCost: truck?.monthlyCost ? String(truck.monthlyCost) : "",
    status: truck?.status || "ACTIVE",
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (truck) return apiRequest("PATCH", `/api/trucks/${truck.id}`, data);
      return apiRequest("POST", "/api/trucks", data);
    },
    onSuccess: () => onSuccess(),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      year: form.year ? parseInt(form.year) : null,
      monthlyCost: form.monthlyCost ? form.monthlyCost : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Truck Number *</Label>
          <Input
            data-testid="input-truck-number"
            value={form.truckNumber}
            onChange={(e) => setForm({ ...form, truckNumber: e.target.value })}
            required
            placeholder="e.g. 101"
          />
        </div>
        <div className="space-y-1.5">
          <Label>VIN</Label>
          <Input
            data-testid="input-truck-vin"
            value={form.vin}
            onChange={(e) => setForm({ ...form, vin: e.target.value })}
            placeholder="17-char VIN"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Make</Label>
          <Input
            data-testid="input-truck-make"
            value={form.make}
            onChange={(e) => setForm({ ...form, make: e.target.value })}
            placeholder="e.g. Peterbilt"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Model</Label>
          <Input
            data-testid="input-truck-model"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="e.g. 579"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Year</Label>
          <Input
            data-testid="input-truck-year"
            type="number"
            min="1980"
            max="2030"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
            placeholder="2022"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Ownership</Label>
          <Select value={form.ownershipType} onValueChange={(v) => setForm({ ...form, ownershipType: v })}>
            <SelectTrigger data-testid="select-truck-ownership"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="COMPANY_OWNED">Company Owned</SelectItem>
              <SelectItem value="OWNER_OPERATOR">Owner Operator</SelectItem>
              <SelectItem value="LEASED">Leased</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Monthly Cost ($)</Label>
          <Input
            data-testid="input-truck-monthly-cost"
            type="number"
            min="0"
            step="0.01"
            value={form.monthlyCost}
            onChange={(e) => setForm({ ...form, monthlyCost: e.target.value })}
            placeholder="e.g. 2500.00"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
          <SelectTrigger data-testid="select-truck-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="IN_MAINTENANCE">In Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-save-truck">
        {mutation.isPending ? "Saving..." : truck ? "Update Truck" : "Add Truck"}
      </Button>
    </form>
  );
}

function DispatcherTrucksSection({ companyId }: { companyId: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDispatcherId, setSelectedDispatcherId] = useState<string>("");
  const [selectedTruckId, setSelectedTruckId] = useState<string>("");

  const { data: dispatchers = [] } = useQuery<any[]>({
    queryKey: tenantQueryKey(user, "/api/dispatchers"),
    enabled: !!user?.id && !!companyId,
  });

  const { data: allTrucks = [] } = useQuery<any[]>({
    queryKey: tenantQueryKey(user, "/api/trucks"),
    enabled: !!user?.id && !!companyId,
  });

  const { data: assignments = [], isLoading } = useQuery<any[]>({
    queryKey: tenantQueryKey(user, "/api/dispatcher-trucks"),
    enabled: !!user?.id && !!companyId,
  });

  const addMutation = useMutation({
    mutationFn: async ({ dispatcherUserId, truckId }: { dispatcherUserId: number; truckId: number }) =>
      apiRequest("POST", "/api/dispatcher-trucks", { dispatcherUserId, truckId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/dispatcher-trucks") });
      setSelectedTruckId("");
      toast({ title: "Truck assigned to dispatcher" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/dispatcher-trucks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/dispatcher-trucks") });
      toast({ title: "Truck access removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const assignedTruckIdsByDispatcher = (dispatcherId: number): number[] =>
    assignments.filter((a: any) => a.dispatcherUserId === dispatcherId).map((a: any) => a.truckId);

  const unassignedTrucksForDispatcher = (dispatcherId: number) => {
    const assigned = new Set(assignedTruckIdsByDispatcher(dispatcherId));
    return allTrucks.filter((t: any) => !assigned.has(t.id));
  };

  const assignmentForDispatcherTruck = (dispatcherId: number, truckId: number) =>
    assignments.find((a: any) => a.dispatcherUserId === dispatcherId && a.truckId === truckId);

  if (dispatchers.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Dispatcher Truck Access</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Limit which trucks each dispatcher can assign to loads. If no trucks are selected, the dispatcher sees all trucks.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          dispatchers.map((dispatcher: any) => {
            const dispId = dispatcher.id;
            const assignedIds = assignedTruckIdsByDispatcher(dispId);
            const assignedTrucks = allTrucks.filter((t: any) => assignedIds.includes(t.id));
            const available = unassignedTrucksForDispatcher(dispId);

            return (
              <div key={dispId} className="rounded-lg border p-4 space-y-3" data-testid={`dispatcher-truck-row-${dispId}`}>
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm" data-testid={`text-dispatcher-name-${dispId}`}>{dispatcher.firstName} {dispatcher.lastName}</span>
                  {assignedIds.length === 0 ? (
                    <Badge variant="secondary" className="text-[10px] ml-auto" data-testid={`badge-dispatcher-all-trucks-${dispId}`}>All trucks (no restriction)</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] ml-auto" data-testid={`badge-dispatcher-truck-count-${dispId}`}>{assignedIds.length} truck{assignedIds.length !== 1 ? "s" : ""} assigned</Badge>
                  )}
                </div>

                {assignedTrucks.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {assignedTrucks.map((t: any) => {
                      const asgn = assignmentForDispatcherTruck(dispId, t.id);
                      return (
                        <div key={t.id} className="flex items-center gap-1 bg-secondary text-secondary-foreground rounded-md px-2 py-1 text-xs">
                          <span className="font-mono font-medium">{t.truckNumber}</span>
                          {t.make && <span className="text-muted-foreground">{t.make}</span>}
                          <button
                            className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                            onClick={() => asgn && removeMutation.mutate(asgn.id)}
                            disabled={removeMutation.isPending}
                            data-testid={`button-remove-dispatcher-truck-${dispId}-${t.id}`}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {available.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedDispatcherId === String(dispId) ? selectedTruckId : ""}
                      onValueChange={(v) => {
                        setSelectedDispatcherId(String(dispId));
                        setSelectedTruckId(v);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1 max-w-[220px]" data-testid={`select-dispatcher-truck-${dispId}`}>
                        <SelectValue placeholder="+ Assign truck…" />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((t: any) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            #{t.truckNumber}{t.make ? ` — ${t.make}` : ""}{t.model ? ` ${t.model}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={!selectedTruckId || selectedDispatcherId !== String(dispId) || addMutation.isPending}
                      onClick={() => {
                        if (selectedTruckId && selectedDispatcherId === String(dispId)) {
                          addMutation.mutate({ dispatcherUserId: dispId, truckId: parseInt(selectedTruckId) });
                        }
                      }}
                      data-testid={`button-assign-truck-${dispId}`}
                    >
                      Assign
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}