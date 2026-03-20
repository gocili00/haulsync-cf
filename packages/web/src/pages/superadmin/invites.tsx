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
import { Search, Ban, Mail } from "lucide-react";

export default function SuperadminInvites() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const { data: invites, isLoading } = useQuery<any[]>({
    queryKey: ["/api/superadmin/invites"],
  });

  const filteredInvites = useMemo(() => {
    if (!invites) return [];
    return invites.filter((inv) => {
      if (search && !inv.email.toLowerCase().includes(search.toLowerCase()) && !(inv.companyName || "").toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "ALL" && inv.status !== statusFilter) return false;
      return true;
    });
  }, [invites, search, statusFilter]);

  const revokeMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      return apiRequest("POST", "/api/invites/revoke", { inviteId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/invites"] });
      toast({ title: "Invite revoked" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default", accepted: "secondary", revoked: "destructive", expired: "outline",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-sa-invites-title">Invites</h1>
        <p className="text-sm text-muted-foreground mt-1">All invites across the platform</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-sa-invite-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36" data-testid="select-sa-invite-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
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
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvites.map((inv: any) => (
                    <TableRow key={inv.id} data-testid={`row-sa-global-invite-${inv.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm">{inv.email}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{inv.role}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inv.companyName || "\u2014"}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[inv.status] || "secondary"} className="text-[10px]">{inv.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inv.createdByName || "\u2014"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(inv.expiresAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {inv.status === "active" && (
                          <Button variant="ghost" size="icon" onClick={() => revokeMutation.mutate(inv.id)} data-testid={`button-sa-revoke-global-${inv.id}`}>
                            <Ban className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {filteredInvites.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">No invites found.</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
