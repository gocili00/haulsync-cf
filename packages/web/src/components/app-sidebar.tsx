import { useLocation, Link } from "wouter";
const logoImg = "/logo.png";
import { useAuth } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  Truck,
  DollarSign,
  Wallet,
  LogOut,
  Shield,
  Upload,
  Building2,
  UsersRound,
  Crown,
  TrendingUp,
  BarChart3,
  Activity,
} from "lucide-react";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const roleLabels: Record<string, string> = {
    DRIVER: "Driver",
    DISPATCHER: "Dispatcher",
    ADMIN: "Admin",
    SUPERADMIN: "Super Admin",
  };

  const navItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["DRIVER", "DISPATCHER", "ADMIN", "SUPERADMIN"] },
    { title: "Upload Load", url: "/upload-load", icon: Upload, roles: ["DRIVER"] },
    { title: "Drivers", url: "/drivers", icon: Users, roles: ["DISPATCHER", "ADMIN", "SUPERADMIN"] },
    { title: "Loads", url: "/loads", icon: Truck, roles: ["DRIVER", "DISPATCHER", "ADMIN", "SUPERADMIN"] },
    { title: "Pay Items", url: "/pay-items", icon: DollarSign, roles: ["DRIVER", "DISPATCHER", "ADMIN", "SUPERADMIN"] },
    { title: "Payroll", url: "/payroll", icon: Wallet, roles: ["DRIVER", "DISPATCHER", "ADMIN", "SUPERADMIN"] },
  ];

  const adminItems = [
    { title: "My Performance", url: "/my-performance", icon: Activity, roles: ["DISPATCHER"] },
    { title: "Team", url: "/team", icon: UsersRound, roles: ["ADMIN", "SUPERADMIN"] },
    { title: "Profitability", url: "/profitability", icon: TrendingUp, roles: ["ADMIN", "SUPERADMIN"] },
    { title: "Truck Profitability", url: "/truck-profitability", icon: BarChart3, roles: ["ADMIN", "SUPERADMIN"] },
    { title: "Admin Settings", url: "/admin", icon: Shield, roles: ["ADMIN", "SUPERADMIN"] },
    { title: "Companies", url: "/companies", icon: Building2, roles: ["SUPERADMIN"] },
  ];

  const visibleNav = navItems.filter((item) => item.roles.includes(user?.role || "DRIVER"));
  const visibleAdmin = adminItems.filter((item) => item.roles.includes(user?.role || "DRIVER"));

  const initials = `${(user?.firstName || "")[0] || ""}${(user?.lastName || "")[0] || ""}`.toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="HaulSync" className="flex-shrink-0 w-9 h-9 rounded-md" />
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">HaulSync</p>
            <p className="text-[10px] text-muted-foreground">
              {(user as any)?.companyName || "Trucking Management"}
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url || (item.url !== "/" && location.startsWith(item.url))}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {user?.role === "SUPERADMIN" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href="/superadmin/dashboard" data-testid="link-platform-admin">
                        <Crown className="w-4 h-4" />
                        <span>Platform Admin</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="flex items-center gap-3 p-2 rounded-md">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <Badge variant="outline" className="text-[9px] mt-0.5">{roleLabels[user?.role || "DRIVER"]}</Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
