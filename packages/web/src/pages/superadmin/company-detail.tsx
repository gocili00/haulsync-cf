import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Building2, Users, Truck, DollarSign, Mail, Shield,
  UserPlus, Power, PowerOff, Eye, RefreshCw, Undo2, Ban,
  Copy, CheckCircle2, AlertTriangle, FileText, Radio, Lock,
} from "lucide-react";

const tabList = ["Overview", "Users", "Drivers", "Dispatchers", "Loads", "Payroll", "Invites"] as const;
type Tab = typeof tabList[number];

const roleBadgeVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ADMIN: "default", DISPATCHER: "secondary", DRIVER: "outline", SUPERADMIN: "destructive",
};
const roleIcons: Record<string, typeof Shield> = { ADMIN: Shield, DISPATCHER: Radio, DRIVER: Truck, SUPERADMIN: Shield };

export default function CompanyDetail({ companyId }: { companyId: number }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("DRIVER");
  const [lastInviteLink, setLastInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [dangerAction, setDangerAction] = useState<{ type: string; id: number; label: string } | null>(null);
  const [dangerReason, setDangerReason] = useState("");
  const [dangerConfirm, setDangerConfirm] = useState("");
  const [showDeletedVoided, setShowDeletedVoided] = useState(false);

  const { data: company, isLoading } = useQuery<any>({
    queryKey: ["/api/superadmin/companies", companyId],
  });

  const { data: companyUsers } = useQuery<any[]>({
    queryKey: ["/api/superadmin/companies", companyId, "users"],
    enabled: activeTab === "Users",
  });

  const { data: drivers } = useQuery<any[]>({
    queryKey: ["/api/superadmin/companies", companyId, "drivers"],
    enabled: activeTab === "Drivers",
  });

  const { data: dispatchers } = useQuery<any[]>({
    queryKey: ["/api/superadmin/companies", companyId, "dispatchers"],
    enabled: activeTab === "Dispatchers",
  });

  const { data: companyLoads } = useQuery<any[]>({
    queryKey: ["/api/superadmin/companies", companyId, "loads", showDeletedVoided],
    queryFn: async () => {
      const res = await fetch(`/api/superadmin/companies/${companyId}/loads?includeDeletedVoided=${showDeletedVoided}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch loads");
      return res.json();
    },
    enabled: activeTab === "Loads",
  });

  const { data: payrollWeeks } = useQuery<any[]>({
    queryKey: ["/api/superadmin/companies", companyId, "payroll"],
    enabled: activeTab === "Payroll",
  });

  const { data: companyInvites } = useQuery<any[]>({
    queryKey: ["/api/superadmin/companies", companyId, "invites"],
    enabled: activeTab === "Invites",
  });

  const toggleUserMutation = useMutation({
    mutationFn: async ({ userId, activate }: { userId: number; activate: boolean }) => {
      return apiRequest("PATCH", `/api/superadmin/users/${userId}/${activate ? "enable" : "disable"}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/companies", companyId, "users"] });
      toast({ title: "User status updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      return apiRequest("PATCH", `/api/superadmin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/companies", companyId, "users"] });
      toast({ title: "User role updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/invites", { email: inviteEmail, role: inviteRole, companyId });
      return res.json();
    },
    onSuccess: (data) => {
      setLastInviteLink(data.inviteLink);
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/companies", companyId, "invites"] });
      toast({ title: "Invite created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      return apiRequest("POST", "/api/invites/revoke", { inviteId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/companies", companyId, "invites"] });
      toast({ title: "Invite revoked" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const dangerMutation = useMutation({
    mutationFn: async () => {
      if (!dangerAction) throw new Error("No action");
      const { type, id } = dangerAction;
      if (type === "void") return apiRequest("POST", `/api/superadmin/companies/${companyId}/loads/${id}/void`, { reason: dangerReason });
      if (type === "restore") return apiRequest("POST", `/api/superadmin/companies/${companyId}/loads/${id}/restore`);
      if (type === "unlock") return apiRequest("POST", `/api/superadmin/companies/${companyId}/payroll/${id}/unlock`, { reason: dangerReason });
      if (type === "regenerate") return apiRequest("POST", `/api/superadmin/companies/${companyId}/payroll/${id}/regenerate-statement`);
      if (type === "recalculate") return apiRequest("POST", `/api/superadmin/companies/${companyId}/loads/${id}/recalculate-miles`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/companies", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/companies", companyId, "loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/companies", companyId, "payroll"] });
      setDangerAction(null);
      setDangerReason("");
      setDangerConfirm("");
      toast({ title: "Action completed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const assignDispatcherMutation = useMutation({
    mutationFn: async ({ driverId, dispatcherId }: { driverId: number; dispatcherId: number | null }) => {
      return apiRequest("PATCH", `/api/drivers/${driverId}/assign-dispatcher`, { dispatcherId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/companies", companyId, "drivers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/companies", companyId, "dispatchers"] });
      toast({ title: "Dispatcher assigned" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const companyDispatchers = dispatchers || [];

  const copyLink = async (link: string) => {
    try { await navigator.clipboard.writeText(link); setCopied(true); toast({ title: "Link copied" }); setTimeout(() => setCopied(false), 2000); } catch { toast({ title: "Failed to copy", variant: "destructive" }); }
  };

  const needsConfirmText = dangerAction && ["void", "unlock"].includes(dangerAction.type);
  const confirmWord = dangerAction?.type === "void" ? "VOID" : dangerAction?.type === "unlock" ? "UNLOCK" : "";

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/superadmin/companies")} data-testid="button-sa-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-sa-company-detail-name">{company?.name}</h1>
            <Badge variant={company?.isActive !== false ? "default" : "secondary"}>{company?.isActive !== false ? "Active" : "Inactive"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{company?.address || "No address"} {company?.phone ? `| ${company.phone}` : ""}</p>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap border-b pb-0">
        {tabList.map((tab) => (
          <Button
            key={tab}
            variant="ghost"
            size="sm"
            className={`rounded-b-none ${activeTab === tab ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
            onClick={() => setActiveTab(tab)}
            data-testid={`button-sa-tab-${tab.toLowerCase()}`}
          >
            {tab}
          </Button>
        ))}
      </div>

      {activeTab === "Overview" && company?.stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Users", value: company.stats.totalUsers, icon: Users },
              { label: "Drivers", value: company.stats.totalDrivers, icon: Truck },
              { label: "Dispatchers", value: company.stats.totalDispatchers, icon: Radio },
              { label: "Total Loads", value: company.stats.totalLoads, icon: Truck },
              { label: "Recent Loads (30d)", value: company.stats.recentLoads, icon: FileText },
              { label: "Payroll Weeks", value: company.stats.totalPayrollWeeks, icon: DollarSign },
              { label: "Statements", value: company.stats.statementsGenerated, icon: FileText },
              { label: "Total Payroll", value: `$${Number(company.stats.totalPayroll || 0).toLocaleString()}`, icon: DollarSign },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <s.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-lg font-bold tabular-nums">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-semibold mb-3">Company Settings</p>
              <div className="text-sm space-y-1">
                <p>Timezone: <span className="text-muted-foreground">{company?.timezone || "America/Chicago"}</span></p>
                <p>Allow Admin Invites: <Badge variant="secondary" className="text-[10px] ml-1">{company?.settings?.allowAdminInvites ? "Yes" : "No"}</Badge></p>
                <p>Dispatcher See Unassigned: <Badge variant="secondary" className="text-[10px] ml-1">{company?.settings?.dispatcherCanSeeUnassigned ? "Yes" : "No"}</Badge></p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "Users" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setInviteOpen(true); setLastInviteLink(""); }} data-testid="button-sa-invite-user">
              <UserPlus className="w-4 h-4 mr-2" />
              Invite User
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(companyUsers ?? []).map((u: any) => {
                      const RoleIcon = roleIcons[u.role] || Shield;
                      return (
                        <TableRow key={u.id} data-testid={`row-sa-user-${u.id}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{u.firstName} {u.lastName}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Select
                                value={u.role}
                                onValueChange={(role) => changeRoleMutation.mutate({ userId: u.id, role })}
                              >
                                <SelectTrigger className="w-32" data-testid={`select-sa-role-${u.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="DRIVER">Driver</SelectItem>
                                  <SelectItem value="DISPATCHER">Dispatcher</SelectItem>
                                  <SelectItem value="ADMIN">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.isActive ? "default" : "secondary"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "\u2014"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleUserMutation.mutate({ userId: u.id, activate: !u.isActive })}
                                data-testid={`button-sa-toggle-user-${u.id}`}
                              >
                                {u.isActive ? <PowerOff className="w-4 h-4 text-muted-foreground" /> : <Power className="w-4 h-4 text-chart-2" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/superadmin/users?search=${encodeURIComponent(u.email)}`)}
                                data-testid={`button-sa-user-detail-${u.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "Drivers" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Rate/Mile</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned Dispatcher</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(drivers ?? []).map((d: any) => (
                    <TableRow key={d.id} data-testid={`row-sa-driver-${d.id}`}>
                      <TableCell>
                        <p className="font-medium text-sm">{d.firstName} {d.lastName}</p>
                        <p className="text-xs text-muted-foreground">{d.email}</p>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">${d.profile?.ratePerMile || "0.00"}</TableCell>
                      <TableCell>
                        <Badge variant={d.profile?.status === "ACTIVE" ? "default" : "secondary"}>{d.profile?.status || "N/A"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={d.profile?.assignedDispatcherId?.toString() || "none"}
                          onValueChange={(val) => assignDispatcherMutation.mutate({ driverId: d.id, dispatcherId: val === "none" ? null : parseInt(val) })}
                        >
                          <SelectTrigger className="w-44" data-testid={`select-sa-assign-dispatcher-${d.id}`}>
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {companyDispatchers.map((disp: any) => (
                              <SelectItem key={disp.id} value={disp.id.toString()}>{disp.firstName} {disp.lastName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "Dispatchers" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dispatcher</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Assigned Drivers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(dispatchers ?? []).map((d: any) => (
                    <TableRow key={d.id} data-testid={`row-sa-dispatcher-${d.id}`}>
                      <TableCell className="font-medium text-sm">{d.firstName} {d.lastName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.email}</TableCell>
                      <TableCell><Badge variant={d.isActive ? "default" : "secondary"}>{d.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell className="text-right"><Badge variant="secondary">{d.assignedDriverCount ?? 0}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "Loads" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant={showDeletedVoided ? "default" : "outline"} size="sm" onClick={() => setShowDeletedVoided(!showDeletedVoided)} data-testid="button-sa-show-deleted">
              {showDeletedVoided ? "Hide" : "Show"} Deleted/Voided
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Pickup</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead>Miles</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(companyLoads ?? []).map((l: any) => (
                      <TableRow key={l.id} className={l.isDeleted || l.isVoided ? "opacity-50" : ""} data-testid={`row-sa-load-${l.id}`}>
                        <TableCell className="text-muted-foreground text-xs tabular-nums">{l.id}</TableCell>
                        <TableCell className="text-sm">{l.driverName || "\u2014"}</TableCell>
                        <TableCell className="text-sm max-w-40 truncate">{l.verifiedPickupAddress || l.pickupAddress || "\u2014"}</TableCell>
                        <TableCell className="text-sm max-w-40 truncate">{l.verifiedDeliveryAddress || l.deliveryAddress || "\u2014"}</TableCell>
                        <TableCell className="text-sm tabular-nums">{l.finalMiles || l.calculatedMiles || "\u2014"}</TableCell>
                        <TableCell>
                          <Badge variant={l.isVoided ? "destructive" : l.isDeleted ? "secondary" : "outline"} className="text-[10px]">
                            {l.isVoided ? "Voided" : l.isDeleted ? "Deleted" : l.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {!l.isVoided && !l.isDeleted && (
                              <Button variant="ghost" size="icon" onClick={() => setDangerAction({ type: "void", id: l.id, label: `Void Load #${l.id}` })} data-testid={`button-sa-void-${l.id}`}>
                                <Ban className="w-4 h-4 text-destructive" />
                              </Button>
                            )}
                            {(l.isVoided || l.isDeleted) && (
                              <Button variant="ghost" size="icon" onClick={() => setDangerAction({ type: "restore", id: l.id, label: `Restore Load #${l.id}` })} data-testid={`button-sa-restore-${l.id}`}>
                                <Undo2 className="w-4 h-4 text-chart-2" />
                              </Button>
                            )}
                            {!l.isVoided && !l.isDeleted && (
                              <Button variant="ghost" size="icon" onClick={() => setDangerAction({ type: "recalculate", id: l.id, label: `Recalculate Miles #${l.id}` })} data-testid={`button-sa-recalculate-${l.id}`}>
                                <RefreshCw className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "Payroll" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Week</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Net Pay</TableHead>
                    <TableHead>PDF</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payrollWeeks ?? []).map((pw: any) => (
                    <TableRow key={pw.id} data-testid={`row-sa-payroll-${pw.id}`}>
                      <TableCell className="text-muted-foreground text-xs tabular-nums">{pw.id}</TableCell>
                      <TableCell className="text-sm">{pw.driverName || "\u2014"}</TableCell>
                      <TableCell className="text-sm">{pw.weekStart} - {pw.weekEnd}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{pw.status}</Badge></TableCell>
                      <TableCell className="text-right text-sm tabular-nums">${Number(pw.netPayTotal || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>{pw.statementPdfUrl ? <Badge variant="secondary" className="text-[10px]">PDF</Badge> : <span className="text-xs text-muted-foreground">None</span>}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {["APPROVED", "PAID", "LOCKED"].includes(pw.status) && (
                            <Button variant="ghost" size="icon" onClick={() => setDangerAction({ type: "unlock", id: pw.id, label: `Unlock Week #${pw.id}` })} data-testid={`button-sa-unlock-${pw.id}`}>
                              <Lock className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => setDangerAction({ type: "regenerate", id: pw.id, label: `Regenerate PDF #${pw.id}` })} data-testid={`button-sa-regenerate-${pw.id}`}>
                            <FileText className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "Invites" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => { setInviteOpen(true); setLastInviteLink(""); }} data-testid="button-sa-new-invite">
              <UserPlus className="w-4 h-4 mr-2" />
              New Invite
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(companyInvites ?? []).map((inv: any) => (
                      <TableRow key={inv.id} data-testid={`row-sa-invite-${inv.id}`}>
                        <TableCell className="text-sm">{inv.email}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{inv.role}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={inv.status === "active" ? "default" : inv.status === "accepted" ? "secondary" : "destructive"} className="text-[10px]">
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{inv.createdByName || "\u2014"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(inv.expiresAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {inv.status === "active" && (
                            <Button variant="ghost" size="sm" onClick={() => revokeMutation.mutate(inv.id)} data-testid={`button-sa-revoke-invite-${inv.id}`}>
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) { setLastInviteLink(""); setInviteEmail(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User — {company?.name}</DialogTitle>
          </DialogHeader>
          {lastInviteLink ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-chart-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Invite created! Share this link:</span>
              </div>
              <div className="flex items-center gap-2">
                <Input value={lastInviteLink} readOnly className="text-xs font-mono" />
                <Button size="icon" variant="outline" onClick={() => copyLink(lastInviteLink)}>
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); inviteMutation.mutate(); }} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="user@company.com" data-testid="input-sa-cd-invite-email" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger data-testid="select-sa-cd-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRIVER">Driver</SelectItem>
                    <SelectItem value="DISPATCHER">Dispatcher</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={inviteMutation.isPending || !inviteEmail}>
                {inviteMutation.isPending ? "Creating..." : "Send Invite"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!dangerAction} onOpenChange={(open) => { if (!open) { setDangerAction(null); setDangerReason(""); setDangerConfirm(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {dangerAction?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">This is a dangerous action. Please confirm.</p>
            {needsConfirmText && (
              <>
                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Textarea value={dangerReason} onChange={(e) => setDangerReason(e.target.value)} placeholder="Provide a reason..." data-testid="textarea-sa-danger-reason" />
                </div>
                <div className="space-y-1.5">
                  <Label>Type <strong>{confirmWord}</strong> to confirm</Label>
                  <Input value={dangerConfirm} onChange={(e) => setDangerConfirm(e.target.value)} placeholder={confirmWord} data-testid="input-sa-danger-confirm" />
                </div>
              </>
            )}
            <Button
              variant="destructive"
              className="w-full"
              disabled={dangerMutation.isPending || (needsConfirmText && (dangerConfirm !== confirmWord || !dangerReason))}
              onClick={() => dangerMutation.mutate()}
              data-testid="button-sa-danger-confirm"
            >
              {dangerMutation.isPending ? "Processing..." : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
