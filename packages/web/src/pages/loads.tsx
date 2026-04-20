import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  Truck,
  MapPin,
  Calendar,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Package,
  FileText,
  Eye,
  ScanSearch,
  CheckCircle,
  Loader2,
  Calculator,
  AlertTriangle,
  Trash2,
  Ban,
  RotateCcw,
  EyeOff,
  Info,
  User,
  Clock,
  DollarSign,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function LoadsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [driverFilter, setDriverFilter] = useState("ALL");
  const [dispatcherFilter, setDispatcherFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState<any>(null);
  const [bolPreview, setBolPreview] = useState<string | null>(null);
  const [verifyLoadId, setVerifyLoadId] = useState<number | null>(null);
  const [showDeletedVoided, setShowDeletedVoided] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [voidConfirm, setVoidConfirm] = useState<any>(null);
  const [voidReason, setVoidReason] = useState("");
  const [expandedDrivers, setExpandedDrivers] = useState<Set<number>>(
    new Set(),
  );
  const [offset, setOffset] = useState(0);
  const [accumulatedLoads, setAccumulatedLoads] = useState<any[]>([]);
  const limit = 20;
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setOffset(0);
      setAccumulatedLoads([]);
    }, 300);
  }, []);

  useEffect(() => {
    setOffset(0);
    setAccumulatedLoads([]);
  }, [statusFilter, driverFilter, dispatcherFilter, showDeletedVoided]);

  const isManager =
    user?.role === "DISPATCHER" ||
    user?.role === "ADMIN" ||
    user?.role === "SUPERADMIN";
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";
  const isDriver = user?.role === "DRIVER";

  const { data: driversData } = useQuery<{ items: any[] }>({
    queryKey: tenantQueryKey(user, "/api/drivers", { limit: "100" }),
    enabled: !!user?.id && !!user?.companyId && isManager,
  });
  const drivers = driversData?.items;

  const { data: dispatchers } = useQuery<any[]>({
    queryKey: tenantQueryKey(user, "/api/dispatchers"),
    enabled: !!user?.id && !!user?.companyId && isAdmin,
  });

  const loadsQueryParams: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };
  if (debouncedSearch) loadsQueryParams.search = debouncedSearch;
  if (statusFilter !== "ALL") loadsQueryParams.status = statusFilter;
  if (showDeletedVoided) loadsQueryParams.includeDeletedVoided = "true";
  if (driverFilter !== "ALL") loadsQueryParams.driverId = driverFilter;
  if (dispatcherFilter !== "ALL" && isAdmin)
    loadsQueryParams.dispatcherId = dispatcherFilter;

  const {
    data: loadsData,
    isLoading,
    isFetching,
  } = useQuery<{
    items: any[];
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: tenantQueryKey(user, "/api/loads", loadsQueryParams),
    enabled: !!user?.id && !!user?.companyId,
  });

  useEffect(() => {
    if (loadsData?.items) {
      const responseOffset = loadsData.offset ?? 0;
      if (responseOffset === 0) {
        setAccumulatedLoads(loadsData.items);
      } else {
        setAccumulatedLoads((prev) => {
          const existingIds = new Set(prev.map((l: any) => l.id));
          const newItems = loadsData.items.filter((l: any) => !existingIds.has(l.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [loadsData]);

  const hasMore = loadsData ? (loadsData.offset + loadsData.items.length) < loadsData.total : false;

  const driverGroups = useMemo(() => {
    if (!isManager || !drivers) return [];
    const groups: Record<
      number,
      {
        driver: any;
        loads: any[];
        totalMiles: number;
        totalRevenue: number;
        pendingCount: number;
      }
    > = {};

    for (const d of drivers) {
      groups[d.id] = {
        driver: d,
        loads: [],
        totalMiles: 0,
        totalRevenue: 0,
        pendingCount: 0,
      };
    }

    for (const l of accumulatedLoads) {
      const dId = l.driverUserId;
      if (!groups[dId]) {
        groups[dId] = {
          driver: {
            id: dId,
            firstName: l.driverName?.split(" ")[0] || "Unknown",
            lastName: l.driverName?.split(" ").slice(1).join(" ") || "",
            profile: {},
          },
          loads: [],
          totalMiles: 0,
          totalRevenue: 0,
          pendingCount: 0,
        };
      }
      groups[dId].loads.push(l);
      const miles = Number(l.finalMiles || l.calculatedMiles || 0);
      groups[dId].totalMiles += miles;
      groups[dId].totalRevenue += Number(l.revenueAmount || 0);
      if (["SUBMITTED", "OCR_DONE", "BOL_UPLOADED"].includes(l.status)) {
        groups[dId].pendingCount++;
      }
    }

    return Object.values(groups)
      .filter((g) => {
        if (debouncedSearch) {
          const name =
            `${g.driver.firstName} ${g.driver.lastName}`.toLowerCase();
          const matchDriverName = name.includes(debouncedSearch.toLowerCase());
          return matchDriverName || g.loads.length > 0;
        }
        return g.loads.length > 0 || driverFilter === "ALL";
      })
      .sort((a, b) => {
        if (a.loads.length > 0 && b.loads.length === 0) return -1;
        if (a.loads.length === 0 && b.loads.length > 0) return 1;
        return `${a.driver.firstName} ${a.driver.lastName}`.localeCompare(
          `${b.driver.firstName} ${b.driver.lastName}`,
        );
      });
  }, [isManager, drivers, accumulatedLoads, debouncedSearch, driverFilter]);

  useEffect(() => {
    if (isManager && driverGroups.length > 0 && expandedDrivers.size === 0) {
      const first = driverGroups.find((g) => g.loads.length > 0);
      if (first) {
        setExpandedDrivers(new Set([first.driver.id]));
      }
    }
  }, [driverGroups.length > 0 && isManager]);

  const toggleDriver = (driverId: number) => {
    setExpandedDrivers((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      return next;
    });
  };

  const canCreate = !isDriver;

  const statusStyles: Record<string, string> = {
    DRAFT: "secondary",
    BOL_UPLOADED: "default",
    OCR_DONE: "default",
    SUBMITTED: "default",
    VERIFIED: "default",
    APPROVED: "default",
    LOCKED: "outline",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            data-testid="text-loads-title"
          >
            Loads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isManager
              ? "Manage loads grouped by driver"
              : "Manage loads and track miles"}
          </p>
        </div>
        {canCreate && (
          <Dialog
            open={dialogOpen}
            onOpenChange={(o) => {
              setDialogOpen(o);
              if (!o) setSelectedLoad(null);
            }}
          >
            <DialogTrigger asChild>
              <Button data-testid="button-create-load">
                <Plus className="w-4 h-4 mr-2" />
                Create Load
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {selectedLoad ? "Edit Load" : "Create Load"}
                </DialogTitle>
              </DialogHeader>
              <LoadForm
                load={selectedLoad}
                onSuccess={() => {
                  setDialogOpen(false);
                  setSelectedLoad(null);
                  queryClient.invalidateQueries({
                    queryKey: tenantQueryKey(user, "/api/loads"),
                  });
                  toast({
                    title: selectedLoad ? "Load updated" : "Load created",
                  });
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={
              isManager
                ? "Search drivers or addresses..."
                : "Search by address..."
            }
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
            data-testid="input-search-loads"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="w-40"
            data-testid="select-load-status-filter"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="BOL_UPLOADED">BOL Uploaded</SelectItem>
            <SelectItem value="OCR_DONE">OCR Done</SelectItem>
            <SelectItem value="SUBMITTED">Submitted</SelectItem>
            <SelectItem value="VERIFIED">Verified</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="LOCKED">Locked</SelectItem>
          </SelectContent>
        </Select>
        {isManager && !isDriver && (
          <>
            {isAdmin && (
              <Select
                value={dispatcherFilter}
                onValueChange={setDispatcherFilter}
              >
                <SelectTrigger
                  className="w-44"
                  data-testid="select-load-dispatcher-filter"
                >
                  <SelectValue placeholder="All Dispatchers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Dispatchers</SelectItem>
                  {(dispatchers ?? []).map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.firstName} {d.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant={showDeletedVoided ? "default" : "outline"}
              size="sm"
              onClick={() => setShowDeletedVoided(!showDeletedVoided)}
              className="toggle-elevate"
              data-testid="button-toggle-deleted-voided"
            >
              <EyeOff className="w-4 h-4 mr-2" />
              {showDeletedVoided ? "Showing All" : "Show Deleted/Voided"}
            </Button>
          </>
        )}
      </div>

      {isManager && <BrokerStatsWidget />}

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="p-5 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : isManager ? (
        <GroupedLoadsView
          driverGroups={driverGroups}
          expandedDrivers={expandedDrivers}
          toggleDriver={toggleDriver}
          statusStyles={statusStyles}
          userRole={user?.role || "DRIVER"}
          isManager={isManager}
          onEdit={(load: any) => {
            setSelectedLoad(load);
            setDialogOpen(true);
          }}
          onVerify={(id: number) => setVerifyLoadId(id)}
          onDelete={(load: any) => setDeleteConfirm(load)}
          onVoid={(load: any) => {
            setVoidConfirm(load);
            setVoidReason("");
          }}
          setBolPreview={setBolPreview}
          search={search}
          statusFilter={statusFilter}
        />
      ) : (
        <FlatLoadsTable
          loads={accumulatedLoads}
          statusStyles={statusStyles}
          userRole={user?.role || "DRIVER"}
          isManager={isManager}
          onEdit={(load: any) => {
            setSelectedLoad(load);
            setDialogOpen(true);
          }}
          onVerify={(id: number) => setVerifyLoadId(id)}
          onDelete={(load: any) => setDeleteConfirm(load)}
          onVoid={(load: any) => {
            setVoidConfirm(load);
            setVoidReason("");
          }}
          setBolPreview={setBolPreview}
          search={search}
        />
      )}
      {hasMore && (
        <div className="flex items-center justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={isFetching}
            onClick={() => setOffset((prev) => prev + limit)}
            data-testid="button-load-more-loads"
          >
            {isFetching ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </span>
            ) : (
              `Load more (${accumulatedLoads.length} of ${loadsData?.total ?? 0})`
            )}
          </Button>
        </div>
      )}

      {bolPreview && (
        <Dialog open={!!bolPreview} onOpenChange={() => setBolPreview(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>BOL Document</DialogTitle>
            </DialogHeader>
            <div className="w-full overflow-auto">
              {bolPreview.endsWith(".pdf") ? (
                <iframe
                  src={bolPreview}
                  className="w-full h-[70vh] rounded-md"
                  data-testid="iframe-bol-preview"
                />
              ) : (
                <img
                  src={bolPreview}
                  alt="BOL Document"
                  className="w-full rounded-md"
                  data-testid="img-bol-preview"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {verifyLoadId && (
        <VerifyLoadDialog
          loadId={verifyLoadId}
          open={!!verifyLoadId}
          onClose={() => setVerifyLoadId(null)}
        />
      )}

      <DeleteLoadDialog
        load={deleteConfirm}
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
      />

      <VoidLoadDialog
        load={voidConfirm}
        open={!!voidConfirm}
        voidReason={voidReason}
        setVoidReason={setVoidReason}
        onClose={() => {
          setVoidConfirm(null);
          setVoidReason("");
        }}
      />
    </div>
  );
}

function GroupedLoadsView({
  driverGroups,
  expandedDrivers,
  toggleDriver,
  statusStyles,
  userRole,
  isManager,
  onEdit,
  onVerify,
  onDelete,
  onVoid,
  setBolPreview,
  search,
  statusFilter,
}: {
  driverGroups: any[];
  expandedDrivers: Set<number>;
  toggleDriver: (id: number) => void;
  statusStyles: Record<string, string>;
  userRole: string;
  isManager: boolean;
  onEdit: (load: any) => void;
  onVerify: (id: number) => void;
  onDelete: (load: any) => void;
  onVoid: (load: any) => void;
  setBolPreview: (url: string | null) => void;
  search: string;
  statusFilter: string;
}) {
  if (driverGroups.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">
            No drivers or loads found
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {search || statusFilter !== "ALL"
              ? "Adjust your filters"
              : "Create your first load"}
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
        const rpm = group.driver.profile?.ratePerMile
          ? `$${Number(group.driver.profile.ratePerMile).toFixed(2)}/mi`
          : null;

        return (
          <Card
            key={group.driver.id}
            data-testid={`card-driver-group-${group.driver.id}`}
          >
            <div
              className="flex items-center gap-4 p-4 cursor-pointer hover-elevate"
              onClick={() => toggleDriver(group.driver.id)}
              data-testid={`button-expand-driver-${group.driver.id}`}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="font-semibold text-base truncate"
                  data-testid={`text-driver-name-${group.driver.id}`}
                >
                  {driverName}
                </p>
                <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground mt-0.5">
                  {group.driver.email && <span>{group.driver.email}</span>}
                  {rpm && (
                    <span className="font-medium text-foreground">{rpm}</span>
                  )}
                </div>
                {/* Badges — mobile only (below name/email) */}
                <div className="flex sm:hidden items-center gap-2 flex-wrap mt-1.5">
                  <Badge variant="secondary" className="text-[10px]" data-testid={`badge-load-count-${group.driver.id}`}>
                    <Truck className="w-3 h-3 mr-1" />{group.loads.length} loads
                  </Badge>
                  {group.totalMiles > 0 && (
                    <Badge variant="secondary" className="text-[10px]" data-testid={`badge-miles-${group.driver.id}`}>
                      <MapPin className="w-3 h-3 mr-1" />{group.totalMiles.toLocaleString()} mi
                    </Badge>
                  )}
                  {group.totalRevenue > 0 && (
                    <Badge variant="secondary" className="text-[10px]" data-testid={`badge-revenue-${group.driver.id}`}>
                      <DollarSign className="w-3 h-3 mr-1" />${group.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Badge>
                  )}
                  {group.pendingCount > 0 && (
                    <Badge variant="default" className="text-[10px]" data-testid={`badge-pending-${group.driver.id}`}>
                      <Clock className="w-3 h-3 mr-1" />{group.pendingCount} pending
                    </Badge>
                  )}
                </div>
              </div>
              {/* Badges — desktop only (right side of card) */}
              <div className="hidden sm:flex items-center gap-2 flex-wrap flex-shrink-0">
                <Badge variant="secondary" className="text-[10px]" data-testid={`badge-load-count-${group.driver.id}`}>
                  <Truck className="w-3 h-3 mr-1" />{group.loads.length} loads
                </Badge>
                {group.totalMiles > 0 && (
                  <Badge variant="secondary" className="text-[10px]" data-testid={`badge-miles-${group.driver.id}`}>
                    <MapPin className="w-3 h-3 mr-1" />{group.totalMiles.toLocaleString()} mi
                  </Badge>
                )}
                {group.totalRevenue > 0 && (
                  <Badge variant="secondary" className="text-[10px]" data-testid={`badge-revenue-${group.driver.id}`}>
                    <DollarSign className="w-3 h-3 mr-1" />${group.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Badge>
                )}
                {group.pendingCount > 0 && (
                  <Badge variant="default" className="text-[10px]" data-testid={`badge-pending-${group.driver.id}`}>
                    <Clock className="w-3 h-3 mr-1" />{group.pendingCount} pending
                  </Badge>
                )}
              </div>
              <div className="flex-shrink-0">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </div>

            {isExpanded && (
              <CardContent className="p-0 border-t">
                {group.loads.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      No loads for this driver
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Route</TableHead>
                          {userRole !== "DRIVER" && <TableHead>Truck</TableHead>}
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Miles</TableHead>
                          {userRole !== "DRIVER" && (
                            <TableHead className="text-right">
                              Revenue
                            </TableHead>
                          )}
                          {userRole !== "DRIVER" && (
                            <TableHead>Broker</TableHead>
                          )}
                          <TableHead>Status</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.loads.map((load: any) => (
                          <LoadTableRow
                            key={load.id}
                            load={load}
                            userRole={userRole}
                            isManager={isManager}
                            showDriverCol={false}
                            showDispatcherCol={false}
                            showTruckCol={userRole !== "DRIVER"}
                            statusStyles={statusStyles}
                            onEdit={onEdit}
                            onVerify={onVerify}
                            onDelete={onDelete}
                            onVoid={onVoid}
                            setBolPreview={setBolPreview}
                          />
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

function BrokerStatsWidget() {
  const { user } = useAuth();
  const { data: stats } = useQuery<{ broker: string; count: number }[]>({
    queryKey: tenantQueryKey(user, "/api/loads/broker-stats"),
    enabled: !!user?.id && !!user?.companyId,
  });

  if (!stats || stats.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Package className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Loads by Broker (This Week)</h3>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex flex-wrap gap-2">
          {stats.map((s) => (
            <Badge
              key={s.broker}
              variant="secondary"
              data-testid={`badge-broker-stat-${s.broker}`}
            >
              {s.broker}: {s.count}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FlatLoadsTable({
  loads,
  statusStyles,
  userRole,
  isManager,
  onEdit,
  onVerify,
  onDelete,
  onVoid,
  setBolPreview,
  search,
}: {
  loads: any[];
  statusStyles: Record<string, string>;
  userRole: string;
  isManager: boolean;
  onEdit: (load: any) => void;
  onVerify: (id: number) => void;
  onDelete: (load: any) => void;
  onVoid: (load: any) => void;
  setBolPreview: (url: string | null) => void;
  search: string;
}) {
  if (loads.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No loads found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Adjust your search" : "Create your first load"}
          </p>
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
                <TableHead className="w-10">#</TableHead>
                <TableHead>Route</TableHead>
                {userRole !== "DRIVER" && <TableHead>Truck</TableHead>}
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Miles</TableHead>
                {userRole !== "DRIVER" && (
                  <TableHead className="text-right">Revenue</TableHead>
                )}
                {userRole !== "DRIVER" && <TableHead>Broker</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loads.map((load: any) => (
                <LoadTableRow
                  key={load.id}
                  load={load}
                  userRole={userRole}
                  isManager={isManager}
                  showDriverCol={false}
                  showDispatcherCol={false}
                  showTruckCol={userRole !== "DRIVER"}
                  statusStyles={statusStyles}
                  onEdit={onEdit}
                  onVerify={onVerify}
                  onDelete={onDelete}
                  onVoid={onVoid}
                  setBolPreview={setBolPreview}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadTableRow({
  load,
  userRole,
  isManager,
  showDriverCol,
  showDispatcherCol,
  showTruckCol = false,
  statusStyles,
  onEdit,
  onVerify,
  onDelete,
  onVoid,
  setBolPreview,
}: {
  load: any;
  userRole: string;
  isManager: boolean;
  showDriverCol: boolean;
  showDispatcherCol: boolean;
  showTruckCol?: boolean;
  statusStyles: Record<string, string>;
  onEdit: (load: any) => void;
  onVerify: (id: number) => void;
  onDelete: (load: any) => void;
  onVoid: (load: any) => void;
  setBolPreview: (url: string | null) => void;
}) {
  return (
    <TableRow data-testid={`row-load-table-${load.id}`}>
      <TableCell className="text-muted-foreground text-xs tabular-nums">
        {load.id}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[180px]">
              {load.verifiedPickupAddress || load.extractedPickupAddress || load.pickupAddress || "—"}
            </p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowRight className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[180px]">
                {load.verifiedDeliveryAddress || load.extractedDeliveryAddress || load.deliveryAddress || "—"}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {(load.bolFileUrls?.length > 0 || load.bolFileUrl) && (
                <button
                  className="flex items-center gap-1 text-[10px] text-primary cursor-pointer"
                  onClick={() =>
                    setBolPreview(load.bolFileUrls?.[0] || load.bolFileUrl)
                  }
                  data-testid={`button-view-bol-${load.id}`}
                >
                  <FileText className="w-3 h-3" />
                  View BOL
                  {load.bolFileUrls?.length > 1
                    ? ` (${load.bolFileUrls.length})`
                    : ""}
                </button>
              )}
              {load.bolParsed && (
                <span className="flex items-center gap-0.5 text-[10px] text-chart-2">
                  <ScanSearch className="w-3 h-3" />
                  OCR
                </span>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      {showDriverCol && (
        <TableCell
          className="text-sm max-w-[140px] truncate"
          data-testid={`text-load-driver-${load.id}`}
        >
          {load.driverName || "—"}
        </TableCell>
      )}
      {showDispatcherCol && (
        <TableCell
          className="text-sm text-muted-foreground"
          data-testid={`text-load-dispatcher-${load.id}`}
        >
          {load.assignedDispatcherName || "—"}
        </TableCell>
      )}
      {showTruckCol && (
        <TableCell
          className="text-sm text-muted-foreground font-mono"
          data-testid={`text-load-truck-${load.id}`}
        >
          {load.truckNumber || "—"}
        </TableCell>
      )}
      <TableCell className="text-sm text-muted-foreground">
        {load.pickupDate || "—"}
      </TableCell>
      <TableCell className="text-right">
        <span className="text-sm font-medium tabular-nums">
          {load.finalMiles
            ? Number(load.finalMiles).toLocaleString()
            : load.calculatedMiles
              ? Number(load.calculatedMiles).toLocaleString()
              : "—"}
        </span>
      </TableCell>
      {userRole !== "DRIVER" && (
        <TableCell className="text-right">
          {load.revenueAmount ? (
            <span
              className="text-sm font-medium tabular-nums"
              data-testid={`text-revenue-${load.id}`}
            >
              $
              {Number(load.revenueAmount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      )}
      {userRole !== "DRIVER" && (
        <TableCell>
          <span
            className="text-sm truncate max-w-[120px] block"
            data-testid={`text-broker-${load.id}`}
          >
            {load.brokerName || "—"}
          </span>
        </TableCell>
      )}
      <TableCell>
        <div className="flex items-center gap-1 flex-wrap">
          {load.isDeleted ? (
            <Badge
              variant="destructive"
              className="text-[10px]"
              data-testid={`badge-deleted-${load.id}`}
            >
              <Trash2 className="w-2.5 h-2.5 mr-0.5" />
              DELETED
            </Badge>
          ) : load.isVoided ? (
            <Badge
              variant="destructive"
              className="text-[10px]"
              data-testid={`badge-voided-${load.id}`}
            >
              <Ban className="w-2.5 h-2.5 mr-0.5" />
              VOIDED
            </Badge>
          ) : (
            <Badge
              variant={(statusStyles[load.status] as any) || "secondary"}
              className="text-[10px]"
            >
              {load.status === "OCR_DONE" ? "OCR DONE" : load.status}
            </Badge>
          )}
          {load.needsManualDelivery &&
            !load.verifiedDeliveryAddress &&
            !load.isDeleted &&
            !load.isVoided && (
              <Badge
                variant="destructive"
                className="text-[9px]"
                data-testid={`badge-needs-manual-${load.id}`}
              >
                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                Manual
              </Badge>
            )}
        </div>
      </TableCell>
      <TableCell>
        <LoadActions
          load={load}
          userRole={userRole}
          onEdit={() => onEdit(load)}
          onVerify={() => onVerify(load.id)}
          onDelete={() => onDelete(load)}
          onVoid={() => onVoid(load)}
        />
      </TableCell>
    </TableRow>
  );
}

function LoadActions({
  load,
  userRole,
  onEdit,
  onVerify,
  onDelete,
  onVoid,
}: {
  load: any;
  userRole: string;
  onEdit: () => void;
  onVerify: () => void;
  onDelete: () => void;
  onVoid: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [approveWarningOpen, setApproveWarningOpen] = useState(false);
  const [approveWarnings, setApproveWarnings] = useState<string[]>([]);

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return apiRequest("PATCH", `/api/loads/${load.id}/status`, {
        status: newStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/loads"),
      });
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/dashboard/stats"),
      });
      toast({ title: "Load status updated" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const handleApproveClick = () => {
    const missing: string[] = [];
    if (!load.driverUserId) missing.push("Driver");
    if (!load.pickupAddress?.trim()) missing.push("Pickup Address");
    if (!load.deliveryAddress?.trim()) missing.push("Delivery Address");
    const finalMilesNum = parseFloat(load.finalMiles || "0");
    if (!finalMilesNum || finalMilesNum <= 0) missing.push("Final Miles");
    const revenueNum = parseFloat(load.revenueAmount || "0");
    if (!revenueNum || revenueNum <= 0) missing.push("Revenue Amount");
    if (!load.truckId) missing.push("Truck Number");
    if (missing.length > 0) {
      toast({
        title: "Cannot approve load",
        description: `Missing required fields: ${missing.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }
    const warnings: string[] = [];
    if (!load.brokerName?.trim()) warnings.push("Broker/Customer is empty");
    if (!load.pickupDate) warnings.push("Pickup date is missing");
    if (!load.deliveryDate) warnings.push("Delivery date is missing");
    if (load.pickupDate && load.deliveryDate && load.deliveryDate < load.pickupDate)
      warnings.push("Delivery date is earlier than pickup date");
    const calcMiles = parseFloat(load.calculatedMiles || "0");
    if (calcMiles > 0 && finalMilesNum > 0) {
      const diff = Math.abs(finalMilesNum - calcMiles);
      if (diff > 100 || diff / calcMiles > 0.15)
        warnings.push(`Final miles (${finalMilesNum.toFixed(0)}) differ significantly from calculated miles (${calcMiles.toFixed(0)})`);
    }
    const hasBol = load.bolFileUrl || load.documentUrl || (Array.isArray(load.bolFileUrls) && load.bolFileUrls.length > 0);
    if (!hasBol) warnings.push("No BOL or document is attached to this load");
    if (warnings.length > 0) {
      setApproveWarnings(warnings);
      setApproveWarningOpen(true);
    } else {
      statusMutation.mutate("APPROVED");
    }
  };

  const restoreMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/loads/${load.id}/restore`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/loads"),
      });
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/dashboard/stats"),
      });
      toast({ title: "Load restored" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const isManagerRole =
    userRole === "DISPATCHER" ||
    userRole === "ADMIN" ||
    userRole === "SUPERADMIN";
  const isAdminRole = userRole === "ADMIN" || userRole === "SUPERADMIN";
  const isDriverRole = userRole === "DRIVER";

  if (load.isDeleted || load.isVoided) {
    return (
      <div className="flex items-center gap-1">
        {isAdminRole && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => restoreMutation.mutate()}
            disabled={restoreMutation.isPending}
            data-testid={`button-restore-load-${load.id}`}
          >
            {restoreMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3 mr-1" />
            )}
            Restore
          </Button>
        )}
      </div>
    );
  }

  const canVerify =
    (load.status === "SUBMITTED" ||
      load.status === "BOL_UPLOADED" ||
      load.status === "OCR_DONE") &&
    isManagerRole;
  const canApprove = load.status === "VERIFIED" && isManagerRole;
  const canEdit2 =
    !isDriverRole &&
    (load.status === "DRAFT" ||
      load.status === "BOL_UPLOADED" ||
      load.status === "OCR_DONE" ||
      (load.status === "VERIFIED" && isManagerRole) ||
      isAdminRole);

  const deletableStatuses = [
    "DRAFT",
    "BOL_UPLOADED",
    "OCR_DONE",
    "SUBMITTED",
    "VERIFIED",
  ];
  const canDelete = isManagerRole && deletableStatuses.includes(load.status);
  const voidableStatuses = ["VERIFIED", "APPROVED", "LOCKED"];
  const canVoid = isManagerRole && voidableStatuses.includes(load.status);

  return (
    <div className="flex items-center gap-1">
      {canEdit2 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          data-testid={`button-edit-load-${load.id}`}
        >
          Edit
        </Button>
      )}
      {canVerify && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onVerify}
          disabled={statusMutation.isPending}
          data-testid={`button-verify-load-${load.id}`}
        >
          <ScanSearch className="w-3 h-3 mr-1" />
          Verify
        </Button>
      )}
      {canApprove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleApproveClick}
          disabled={statusMutation.isPending}
          data-testid={`button-approve-load-${load.id}`}
        >
          Approve
        </Button>
      )}
      <Dialog open={approveWarningOpen} onOpenChange={setApproveWarningOpen}>
        <DialogContent data-testid="dialog-approve-warning">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Unusual Load Data
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This load has data that looks incomplete or unusual:</p>
            <ul className="space-y-1.5" data-testid="list-approve-warnings">
              {approveWarnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  {w}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground pt-1">You can go back and edit, or continue with approval anyway.</p>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setApproveWarningOpen(false)} data-testid="button-approve-go-back">
              Go Back
            </Button>
            <Button
              size="sm"
              onClick={() => { setApproveWarningOpen(false); statusMutation.mutate("APPROVED"); }}
              disabled={statusMutation.isPending}
              data-testid="button-approve-anyway"
            >
              Approve Anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {canDelete && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          data-testid={`button-delete-load-${load.id}`}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      )}
      {canVoid && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onVoid}
          data-testid={`button-void-load-${load.id}`}
        >
          <Ban className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}

function DeleteLoadDialog({
  load,
  open,
  onClose,
}: {
  load: any;
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/loads/${load.id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/loads"),
      });
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/dashboard/stats"),
      });
      toast({ title: "Load deleted" });
      onClose();
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (!load) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            Delete Load #{load?.id}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will remove the load from active view. It can be restored later
            by an admin.
          </p>
          <div className="rounded-md bg-muted p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Route</p>
            <p className="text-sm">
              {load?.pickupAddress || "—"} → {load?.deliveryAddress || "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Status: <span className="font-medium">{load?.status}</span>
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VoidLoadDialog({
  load,
  open,
  voidReason,
  setVoidReason,
  onClose,
}: {
  load: any;
  open: boolean;
  voidReason: string;
  setVoidReason: (v: string) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const voidMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/loads/${load.id}/void`, {
        reason: voidReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/loads"),
      });
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/dashboard/stats"),
      });
      toast({ title: "Load voided" });
      onClose();
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (!load) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-destructive" />
            Void Load #{load?.id}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This keeps the record for audit purposes but removes it from payroll
            totals. A reason is required.
          </p>
          <div className="rounded-md bg-muted p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Route</p>
            <p className="text-sm">
              {load?.pickupAddress || "—"} → {load?.deliveryAddress || "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Status: <span className="font-medium">{load?.status}</span>
            </p>
            {load?.finalMiles && (
              <p className="text-xs text-muted-foreground">
                Miles:{" "}
                <span className="font-medium">
                  {Number(load.finalMiles).toLocaleString()}
                </span>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Reason for voiding</Label>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Explain why this load is being voided..."
              className="resize-none"
              rows={3}
              data-testid="input-void-reason"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="button-cancel-void"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => voidMutation.mutate()}
              disabled={voidMutation.isPending || !voidReason.trim()}
              data-testid="button-confirm-void"
            >
              {voidMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Ban className="w-4 h-4 mr-2" />
              )}
              Void Load
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VerifyLoadDialog({
  loadId,
  open,
  onClose,
}: {
  loadId: number;
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [manualMiles, setManualMiles] = useState("");
  const [showOcrLines, setShowOcrLines] = useState(false);

  const { data: loadDetail, isLoading } = useQuery<any>({
    queryKey: tenantQueryKey(user, "/api/loads", loadId),
    enabled: open && !!loadId && !!user?.id,
  });

  useEffect(() => {
    if (loadDetail && open) {
      setPickupAddress(
        loadDetail.verifiedPickupAddress ||
          loadDetail.extractedPickupAddress ||
          loadDetail.pickupAddress ||
          "",
      );
      setDeliveryAddress(
        loadDetail.verifiedDeliveryAddress ||
          loadDetail.extractedDeliveryAddress ||
          loadDetail.deliveryAddress ||
          "",
      );
      setManualMiles(loadDetail.finalMiles || loadDetail.calculatedMiles || "");
      setShowOcrLines(false);
    }
  }, [loadDetail, open]);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/loads/${loadId}/verify`, {
        pickupAddress,
        deliveryAddress,
        calculatedMiles: manualMiles || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/loads"),
      });
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/loads", loadId),
      });
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/dashboard/stats"),
      });
      toast({ title: "Load verified successfully" });
      handleClose();
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const calculateMilesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/loads/${loadId}/calculate-miles`,
        {
          manualMiles: manualMiles || undefined,
        },
      );
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.calculatedMiles) {
        setManualMiles(data.calculatedMiles);
        toast({
          title: `Miles calculated: ${Number(data.calculatedMiles).toLocaleString()}`,
        });
      }
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/loads", loadId),
      });
    },
    onError: (err: any) => {
      toast({
        title: "Miles calculation",
        description: err.message || "Enter miles manually",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setPickupAddress("");
    setDeliveryAddress("");
    setManualMiles("");
    setShowOcrLines(false);
    onClose();
  };

  const pickupConfidence = loadDetail?.confidencePickup
    ? Number(loadDetail.confidencePickup)
    : 0;
  const deliveryConfidence = loadDetail?.confidenceDelivery
    ? Number(loadDetail.confidenceDelivery)
    : 0;
  const pickupCandidates: string[] = loadDetail?.pickupCandidates || [];
  const deliveryCandidates: string[] = loadDetail?.deliveryCandidates || [];
  const pickupSourceLines: string[] = loadDetail?.pickupSourceLines || [];
  const deliverySourceLines: string[] = loadDetail?.deliverySourceLines || [];

  const showPickupDropdown =
    pickupCandidates.length > 1 ||
    (pickupConfidence > 0 && pickupConfidence < 85);
  const showDeliveryDropdown =
    deliveryCandidates.length > 1 ||
    (deliveryConfidence > 0 && deliveryConfidence < 85);

  const getUniqueOptions = (candidates: string[], current: string) => {
    const all = current ? [current, ...candidates] : [...candidates];
    return Array.from(new Set(all.map((a) => a.trim()).filter(Boolean)));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch className="w-5 h-5" />
            Verify Load #{loadId}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : loadDetail ? (
          <div className="space-y-5">
            {(loadDetail.bolFileUrls?.length > 0 || loadDetail.bolFileUrl) && (
              <div className="flex gap-2 overflow-x-auto">
                {(
                  loadDetail.bolFileUrls ||
                  [loadDetail.bolFileUrl].filter(Boolean)
                ).map((url: string, i: number) => (
                  <div
                    key={i}
                    className="rounded-md overflow-hidden border flex-shrink-0"
                  >
                    {url.endsWith(".pdf") ? (
                      <iframe
                        src={url}
                        className="w-48 h-36 rounded-md"
                        data-testid={`iframe-verify-bol-${i}`}
                      />
                    ) : (
                      <img
                        src={url}
                        alt={`BOL ${i + 1}`}
                        className="w-48 h-36 object-contain"
                        data-testid={`img-verify-bol-${i}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {loadDetail.needsManualDelivery && (
              <div
                className="rounded-md bg-destructive/10 p-3 flex items-start gap-2"
                data-testid="div-needs-manual-warning"
              >
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-destructive">
                    Delivery address not detected
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Please enter the delivery address manually from the BOL
                    document.
                  </p>
                </div>
              </div>
            )}

            {(pickupConfidence > 0 && pickupConfidence < 85) ||
            (deliveryConfidence > 0 && deliveryConfidence < 85) ? (
              <div
                className="rounded-md bg-amber-500/10 p-3 flex items-start gap-2"
                data-testid="div-low-confidence-warning"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-500">
                    Multiple address fragments detected
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    OCR confidence is low. Please verify the addresses below or
                    select from suggestions.
                  </p>
                </div>
              </div>
            ) : null}

            {loadDetail.bolParsed && (
              <div className="rounded-md bg-chart-2/10 p-3 space-y-2">
                <p className="text-xs font-medium flex items-center gap-1.5 text-chart-2">
                  <CheckCircle className="w-3 h-3" />
                  OCR Extracted Addresses
                </p>
                {loadDetail.extractedPickupAddress && (
                  <p className="text-xs text-muted-foreground">
                    Pickup:{" "}
                    <span className="text-foreground">
                      {loadDetail.extractedPickupAddress}
                    </span>
                    {pickupConfidence > 0 && (
                      <Badge
                        variant={
                          pickupConfidence >= 85 ? "secondary" : "destructive"
                        }
                        className="text-[9px] ml-1"
                      >
                        {pickupConfidence.toFixed(0)}%
                      </Badge>
                    )}
                  </p>
                )}
                {loadDetail.extractedDeliveryAddress ? (
                  <p className="text-xs text-muted-foreground">
                    Delivery:{" "}
                    <span className="text-foreground">
                      {loadDetail.extractedDeliveryAddress}
                    </span>
                    {deliveryConfidence > 0 && (
                      <Badge
                        variant={
                          deliveryConfidence >= 85 ? "secondary" : "destructive"
                        }
                        className="text-[9px] ml-1"
                      >
                        {deliveryConfidence.toFixed(0)}%
                      </Badge>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-destructive">
                    Delivery address not detected by OCR
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Pickup Address</Label>
                <Input
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="Full pickup address"
                  data-testid="input-verify-pickup"
                />
                {showPickupDropdown && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Pickup suggestions
                    </Label>
                    <Select
                      value={pickupAddress}
                      onValueChange={(v) => setPickupAddress(v)}
                    >
                      <SelectTrigger
                        className="text-xs"
                        data-testid="select-pickup-suggestions"
                      >
                        <SelectValue placeholder="Select suggested address" />
                      </SelectTrigger>
                      <SelectContent>
                        {getUniqueOptions(
                          pickupCandidates,
                          loadDetail.extractedPickupAddress || "",
                        ).map((addr, i) => (
                          <SelectItem key={i} value={addr} className="text-xs">
                            {addr}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-2">
                  Delivery Address
                  {loadDetail.needsManualDelivery && (
                    <Badge variant="destructive" className="text-[9px]">
                      Manual
                    </Badge>
                  )}
                </Label>
                <Input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Full delivery address"
                  data-testid="input-verify-delivery"
                />
                {showDeliveryDropdown && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Delivery suggestions
                    </Label>
                    <Select
                      value={deliveryAddress}
                      onValueChange={(v) => setDeliveryAddress(v)}
                    >
                      <SelectTrigger
                        className="text-xs"
                        data-testid="select-delivery-suggestions"
                      >
                        <SelectValue placeholder="Select suggested address" />
                      </SelectTrigger>
                      <SelectContent>
                        {getUniqueOptions(
                          deliveryCandidates,
                          loadDetail.extractedDeliveryAddress || "",
                        ).map((addr, i) => (
                          <SelectItem key={i} value={addr} className="text-xs">
                            {addr}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Miles</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={manualMiles}
                    onChange={(e) => setManualMiles(e.target.value)}
                    placeholder="Enter or calculate miles"
                    data-testid="input-verify-miles"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => calculateMilesMutation.mutate()}
                    disabled={
                      calculateMilesMutation.isPending ||
                      (!pickupAddress && !deliveryAddress)
                    }
                    title="Recalculate miles"
                    data-testid="button-recalculate-miles"
                  >
                    {calculateMilesMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Calculator className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                {!manualMiles && (
                  <p className="text-[10px] text-muted-foreground">
                    Click calculator to auto-route, or enter miles manually.
                  </p>
                )}
              </div>
            </div>

            {(pickupSourceLines.length > 0 ||
              deliverySourceLines.length > 0 ||
              loadDetail.pickupContext ||
              loadDetail.deliveryContext) && (
              <Collapsible open={showOcrLines} onOpenChange={setShowOcrLines}>
                <CollapsibleTrigger
                  className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer w-full"
                  data-testid="button-toggle-ocr-lines"
                >
                  {showOcrLines ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  <Info className="w-3 h-3" />
                  OCR lines used for extraction
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3">
                  {pickupSourceLines.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        Pickup OCR lines
                      </p>
                      <pre
                        className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded-sm whitespace-pre-wrap"
                        data-testid="text-pickup-source-lines"
                      >
                        {pickupSourceLines.join("\n")}
                      </pre>
                    </div>
                  )}
                  {deliverySourceLines.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        Delivery OCR lines
                      </p>
                      <pre
                        className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded-sm whitespace-pre-wrap"
                        data-testid="text-delivery-source-lines"
                      >
                        {deliverySourceLines.join("\n")}
                      </pre>
                    </div>
                  )}
                  {loadDetail.pickupContext && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        Shipper section (raw)
                      </p>
                      <pre
                        className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded-sm whitespace-pre-wrap max-h-32 overflow-y-auto"
                        data-testid="text-pickup-context"
                      >
                        {loadDetail.pickupContext}
                      </pre>
                    </div>
                  )}
                  {loadDetail.deliveryContext && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        Consignee section (raw)
                      </p>
                      <pre
                        className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded-sm whitespace-pre-wrap max-h-32 overflow-y-auto"
                        data-testid="text-delivery-context"
                      >
                        {loadDetail.deliveryContext}
                      </pre>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            <Button
              className="w-full"
              onClick={() => verifyMutation.mutate()}
              disabled={
                verifyMutation.isPending || !pickupAddress || !deliveryAddress
              }
              data-testid="button-confirm-verify"
            >
              {verifyMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Verify Load
                </span>
              )}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Load not found
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LoadForm({ load, onSuccess }: { load?: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: driversData } = useQuery<{ items: any[] }>({
    queryKey: tenantQueryKey(user, "/api/drivers", { limit: "100" }),
    enabled: !!user?.id && !!user?.companyId,
  });
  const drivers = driversData?.items;

  const { data: trucksData } = useQuery<any[]>({
    queryKey: tenantQueryKey(user, "/api/trucks"),
    enabled: !!user?.id && !!user?.companyId && user?.role !== "DRIVER",
  });
  const activeTrucks = (trucksData ?? []).filter((t: any) => t.status === "ACTIVE");

  const [form, setForm] = useState({
    driverUserId:
      load?.driverUserId?.toString() ||
      (user?.role === "DRIVER" ? user?.id?.toString() : ""),
    truckId: load?.truckId?.toString() || "",
    pickupAddress: load?.pickupAddress || "",
    deliveryAddress: load?.deliveryAddress || "",
    pickupDate: load?.pickupDate || "",
    deliveryDate: load?.deliveryDate || "",
    calculatedMiles: load?.calculatedMiles || "",
    adjustedMiles: load?.adjustedMiles || "",
    finalMiles: load?.finalMiles || "",
    revenueAmount: load?.revenueAmount || "",
    revenueSource: load?.revenueSource || "",
    brokerName: load?.brokerName || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (load) {
        return apiRequest("PATCH", `/api/loads/${load.id}`, data);
      }
      return apiRequest("POST", "/api/loads", data);
    },
    onSuccess: async (res: any) => {
      let result: any = null;
      try {
        result = await res.json();
      } catch {}
      if (result?.autoCalculatedMiles) {
        toast({
          title: `Miles auto-calculated: ${Number(result.autoCalculatedMiles).toLocaleString()}`,
        });
      }
      onSuccess();
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      }),
  });

  const recalcMutation = useMutation({
    mutationFn: async () => {
      if (!load) return;
      const res = await apiRequest(
        "POST",
        `/api/loads/${load.id}/calculate-miles`,
        {
          pickup: form.pickupAddress,
          delivery: form.deliveryAddress,
        },
      );
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.calculatedMiles) {
        const miles = data.calculatedMiles;
        setForm((f: any) => ({
          ...f,
          calculatedMiles: miles,
          finalMiles: f.adjustedMiles || miles,
        }));
        toast({ title: `Miles calculated: ${Number(miles).toLocaleString()}` });
      }
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey(user, "/api/loads"),
      });
    },
    onError: (err: any) => {
      toast({
        title: "Calculation failed",
        description: err.message || "Enter miles manually",
        variant: "destructive",
      });
    },
  });

  const dateError =
    form.pickupDate && form.deliveryDate && form.deliveryDate < form.pickupDate
      ? "Delivery date cannot be before pickup date."
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dateError) return;
    mutation.mutate({
      ...form,
      driverUserId: parseInt(form.driverUserId),
      truckId: form.truckId ? parseInt(form.truckId) : null,
      calculatedMiles: form.calculatedMiles ? form.calculatedMiles : null,
      adjustedMiles: form.adjustedMiles ? form.adjustedMiles : null,
      finalMiles:
        form.finalMiles || form.adjustedMiles || form.calculatedMiles || null,
      revenueAmount:
        form.revenueSource === "MANUAL"
          ? form.revenueAmount || null
          : undefined,
      revenueSource: form.revenueSource === "MANUAL" ? "MANUAL" : undefined,
      brokerName: user?.role !== "DRIVER" ? form.brokerName || null : undefined,
    });
  };

  const canRecalc =
    load &&
    form.pickupAddress &&
    form.deliveryAddress &&
    (user?.role === "DISPATCHER" ||
      user?.role === "ADMIN" ||
      user?.role === "SUPERADMIN");

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {user?.role !== "DRIVER" && (
        <div className="space-y-1.5">
          <Label>Driver</Label>
          <Select
            value={form.driverUserId}
            onValueChange={(v) => setForm({ ...form, driverUserId: v })}
          >
            <SelectTrigger data-testid="select-load-driver">
              <SelectValue placeholder="Select driver" />
            </SelectTrigger>
            <SelectContent>
              {(drivers ?? []).map((d: any) => (
                <SelectItem key={d.id} value={d.id.toString()}>
                  {d.firstName} {d.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {user?.role !== "DRIVER" && activeTrucks.length > 0 && (
        <div className="space-y-1.5">
          <Label>Truck</Label>
          <Select
            value={form.truckId || "__none__"}
            onValueChange={(v) => setForm({ ...form, truckId: v === "__none__" ? "" : v })}
          >
            <SelectTrigger data-testid="select-load-truck">
              <SelectValue placeholder="No truck assigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No truck assigned</SelectItem>
              {activeTrucks.map((t: any) => (
                <SelectItem key={t.id} value={t.id.toString()}>
                  #{t.truckNumber} — {t.make} {t.model} {t.year ? `(${t.year})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!form.truckId && (
            <p className="text-xs text-yellow-500 flex items-center gap-1" data-testid="warn-missing-truck">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              Truck is required to approve this load
            </p>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Pickup Address</Label>
        <Input
          data-testid="input-pickup-address"
          value={form.pickupAddress}
          onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })}
          required
          placeholder="123 Main St, Dallas, TX"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Delivery Address</Label>
        <Input
          data-testid="input-delivery-address"
          value={form.deliveryAddress}
          onChange={(e) =>
            setForm({ ...form, deliveryAddress: e.target.value })
          }
          required
          placeholder="456 Oak Ave, Houston, TX"
        />
      </div>
      {user?.role !== "DRIVER" && (
        <div className="space-y-1.5">
          <Label>Broker / Customer</Label>
          <Input
            data-testid="input-broker-name"
            value={form.brokerName}
            onChange={(e) => setForm({ ...form, brokerName: e.target.value })}
            placeholder="e.g. XPO Logistics"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Pickup Date</Label>
          <Input
            data-testid="input-pickup-date"
            type="date"
            value={form.pickupDate}
            onChange={(e) => setForm({ ...form, pickupDate: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Delivery Date</Label>
          <Input
            data-testid="input-delivery-date"
            type="date"
            value={form.deliveryDate}
            min={form.pickupDate || undefined}
            onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })}
            className={dateError ? "border-destructive" : ""}
          />
          {dateError && (
            <p className="text-xs text-destructive">{dateError}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Calculated Miles</Label>
          <Input
            data-testid="input-calculated-miles"
            type="number"
            value={form.calculatedMiles}
            onChange={(e) =>
              setForm({ ...form, calculatedMiles: e.target.value })
            }
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Adjusted Miles</Label>
          <Input
            data-testid="input-adjusted-miles"
            type="number"
            value={form.adjustedMiles}
            onChange={(e) =>
              setForm({ ...form, adjustedMiles: e.target.value })
            }
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Final Miles</Label>
          <Input
            data-testid="input-final-miles"
            type="number"
            value={form.finalMiles}
            onChange={(e) => setForm({ ...form, finalMiles: e.target.value })}
            placeholder="0"
          />
        </div>
      </div>
      {(() => {
        const fm = parseFloat(form.finalMiles || "0");
        const cm = parseFloat(form.calculatedMiles || "0");
        const warns: string[] = [];
        if (form.finalMiles && fm <= 0) warns.push("Final miles must be greater than 0");
        if (fm > 0 && cm > 0) {
          const diff = Math.abs(fm - cm);
          if (diff > 100 || diff / cm > 0.15)
            warns.push(`Final miles (${fm.toFixed(0)}) differ significantly from calculated miles (${cm.toFixed(0)})`);
        }
        return warns.length > 0 ? (
          <div className="space-y-1" data-testid="warn-miles-block">
            {warns.map((w, i) => (
              <p key={i} className="text-xs text-yellow-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />{w}
              </p>
            ))}
          </div>
        ) : null;
      })()}
      {canRecalc && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => recalcMutation.mutate()}
          disabled={recalcMutation.isPending}
          data-testid="button-recalculate-edit-miles"
        >
          {recalcMutation.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Calculating miles...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              Recalculate Miles
            </span>
          )}
        </Button>
      )}
      {user?.role !== "DRIVER" && (
        <div className="border-t pt-3 space-y-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Revenue</Label>
          </div>
          {load?.revenueAmount && load?.revenueSource !== "MANUAL" && (
            <p className="text-xs text-muted-foreground">
              Auto-calculated: $
              {Number(load.revenueAmount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
              {load.revenueSource === "AUTO_RPM" &&
                load.revenueRpmUsed &&
                ` @ $${load.revenueRpmUsed}/mi`}
              {load.revenueSource === "FLAT" && " (flat rate)"}
            </p>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Override Revenue</Label>
            <Select
              value={form.revenueSource}
              onValueChange={(v) => setForm({ ...form, revenueSource: v })}
            >
              <SelectTrigger data-testid="select-revenue-source">
                <SelectValue placeholder="Use company default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Use Company Default</SelectItem>
                <SelectItem value="MANUAL">Manual Entry</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.revenueSource === "MANUAL" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Revenue Amount ($)</Label>
              <Input
                data-testid="input-revenue-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.revenueAmount}
                onChange={(e) =>
                  setForm({ ...form, revenueAmount: e.target.value })
                }
                placeholder="0.00"
              />
              {form.revenueAmount && parseFloat(form.revenueAmount) <= 0 && (
                <p className="text-xs text-yellow-500 flex items-center gap-1" data-testid="warn-revenue-zero">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  Revenue amount must be greater than 0
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <Button
        type="submit"
        className="w-full"
        disabled={mutation.isPending}
        data-testid="button-save-load"
      >
        {mutation.isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </span>
        ) : load ? (
          "Update Load"
        ) : (
          "Create Load"
        )}
      </Button>
    </form>
  );
}
