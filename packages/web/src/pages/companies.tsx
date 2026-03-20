import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Users, TrendingUp, Truck, UserPlus, Copy, CheckCircle2, Mail } from "lucide-react";

export default function CompaniesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState("");

  const { data: companies, isLoading } = useQuery<any[]>({
    queryKey: ["/api/companies"],
  });

  const { data: superStats } = useQuery<any>({
    queryKey: ["/api/superadmin/stats"],
  });

  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyAddress, setNewCompanyAddress] = useState("");
  const [newCompanyPhone, setNewCompanyPhone] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/companies", {
        name: newCompanyName,
        address: newCompanyAddress || undefined,
        phone: newCompanyPhone || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/stats"] });
      setCreateOpen(false);
      setNewCompanyName("");
      setNewCompanyAddress("");
      setNewCompanyPhone("");
      toast({ title: "Company created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [lastInviteLink, setLastInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/invites", {
        email: inviteEmail,
        role: "ADMIN",
        companyId: selectedCompanyId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setLastInviteLink(data.inviteLink);
      setInviteEmail("");
      toast({ title: "Admin invite created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-companies-title">Platform Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage companies and platform-wide settings</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-company">
              <Plus className="w-4 h-4 mr-2" />
              Add Company
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Company</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Company Name</Label>
                <Input
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  required
                  placeholder="ABC Trucking"
                  data-testid="input-company-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Address <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  value={newCompanyAddress}
                  onChange={(e) => setNewCompanyAddress(e.target.value)}
                  placeholder="123 Main St, City, State"
                  data-testid="input-company-address"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  value={newCompanyPhone}
                  onChange={(e) => setNewCompanyPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  data-testid="input-company-phone"
                />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-save-company">
                {createMutation.isPending ? "Creating..." : "Create Company"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {superStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums" data-testid="text-total-companies">{superStats.totalCompanies}</p>
                  <p className="text-xs text-muted-foreground">Companies</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums" data-testid="text-total-users">{superStats.totalUsers}</p>
                  <p className="text-xs text-muted-foreground">Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Truck className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums" data-testid="text-total-loads">{superStats.totalLoads}</p>
                  <p className="text-xs text-muted-foreground">Loads</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums" data-testid="text-total-payroll">${Number(superStats.totalPayroll || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Payroll</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) { setLastInviteLink(""); setInviteEmail(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Company Admin &mdash; {selectedCompanyName}</DialogTitle>
          </DialogHeader>
          {lastInviteLink ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-chart-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Admin invite created! Share this link:</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={lastInviteLink}
                  readOnly
                  className="text-xs font-mono"
                  data-testid="input-admin-invite-link"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyLink(lastInviteLink)}
                  data-testid="button-copy-admin-invite-link"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">This link expires in 7 days. The admin will set their password when accepting.</p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); inviteMutation.mutate(); }} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Admin Email</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  placeholder="admin@company.com"
                  data-testid="input-admin-invite-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Input value="Company Admin" readOnly className="text-muted-foreground" />
              </div>
              <Button type="submit" className="w-full" disabled={inviteMutation.isPending || !inviteEmail} data-testid="button-send-admin-invite">
                {inviteMutation.isPending ? "Creating..." : "Send Admin Invite"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <Card>
          <CardContent className="p-5 space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                    <TableHead className="w-36"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(companies ?? []).map((c: any) => (
                    <TableRow key={c.id} data-testid={`row-company-${c.id}`}>
                      <TableCell className="text-muted-foreground text-xs tabular-nums">{c.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <span className="font-medium text-sm" data-testid={`text-company-name-${c.id}`}>{c.name}</span>
                            {c.phone && <span className="text-xs text-muted-foreground ml-2">{c.phone}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="text-[10px]">{c.userCount} users</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "\u2014"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setSelectedCompanyId(c.id); setSelectedCompanyName(c.name); setInviteOpen(true); }}
                          data-testid={`button-invite-admin-${c.id}`}
                        >
                          <UserPlus className="w-4 h-4 mr-1" />
                          Invite Admin
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
