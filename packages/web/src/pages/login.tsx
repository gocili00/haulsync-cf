import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
const logoImg = new URL("../assets/HaulSync1.png", import.meta.url).href;

type View = "login" | "forgot";

export default function LoginPage() {
  const { login, forgotPassword } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<View>("login");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const getSafeRedirect = (role: string) => {
    switch (role) {
      case "SUPERADMIN": return "/superadmin/dashboard";
      case "ADMIN": return "/";
      case "DISPATCHER": return "/";
      case "DRIVER": return "/loads";
      default: return "/";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(form.email, form.password, remember);
      toast({ title: "Welcome back", description: "Logged in successfully" });
      setLocation(getSafeRedirect(res?.role));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(forgotEmail);
      setForgotSent(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <img src={logoImg} alt="HaulSync" className="w-14 h-14 rounded-md mb-2 inline-block" />
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-app-title">HaulSync</h1>
          <p className="text-sm text-muted-foreground">
            Trucking payroll and load management
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold text-center">
              {view === "forgot" ? "Reset password" : "Sign in"}
            </h2>
          </CardHeader>
          <CardContent>
            {/* ── Forgot password view ── */}
            {view === "forgot" && (
              <>
                {forgotSent ? (
                  <div className="text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      If that email exists, we sent a reset link. Check your inbox.
                    </p>
                    <Button variant="outline" className="w-full" onClick={() => { setView("login"); setForgotSent(false); setForgotEmail(""); }}>
                      Back to sign in
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Enter your email and we'll send you a password reset link.
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="forgot-email">Email</Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="driver@company.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Sending..." : "Send reset link"}
                    </Button>
                    <button
                      type="button"
                      className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setView("login")}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to sign in
                    </button>
                  </form>
                )}
              </>
            )}

            {/* ── Login view ── */}
            {view === "login" && (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      data-testid="input-email"
                      type="email"
                      placeholder="driver@company.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setView("forgot")}
                        data-testid="button-forgot-password"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        data-testid="input-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Min 6 characters"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        required
                        minLength={6}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="remember"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                      data-testid="checkbox-remember"
                    />
                    <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">Remember me</Label>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading} data-testid="button-submit-login">
                    {loading ? "Please wait..." : "Sign in"}
                  </Button>
                </form>
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  No account? Contact your company admin for an invite link.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}