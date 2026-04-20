import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { tenantQueryKey } from "@/lib/tenantQueryKey";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, Camera, FileText, CheckCircle, X, Info, Loader2, AlertCircle } from "lucide-react";

type JobStatus = "queued" | "running" | "succeeded" | "failed" | "dead_letter" | null;

export default function UploadLoadPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<(string | null)[]>([]);
  const [pickupCity, setPickupCity] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [success, setSuccess] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>(null);
  const [jobResult, setJobResult] = useState<any>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollJob = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/${id}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setJobStatus(data.status);
      if (data.status === "succeeded") {
        setJobResult(data.result);
        if (pollRef.current) clearInterval(pollRef.current);
        queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/loads") });
      } else if (data.status === "failed" || data.status === "dead_letter") {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    if (jobId) {
      pollRef.current = setInterval(() => pollJob(jobId), 2000);
      pollJob(jobId);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [jobId, pollJob]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error("Please select at least one file");
      const formData = new FormData();
      files.forEach(f => formData.append("bol", f));
      if (pickupCity) formData.append("pickupCity", pickupCity);
      if (deliveryCity) formData.append("deliveryCity", deliveryCity);

      const res = await fetch("/api/loads/upload-bol", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/loads") });
      queryClient.invalidateQueries({ queryKey: tenantQueryKey(user, "/api/dashboard/stats") });
      setSuccess(true);
      if (data.jobId) {
        setJobId(data.jobId);
        setJobStatus("queued");
      }
      toast({ title: "BOL uploaded successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const totalFiles = [...files, ...selected].slice(0, 2);
    setFiles(totalFiles);
    setSuccess(false);
    setFileError(null);

    const newPreviews: (string | null)[] = [];
    totalFiles.forEach((f) => {
      if (f.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          newPreviews.push(reader.result as string);
          if (newPreviews.length === totalFiles.length) setPreviews([...newPreviews]);
        };
        reader.readAsDataURL(f);
      } else {
        newPreviews.push(null);
        if (newPreviews.length === totalFiles.length) setPreviews([...newPreviews]);
      }
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setFiles(newFiles);
    setPreviews(newPreviews);
  };

  const handleReset = () => {
    setFiles([]);
    setPreviews([]);
    setPickupCity("");
    setDeliveryCity("");
    setSuccess(false);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleResetAll = () => {
    handleReset();
    setJobId(null);
    setJobStatus(null);
    setJobResult(null);
  };

  if (success) {
    const isProcessing = jobId && (jobStatus === "queued" || jobStatus === "running");
    const isDone = jobStatus === "succeeded";
    const isFailed = jobStatus === "failed" || jobStatus === "dead_letter";

    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-upload-title">Upload Load</h1>
          <p className="text-sm text-muted-foreground mt-1">Quick load submission with BOL</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${isDone ? "bg-green-500/10" : isFailed ? "bg-destructive/10" : "bg-green-500/10"}`}>
              {isDone ? (
                <CheckCircle className="w-8 h-8 text-green-500" />
              ) : isFailed ? (
                <AlertCircle className="w-8 h-8 text-destructive" />
              ) : (
                <CheckCircle className="w-8 h-8 text-green-500" />
              )}
            </div>
            <div>
              <p className="font-semibold text-lg" data-testid="text-upload-success">BOL Uploaded</p>
              {isProcessing && (
                <div className="flex items-center justify-center gap-2 mt-3 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span data-testid="text-processing-status">Processing document...</span>
                </div>
              )}
              {isDone && jobResult && (
                <div className="mt-3 space-y-2 text-left" data-testid="div-ocr-result">
                  <p className="text-sm text-muted-foreground text-center">Document processed successfully</p>
                  {jobResult.pickupAddress && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Pickup</p>
                      <p className="text-sm font-medium" data-testid="text-ocr-pickup">{jobResult.pickupAddress}</p>
                    </div>
                  )}
                  {jobResult.deliveryAddress && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Delivery</p>
                      <p className="text-sm font-medium" data-testid="text-ocr-delivery">{jobResult.deliveryAddress}</p>
                    </div>
                  )}
                  {jobResult.needsManual && (
                    <p className="text-xs text-muted-foreground text-center">Your dispatcher will verify the details.</p>
                  )}
                </div>
              )}
              {isFailed && (
                <p className="text-sm text-destructive mt-2" data-testid="text-processing-failed">
                  Document processing failed. Your dispatcher can still manually review the load.
                </p>
              )}
              {!jobId && (
                <p className="text-sm text-muted-foreground mt-1">Your dispatcher will review and verify the details.</p>
              )}
            </div>
            <Button onClick={handleResetAll} className="w-full" data-testid="button-upload-another">
              <Upload className="w-4 h-4 mr-2" />
              Upload Another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-upload-title">Take a clear BOL photo</h1>
        <p className="text-sm text-muted-foreground mt-1">Quick load submission with BOL</p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6 space-y-5">
          <div className="rounded-md bg-muted/50 p-3 space-y-1.5" data-testid="div-upload-instructions">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Info className="w-4 h-4 text-primary flex-shrink-0" />
              Photo Tips
            </div>
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-6 list-disc">
              <li>Take the full document (don't crop)</li>
              <li>Make SHIPPER and CONSIGNEE sections readable</li>
              <li>If it's dark, enable Flash</li>
              <li>Avoid blur (tap to focus)</li>
              <li>Upload 2 photos if needed (one for SHIPPER, one for CONSIGNEE)</li>
            </ul>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/jpg,image/png"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            data-testid="input-bol-file"
          />

          {files.length > 0 && (
            <div className="space-y-2" data-testid="div-file-list">
              {files.map((f, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid={`div-file-item-${i}`}>
                  {previews[i] ? (
                    <img src={previews[i]!} alt={`BOL ${i + 1}`} className="w-16 h-16 rounded-md object-cover flex-shrink-0" data-testid={`img-bol-preview-${i}`} />
                  ) : (
                    <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" data-testid={`text-file-name-${i}`}>{f.name}</p>
                    <p className="text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeFile(i)} data-testid={`button-remove-file-${i}`}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {files.length < 2 && (
            <div className="space-y-3">
              <Button
                variant="outline"
                className={`w-full ${files.length === 0 ? "h-32" : "h-14"} border-dashed flex flex-col gap-2 ${fileError ? "border-destructive" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-select-file"
              >
                <Upload className={`${files.length === 0 ? "w-8 h-8" : "w-5 h-5"} text-muted-foreground`} />
                <span className="text-sm font-medium">{files.length === 0 ? "Tap to select BOL file" : "Add second photo"}</span>
                <span className="text-xs text-muted-foreground">
                  {files.length === 0 ? "PDF, JPG, or PNG (max 10MB each, up to 2 files)" : "Optional: for CONSIGNEE section"}
                </span>
              </Button>
              {fileError && (
                <p className="text-xs text-destructive flex items-center gap-1" data-testid="text-file-error">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  {fileError}
                </p>
              )}
              {files.length === 0 && (
                <Button
                  variant="outline"
                  className="w-full h-14 flex gap-2"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.setAttribute("capture", "environment");
                      fileInputRef.current.click();
                      fileInputRef.current.removeAttribute("capture");
                    }
                  }}
                  data-testid="button-take-photo"
                >
                  <Camera className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium">Take Photo</span>
                </Button>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Pickup City (optional)</Label>
              <Input
                placeholder="e.g. Dallas, TX"
                value={pickupCity}
                onChange={(e) => setPickupCity(e.target.value)}
                data-testid="input-pickup-city"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Delivery City (optional)</Label>
              <Input
                placeholder="e.g. Houston, TX"
                value={deliveryCity}
                onChange={(e) => setDeliveryCity(e.target.value)}
                data-testid="input-delivery-city"
              />
            </div>
          </div>

          <Button
            className="w-full h-12"
            onClick={() => {
              if (files.length === 0) {
                setFileError("BOL file is required");
                return;
              }
              uploadMutation.mutate();
            }}
            disabled={uploadMutation.isPending}
            data-testid="button-upload-bol"
          >
            {uploadMutation.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Submit Load {files.length > 1 ? `(${files.length} photos)` : ""}
              </span>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
