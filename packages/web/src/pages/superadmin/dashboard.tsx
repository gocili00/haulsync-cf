import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2,
  Users,
  Truck,
  TrendingUp,
  FileText,
  Plus,
  Search,
  UserPlus,
  Activity,
  DatabaseBackup,
} from "lucide-react";

export default function SuperadminDashboard() {
  const [, navigate] = useLocation();
  const [searchEmail, setSearchEmail] = useState("");

  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/superadmin/stats"],
  });

  const { data: allUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { toast } = useToast();

  const dbExportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/superadmin/db-export");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "DB Snapshot Exported", description: data.message });
    },
    onError: (err: any) => {
      toast({ title: "Export Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSearchUser = () => {
    if (searchEmail.trim()) {
      navigate(`/superadmin/users?search=${encodeURIComponent(searchEmail.trim())}`);
    }
  };

  const widgets = [
    { label: "Total Companies", value: stats?.totalCompanies ?? 0, icon: Building2, color: "text-primary", bg: "bg-primary/10" },
    { label: "Active Companies", value: stats?.activeCompanies ?? 0, icon: Activity, color: "text-chart-2", bg: "bg-chart-2/10" },
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users, color: "text-chart-3", bg: "bg-chart-3/10" },
    { label: "Total Loads", value: stats?.totalLoads ?? 0, icon: Truck, color: "text-chart-4", bg: "bg-chart-4/10" },
    { label: "Loads (30 days)", value: stats?.recentLoads ?? 0, icon: TrendingUp, color: "text-chart-5", bg: "bg-chart-5/10" },
    { label: "Statements", value: stats?.statementsGenerated ?? 0, icon: FileText, color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-sa-dashboard-title">Platform Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Global statistics and quick actions</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {widgets.map((w) => (
            <Card key={w.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-md ${w.bg} flex items-center justify-center flex-shrink-0`}>
                    <w.icon className={`w-4 h-4 ${w.color}`} />
                  </div>
                  <div>
                    <p className="text-xl font-bold tabular-nums" data-testid={`text-sa-stat-${w.label.toLowerCase().replace(/\s+/g, "-")}`}>{w.value}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{w.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-semibold">Quick Actions</p>
            <div className="space-y-2">
              <Button className="w-full justify-start" variant="outline" onClick={() => navigate("/superadmin/companies")} data-testid="button-sa-create-company">
                <Plus className="w-4 h-4 mr-2" />
                Create Company
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => navigate("/superadmin/companies")} data-testid="button-sa-invite-admin">
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Company Admin
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => dbExportMutation.mutate()}
                disabled={dbExportMutation.isPending}
                data-testid="button-sa-db-sync"
              >
                <DatabaseBackup className="w-4 h-4 mr-2" />
                {dbExportMutation.isPending ? "Exporting..." : "Sync DB to Production"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-semibold">Search User by Email</p>
            <div className="flex gap-2">
              <Input
                placeholder="Enter email address..."
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchUser()}
                data-testid="input-sa-search-email"
              />
              <Button onClick={handleSearchUser} data-testid="button-sa-search-user">
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {stats?.totalPayroll !== undefined && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm text-muted-foreground">Total Platform Payroll</p>
                <p className="text-3xl font-bold tabular-nums" data-testid="text-sa-total-payroll">
                  ${Number(stats.totalPayroll || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
