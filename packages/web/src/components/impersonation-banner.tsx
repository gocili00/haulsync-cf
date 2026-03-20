import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Eye, X } from "lucide-react";

export function ImpersonationBanner() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/superadmin/stop-impersonation");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Impersonation ended" });
      navigate("/superadmin/dashboard");
      window.location.reload();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!user?.isImpersonating) return null;

  return (
    <div className="bg-destructive text-destructive-foreground px-4 py-1.5 flex items-center justify-center gap-3 text-sm sticky top-0 z-[100]" data-testid="banner-impersonation">
      <Eye className="w-4 h-4 flex-shrink-0" />
      <span className="font-medium">
        Impersonating {user.firstName} {user.lastName} ({user.role})
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 ml-2 bg-transparent border-destructive-foreground/30 text-destructive-foreground no-default-hover-elevate"
        onClick={() => stopMutation.mutate()}
        disabled={stopMutation.isPending}
        data-testid="button-stop-impersonation"
      >
        <X className="w-3 h-3 mr-1" />
        Stop
      </Button>
    </div>
  );
}
