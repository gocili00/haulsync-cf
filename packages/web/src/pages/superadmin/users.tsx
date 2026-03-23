import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { Search, Power, PowerOff, Shield, Radio, Truck, Eye, UserCog, KeyRound } from "lucide-react";

export default function SuperadminUsers() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  });
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [resetTarget, setResetTarget] = useState<{ id: number; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: allUsers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: companies } = useQuery<any[]>({
    queryKey: ["/api/companies"],
  });

  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    return allUsers.filter((u) => {
      if (search && !u.email.toLowerCase().includes(search.toLowerCase()) && !`${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (companyFilter !== "ALL" && String(u.companyId) !== companyFilter) return false;
      return true;
    });
  }, [allUsers, search, roleFilter, companyFilter]);

  const toggleUserMutation = useMutation({
    mutationFn: async ({ userId, activate }: { userId: number; activate: boolean }) => {
      return apiRequest("PATCH", `/api/superadmin/users/${userId}/${activate ? "enable" : "disable"}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User status updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      return apiRequest("PATCH", `/api/superadmin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User role updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", "/api/superadmin/impersonate", { userId });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: `Now impersonating ${data.user.firstName} ${data.user.lastName}` });
      navigate("/");
      window.location.reload();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: number; password: string }) => {
      return apiRequest("POST", `/api/superadmin/users/${userId}/reset-password`, { password });
    },
    onSuccess: () => {
      toast({ title: "Password reset successfully" });
      setResetTarget(null);
      setNewPassword("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const roleIcons: Record<string, typeof Shield> = { ADMIN: Shield, DISPATCHER: Radio, DRIVER: Truck, SUPERADMIN: UserCog };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-sa-users-title">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage all platform users across companies</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-sa-user-search"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-36" data-testid="select-sa-user-role-filter">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Roles</SelectItem>
                <SelectItem value="DRIVER">Driver</SelectItem>
                <SelectItem value="DISPATCHER">Dispatcher</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="SUPERADMIN">Super Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-44" data-testid="select-sa-user-company-filter">
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
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u: any) => {
                    const RoleIcon = roleIcons[u.role] || Shield;
                    return (
                      <TableRow key={u.id} data-testid={`row-sa-global-user-${u.id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{u.firstName} {u.lastName}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.role === "SUPERADMIN" ? (
                            <Badge variant="destructive" className="text-[10px]">Super Admin</Badge>
                          ) : (
                            <Select
                              value={u.role}
                              onValueChange={(role) => changeRoleMutation.mutate({ userId: u.id, role })}
                            >
                              <SelectTrigger className="w-32" data-testid={`select-sa-global-role-${u.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DRIVER">Driver</SelectItem>
                                <SelectItem value="DISPATCHER">Dispatcher</SelectItem>
                                <SelectItem value="ADMIN">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.companyName || "\u2014"}</TableCell>
                        <TableCell>
                          <Badge variant={u.isActive ? "default" : "secondary"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "\u2014"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {u.role !== "SUPERADMIN" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => toggleUserMutation.mutate({ userId: u.id, activate: !u.isActive })}
                                  data-testid={`button-sa-global-toggle-${u.id}`}
                                >
                                  {u.isActive ? <PowerOff className="w-4 h-4 text-muted-foreground" /> : <Power className="w-4 h-4 text-chart-2" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => impersonateMutation.mutate(u.id)}
                                  data-testid={`button-sa-impersonate-${u.id}`}
                                >
                                  <Eye className="w-4 h-4 text-muted-foreground" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Reset password"
                                  onClick={() => { setResetTarget({ id: u.id, name: `${u.firstName} ${u.lastName}` }); setNewPassword(""); }}
                                  data-testid={`button-sa-reset-password-${u.id}`}
                                >
                                  <KeyRound className="w-4 h-4 text-muted-foreground" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {filteredUsers.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">No users found matching your filters.</div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); setNewPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password — {resetTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Minimum 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPassword.length >= 6 && resetTarget) {
                  resetPasswordMutation.mutate({ userId: resetTarget.id, password: newPassword });
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetTarget(null); setNewPassword(""); }}>Cancel</Button>
            <Button
              onClick={() => resetTarget && resetPasswordMutation.mutate({ userId: resetTarget.id, password: newPassword })}
              disabled={newPassword.length < 6 || resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
