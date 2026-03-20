import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocation } from "wouter";
import { Building2, Plus, Users, Eye, UserPlus, Copy, CheckCircle2, Power, PowerOff } from "lucide-react";

export default function SuperadminCompanies() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState("");

  const { data: companies, isLoading } = useQuery<any[]>({
    queryKey: ["/api/companies"],
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

  const activateMutation = useMutation({
    mutationFn: async ({ id, activate }: { id: number; activate: boolean }) => {
      return apiRequest("POST", `/api/superadmin/companies/${id}/${activate ? "activate" : "deactivate"}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/stats"] });
      toast({ title: "Company status updated" });
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
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-sa-companies-title">Companies</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all platform companies</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-sa-add-company">
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
                <Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} required placeholder="ABC Trucking" data-testid="input-sa-company-name" />
              </div>
              <div className="space-y-1.5">
                <Label>Address <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={newCompanyAddress} onChange={(e) => setNewCompanyAddress(e.target.value)} placeholder="123 Main St" data-testid="input-sa-company-address" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={newCompanyPhone} onChange={(e) => setNewCompanyPhone(e.target.value)} placeholder="(555) 123-4567" data-testid="input-sa-company-phone" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-sa-save-company">
                {createMutation.isPending ? "Creating..." : "Create Company"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) { setLastInviteLink(""); setInviteEmail(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Admin — {selectedCompanyName}</DialogTitle>
          </DialogHeader>
          {lastInviteLink ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-chart-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Admin invite created! Share this link:</span>
              </div>
              <div className="flex items-center gap-2">
                <Input value={lastInviteLink} readOnly className="text-xs font-mono" data-testid="input-sa-invite-link" />
                <Button size="icon" variant="outline" onClick={() => copyLink(lastInviteLink)} data-testid="button-sa-copy-invite">
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); inviteMutation.mutate(); }} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Admin Email</Label>
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="admin@company.com" data-testid="input-sa-invite-email" />
              </div>
              <Button type="submit" className="w-full" disabled={inviteMutation.isPending || !inviteEmail} data-testid="button-sa-send-invite">
                {inviteMutation.isPending ? "Creating..." : "Send Admin Invite"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

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
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                    <TableHead className="w-56"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(companies ?? []).map((c: any) => (
                    <TableRow key={c.id} data-testid={`row-sa-company-${c.id}`}>
                      <TableCell className="text-muted-foreground text-xs tabular-nums">{c.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <span className="font-medium text-sm" data-testid={`text-sa-company-name-${c.id}`}>{c.name}</span>
                            {c.phone && <span className="text-xs text-muted-foreground ml-2">{c.phone}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.isActive !== false ? "default" : "secondary"} data-testid={`badge-sa-company-status-${c.id}`}>
                          {c.isActive !== false ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="text-[10px]">{c.userCount} users</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "\u2014"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/superadmin/companies/${c.id}`)} data-testid={`button-sa-view-company-${c.id}`}>
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedCompanyId(c.id); setSelectedCompanyName(c.name); setInviteOpen(true); }} data-testid={`button-sa-invite-admin-${c.id}`}>
                            <UserPlus className="w-4 h-4 mr-1" />
                            Invite
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => activateMutation.mutate({ id: c.id, activate: c.isActive === false })}
                            data-testid={`button-sa-toggle-company-${c.id}`}
                          >
                            {c.isActive !== false ? <PowerOff className="w-4 h-4 text-muted-foreground" /> : <Power className="w-4 h-4 text-chart-2" />}
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
    </div>
  );
}
