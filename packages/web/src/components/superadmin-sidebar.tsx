import { useLocation, Link } from "wouter";
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
  Building2,
  Users,
  Mail,
  ScrollText,
  ArrowLeft,
  LogOut,
  Shield,
} from "lucide-react";

export function SuperadminSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { title: "Dashboard", url: "/superadmin/dashboard", icon: LayoutDashboard },
    { title: "Companies", url: "/superadmin/companies", icon: Building2 },
    { title: "Users", url: "/superadmin/users", icon: Users },
    { title: "Invites", url: "/superadmin/invites", icon: Mail },
    { title: "Audit Logs", url: "/superadmin/audit", icon: ScrollText },
  ];

  const initials = `${(user?.firstName || "")[0] || ""}${(user?.lastName || "")[0] || ""}`.toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-md bg-destructive/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">Platform Admin</p>
            <p className="text-[10px] text-muted-foreground">Superadmin Portal</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url || (item.url !== "/superadmin/dashboard" && location.startsWith(item.url))}>
                    <Link href={item.url} data-testid={`link-sa-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/" data-testid="link-sa-back-to-app">
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to App</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-3 p-2 rounded-md">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-destructive/10 text-destructive text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <Badge variant="outline" className="text-[9px] mt-0.5">Super Admin</Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout()}
            data-testid="button-sa-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
