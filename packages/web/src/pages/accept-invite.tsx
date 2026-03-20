import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Truck, Mail, Shield, AlertCircle, CheckCircle2 } from "lucide-react";

export default function AcceptInvitePage() {
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const [, navigate] = useLocation();

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const { data: inviteInfo, isLoading, error } = useQuery<any>({
    queryKey: ["/api/invites/validate", token],
    queryFn: async () => {
      const res = await fetch(`/api/invites/validate?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Invalid invite");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/invites/accept", {
        token,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        phone: phone || undefined,
      });
    },
    onSuccess: async () => {
      toast({ title: "Welcome! Your account is ready." });
      await refreshUser();
      navigate("/");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    acceptMutation.mutate();
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Invalid Invite Link</h2>
            <p className="text-sm text-muted-foreground">No token was provided. Please check your invite link or ask your admin for a new one.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Invite Problem</h2>
            <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className="w-14 h-14 rounded-md bg-primary/10 flex items-center justify-center mx-auto">
            <Truck className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-accept-invite-title">Join {inviteInfo?.companyName}</h1>
            <p className="text-sm text-muted-foreground mt-1">You've been invited to join as a team member</p>
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="w-3.5 h-3.5" />
              <span data-testid="text-invite-email">{inviteInfo?.email}</span>
            </div>
            <Badge variant="secondary" data-testid="badge-invite-role">
              <Shield className="w-3 h-3 mr-1" />
              {inviteInfo?.role}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  required
                  data-testid="input-invite-first-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  required
                  data-testid="input-invite-last-name"
                />
              </div>
            </div>

            {inviteInfo?.role === "DRIVER" && (
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  data-testid="input-invite-phone"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                data-testid="input-invite-password"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                minLength={6}
                data-testid="input-invite-confirm-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={acceptMutation.isPending || !password || !confirmPassword || !firstName || !lastName}
              data-testid="button-accept-invite"
            >
              {acceptMutation.isPending ? "Setting up your account..." : "Accept Invite & Join"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Invite expires {inviteInfo?.expiresAt ? new Date(inviteInfo.expiresAt).toLocaleDateString() : "soon"}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
