import { useState, useEffect } from "react";
import type { Contact, PullResult, SendGridList, ConfigStatus, SalesforceReport } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, CloudDownload, Send, AlertCircle, UserPlus, CheckCircle2, Loader2, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type SyncStep = "idle" | "fetching" | "analyzing" | "ready" | "uploading" | "complete";

export default function Home() {
  const { toast } = useToast();
  const [step, setStep] = useState<SyncStep>("idle");
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [sfReports, setSfReports] = useState<SalesforceReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("00OJw00000FMqtlMAD");
  const [loadingReports, setLoadingReports] = useState(false);
  const [pulledContacts, setPulledContacts] = useState<{ firstName: string; lastName: string; email: string; company: string }[]>([]);
  const [newContacts, setNewContacts] = useState<Contact[]>([]);
  const [syncLogId, setSyncLogId] = useState<string | null>(null);
  const [sendGridLists, setSendGridLists] = useState<SendGridList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config/status")
      .then((res) => res.json())
      .then((data) => setConfigStatus(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (configStatus?.salesforce) {
      setLoadingReports(true);
      fetch("/api/salesforce/reports")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setSfReports(data);
        })
        .catch(() => {})
        .finally(() => setLoadingReports(false));
    }
  }, [configStatus?.salesforce]);

  useEffect(() => {
    if (configStatus?.sendgrid) {
      fetch("/api/sendgrid/lists")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setSendGridLists(data);
            if (data.length > 0) setSelectedListId(data[0].id);
          }
        })
        .catch(() => {});
    }
  }, [configStatus?.sendgrid]);

  const handleFetchReport = async () => {
    setStep("fetching");
    setProgress(30);
    setError(null);

    try {
      const body: any = {};
      if (selectedReportId && selectedReportId !== "__all__") {
        body.reportId = selectedReportId;
      }

      const res = await fetch("/api/salesforce/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to pull report");
      }

      setProgress(60);
      setStep("analyzing");

      const data: PullResult = await res.json();

      setTimeout(() => {
        setPulledContacts(data.pulledContacts);
        setNewContacts(data.newContactDetails);
        setSyncLogId(data.syncLogId);
        setStep("ready");
        setProgress(100);

        toast({
          title: "Analysis Complete",
          description: `Found ${data.newContacts} new contacts out of ${data.totalPulled} total.`,
        });
      }, 800);
    } catch (err: any) {
      setError(err.message);
      setStep("idle");
      setProgress(0);
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleUploadToSendGrid = async () => {
    if (!selectedListId) {
      toast({ title: "Select a list", description: "Please select a SendGrid marketing list first.", variant: "destructive" });
      return;
    }

    setStep("uploading");
    setProgress(30);
    setError(null);

    try {
      const res = await fetch("/api/sendgrid/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: selectedListId, syncLogId }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to push to SendGrid");
      }

      setProgress(70);

      const data = await res.json();

      setTimeout(() => {
        setStep("complete");
        setProgress(100);
        toast({
          title: "Upload Successful",
          description: `Successfully added ${data.synced} contacts to SendGrid marketing list.`,
        });
      }, 600);
    } catch (err: any) {
      setError(err.message);
      setStep("ready");
      setProgress(100);
      toast({
        title: "Upload Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const reset = () => {
    setStep("idle");
    setPulledContacts([]);
    setNewContacts([]);
    setSyncLogId(null);
    setProgress(0);
    setError(null);
  };

  const sfConfigured = configStatus?.salesforce ?? false;
  const sgConfigured = configStatus?.sendgrid ?? false;

  const selectedReportName = selectedReportId === "__all__"
    ? "All Contacts"
    : sfReports.find((r) => r.id === selectedReportId)?.name || "Selected Report";

  return (
    <div className="min-h-screen bg-neutral-50/50 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">

        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900" data-testid="text-title">Contact Sync</h1>
            <p className="text-neutral-500 mt-1">Salesforce to SendGrid Marketing Campaign Pipeline</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={reset} disabled={step === "idle"} data-testid="button-reset">
              Reset Workflow
            </Button>
          </div>
        </header>

        {/* Connection Status */}
        {configStatus && (!sfConfigured || !sgConfigured) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Configuration Needed</p>
              <ul className="space-y-1">
                {!sfConfigured && <li>Salesforce is not connected. Please connect your Salesforce account.</li>}
                {!sgConfigured && <li>SendGrid API key is not set. Please add your SENDGRID_API_KEY.</li>}
              </ul>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div className="text-sm text-red-800">
              <p className="font-medium">Error</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Workflow Pipeline */}
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative">
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-neutral-100 -z-10 -translate-y-1/2" />

            {/* Step 1: Salesforce */}
            <div className="flex flex-col items-center gap-3 bg-white p-2">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors
                ${step !== "idle" ? "border-blue-600 bg-blue-50 text-blue-600" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
                <CloudDownload className="w-5 h-5" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">1. Pull Report</p>
                <p className="text-xs text-neutral-500">Salesforce API</p>
              </div>

              {/* Report Selector */}
              {sfConfigured && step === "idle" && (
                <div className="w-52">
                  <Select value={selectedReportId} onValueChange={setSelectedReportId} disabled={loadingReports}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-salesforce-report">
                      <FileText className="w-3 h-3 mr-1.5 shrink-0 text-neutral-400" />
                      <SelectValue placeholder={loadingReports ? "Loading reports..." : "Select a report"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      <SelectItem value="__all__">All Contacts (default)</SelectItem>
                      {sfReports.map((report) => (
                        <SelectItem key={report.id} value={report.id}>
                          <span className="truncate">{report.name}</span>
                          <span className="text-neutral-400 ml-1 text-[10px]">({report.folderName})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {step !== "idle" && (
                <div className="text-xs text-neutral-500 bg-neutral-50 px-2 py-1 rounded">
                  {selectedReportName}
                </div>
              )}

              <Button
                onClick={handleFetchReport}
                disabled={step !== "idle" || !sfConfigured}
                className="w-32"
                data-testid="button-fetch-report"
              >
                {step === "fetching" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch Data"}
              </Button>
            </div>

            <ArrowRight className="w-5 h-5 text-neutral-300 hidden md:block" />

            {/* Step 2: Analyze */}
            <div className="flex flex-col items-center gap-3 bg-white p-2">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors
                ${["ready", "uploading", "complete"].includes(step) ? "border-amber-500 bg-amber-50 text-amber-600"
                  : step === "analyzing" ? "border-amber-500 border-dashed bg-amber-50/50 text-amber-500"
                  : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
                <UserPlus className="w-5 h-5" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">2. Filter New</p>
                <p className="text-xs text-neutral-500">Deduplicate</p>
              </div>
              <div className="h-9 flex items-center">
                {step === "analyzing" && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 animate-pulse">Analyzing...</Badge>}
                {["ready", "uploading", "complete"].includes(step) && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{newContacts.length} New Found</Badge>}
              </div>
            </div>

            <ArrowRight className="w-5 h-5 text-neutral-300 hidden md:block" />

            {/* Step 3: SendGrid */}
            <div className="flex flex-col items-center gap-3 bg-white p-2">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors
                ${step === "complete" ? "border-green-600 bg-green-50 text-green-600"
                  : step === "uploading" ? "border-green-600 border-dashed bg-green-50/50 text-green-500"
                  : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
                <Send className="w-5 h-5" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">3. Push to List</p>
                <p className="text-xs text-neutral-500">SendGrid API</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                {sgConfigured && sendGridLists.length > 0 && step === "ready" && (
                  <Select value={selectedListId} onValueChange={setSelectedListId}>
                    <SelectTrigger className="w-44 h-8 text-xs" data-testid="select-sendgrid-list">
                      <SelectValue placeholder="Select list" />
                    </SelectTrigger>
                    <SelectContent>
                      {sendGridLists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name} ({list.contact_count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  onClick={handleUploadToSendGrid}
                  disabled={step !== "ready" || !sgConfigured}
                  className={`w-32 ${step === "complete" ? "bg-green-600 hover:bg-green-700" : ""}`}
                  data-testid="button-upload-sendgrid"
                >
                  {step === "uploading" ? <Loader2 className="w-4 h-4 animate-spin" />
                    : step === "complete" ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Synced</>
                    : "Upload"}
                </Button>
              </div>
            </div>
          </div>

          {(step === "fetching" || step === "uploading") && (
            <div className="mt-8">
              <div className="flex justify-between text-xs text-neutral-500 mb-2">
                <span>{step === "fetching" ? "Connecting to Salesforce..." : "Batch uploading to SendGrid..."}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>

        {/* Data Tables */}
        {step !== "idle" && step !== "fetching" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Raw Report */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg">Salesforce Report</CardTitle>
                    <CardDescription>{selectedReportName}</CardDescription>
                  </div>
                  <Badge variant="secondary" data-testid="badge-total-count">{pulledContacts.length} Total</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-neutral-50/50 hover:bg-neutral-50/50">
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Company</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {step === "analyzing" ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-32 text-center text-neutral-500">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
                            Analyzing contacts...
                          </TableCell>
                        </TableRow>
                      ) : (
                        pulledContacts.map((contact, idx) => {
                          const isNew = newContacts.some(nc => nc.email === contact.email);
                          return (
                            <TableRow key={`sf-${idx}`}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {contact.firstName} {contact.lastName}
                                  {isNew && <Badge className="text-[10px] h-4 px-1 bg-amber-100 text-amber-800 hover:bg-amber-100 shadow-none border-none">NEW</Badge>}
                                </div>
                              </TableCell>
                              <TableCell className="text-neutral-500">{contact.email}</TableCell>
                              <TableCell className="text-neutral-500">{contact.company}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* New Contacts */}
            <Card className={step === "analyzing" ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
              <CardHeader className="pb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg text-amber-700">New Contacts Detected</CardTitle>
                    <CardDescription>Filtered against existing database</CardDescription>
                  </div>
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none shadow-none" data-testid="badge-new-count">
                    {newContacts.length} to Sync
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border border-amber-100 rounded-md bg-amber-50/30 overflow-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-amber-50 hover:bg-amber-50 border-amber-100">
                        <TableHead className="text-amber-900">Name</TableHead>
                        <TableHead className="text-amber-900">Email</TableHead>
                        <TableHead className="text-amber-900">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newContacts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-32 text-center text-amber-700/50">
                            No new contacts found to sync.
                          </TableCell>
                        </TableRow>
                      ) : (
                        newContacts.map((contact) => (
                          <TableRow key={`new-${contact.id}`} className="border-amber-100/50 hover:bg-amber-50/50">
                            <TableCell className="font-medium text-amber-950">{contact.firstName} {contact.lastName}</TableCell>
                            <TableCell className="text-amber-700/80">{contact.email}</TableCell>
                            <TableCell>
                              {step === "complete" ? (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Synced
                                </Badge>
                              ) : step === "uploading" ? (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Syncing
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-white text-amber-700 border-amber-200">
                                  Pending
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
