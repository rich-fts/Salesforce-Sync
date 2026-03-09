import { useState, useEffect, useRef } from "react";
import type { Contact, PullResult, SendGridList, ConfigStatus, SalesforceReport, MailchimpAudience } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, CloudDownload, Send, AlertCircle, UserPlus, CheckCircle2, Loader2, FileText, Mail, Search, ChevronDown, X, Plus } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type SyncStep = "idle" | "fetching" | "analyzing" | "ready" | "uploading" | "complete";

type ContactToSync = { firstName: string; lastName: string; email: string; company: string };

type DataSource = "salesforce" | "mailchimp";

export default function Home() {
  const { toast } = useToast();
  const [step, setStep] = useState<SyncStep>("idle");
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>("salesforce");
  const [fetchedSource, setFetchedSource] = useState<DataSource | null>(null);
  const [fetchedSourceName, setFetchedSourceName] = useState<string>("");
  const [sfReports, setSfReports] = useState<SalesforceReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("00OJw00000FMqtlMAD");
  const [loadingReports, setLoadingReports] = useState(false);
  const [mcAudiences, setMcAudiences] = useState<MailchimpAudience[]>([]);
  const [selectedAudienceId, setSelectedAudienceId] = useState<string>("");
  const [loadingAudiences, setLoadingAudiences] = useState(false);
  const [audienceSearch, setAudienceSearch] = useState("");
  const [audienceDropdownOpen, setAudienceDropdownOpen] = useState(false);
  const audienceDropdownRef = useRef<HTMLDivElement>(null);
  const [pulledContacts, setPulledContacts] = useState<ContactToSync[]>([]);
  const [contactsToSync, setContactsToSync] = useState<ContactToSync[]>([]);
  const [alreadyInSendGrid, setAlreadyInSendGrid] = useState(0);
  const [syncLogId, setSyncLogId] = useState<string | null>(null);
  const [sendGridLists, setSendGridLists] = useState<SendGridList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("115297bb-7915-4671-bdcf-2d4037d6802a");
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
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
    if (configStatus?.mailchimp) {
      setLoadingAudiences(true);
      fetch("/api/mailchimp/audiences")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setMcAudiences(data);
            if (!selectedAudienceId && data.length > 0) setSelectedAudienceId(data[0].id);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingAudiences(false));
    }
  }, [configStatus?.mailchimp]);

  useEffect(() => {
    if (configStatus?.sendgrid) {
      fetch("/api/sendgrid/lists")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setSendGridLists(data);
            if (!selectedListId && data.length > 0) setSelectedListId(data[0].id);
          }
        })
        .catch(() => {});
    }
  }, [configStatus?.sendgrid]);

  useEffect(() => {
    if ((configStatus?.salesforce || configStatus?.mailchimp) && configStatus?.sendgrid && step === "idle") {
      fetch("/api/contacts/pending")
        .then((res) => res.json())
        .then((data) => {
          if (data.unsynced > 0) {
            setContactsToSync(data.contacts);
            setAlreadyInSendGrid(data.synced);
            setPulledContacts(data.contacts);
            if (data.destinationListId) {
              setSelectedListId(data.destinationListId);
            }
            setStep("ready");
            setProgress(100);
            toast({
              title: "Pending Contacts Found",
              description: `${data.unsynced} contacts from a previous fetch are ready to push to SendGrid.`,
            });
          }
        })
        .catch(() => {});
    }
  }, [configStatus?.salesforce, configStatus?.sendgrid]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (audienceDropdownRef.current && !audienceDropdownRef.current.contains(e.target as Node)) {
        setAudienceDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredAudiences = mcAudiences.filter((a) =>
    a.name.toLowerCase().includes(audienceSearch.toLowerCase())
  );

  const handleFetchReport = async () => {
    setStep("fetching");
    setProgress(30);
    setError(null);

    const currentSource = dataSource;
    const currentSourceName = dataSource === "mailchimp" ? selectedAudienceName : selectedReportName;
    setFetchedSource(currentSource);
    setFetchedSourceName(currentSourceName);

    try {
      let url: string;
      let body: any = {};

      if (currentSource === "mailchimp") {
        url = "/api/mailchimp/pull";
        body.audienceId = selectedAudienceId;
        if (selectedListId) body.listId = selectedListId;
      } else {
        url = "/api/salesforce/pull";
        if (selectedReportId && selectedReportId !== "__all__") {
          body.reportId = selectedReportId;
        }
        if (selectedListId) body.listId = selectedListId;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to pull contacts");
      }

      setProgress(60);
      setStep("analyzing");

      const data: PullResult = await res.json();
      const sourceName = dataSource === "mailchimp" ? "Mailchimp" : "Salesforce";

      setTimeout(() => {
        setPulledContacts(data.pulledContacts);
        setContactsToSync(data.contactsToSyncDetails || []);
        setAlreadyInSendGrid(data.alreadyInSendGrid || 0);
        setSyncLogId(data.syncLogId);
        setStep("ready");
        setProgress(100);

        toast({
          title: "Analysis Complete",
          description: `${data.totalPulled} pulled from ${sourceName}. ${data.alreadyInSendGrid} already in SendGrid. ${data.contactsToSync} to push.`,
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
        setAlreadyInSendGrid(alreadyInSendGrid + contactsToSync.length);
        setContactsToSync([]);
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

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    setCreatingList(true);
    try {
      const res = await fetch("/api/sendgrid/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName.trim() }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to create list");
      }
      const newList = await res.json();
      setSendGridLists((prev) => [...prev, newList].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedListId(newList.id);
      setShowCreateList(false);
      setNewListName("");
      toast({
        title: "List Created",
        description: `"${newList.name}" has been created on SendGrid.`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreatingList(false);
    }
  };

  const handleRepush = async () => {
    try {
      const resetRes = await fetch("/api/contacts/reset-sync", { method: "POST" });
      if (!resetRes.ok) throw new Error("Failed to reset sync flags");
      const resetData = await resetRes.json();

      const pendingRes = await fetch("/api/contacts/pending");
      if (!pendingRes.ok) throw new Error("Failed to fetch pending contacts");
      const pendingData = await pendingRes.json();

      setContactsToSync(pendingData.contacts);
      setAlreadyInSendGrid(pendingData.synced);
      setPulledContacts(pendingData.contacts);
      setStep("ready");
      setProgress(100);
      toast({
        title: "Ready to Re-push",
        description: `${resetData.reset} contacts reset and ready to push again.`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const reset = () => {
    setStep("idle");
    setPulledContacts([]);
    setContactsToSync([]);
    setAlreadyInSendGrid(0);
    setSyncLogId(null);
    setProgress(0);
    setError(null);
    setFetchedSource(null);
    setFetchedSourceName("");
  };

  const sfConfigured = configStatus?.salesforce ?? false;
  const sgConfigured = configStatus?.sendgrid ?? false;
  const mcConfigured = configStatus?.mailchimp ?? false;
  const sourceConfigured = dataSource === "mailchimp" ? mcConfigured : sfConfigured;

  const selectedReportName = selectedReportId === "__all__"
    ? "All Contacts"
    : sfReports.find((r) => r.id === selectedReportId)?.name || "Selected Report";

  const selectedAudienceName = mcAudiences.find((a) => a.id === selectedAudienceId)?.name || "Selected Audience";

  const selectedSourceName = dataSource === "mailchimp" ? selectedAudienceName : selectedReportName;

  const selectedListName = sendGridLists.find((l) => l.id === selectedListId)?.name || "Selected List";

  return (
    <div className="min-h-screen bg-neutral-50/50 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">

        <header>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900" data-testid="text-title">Contact Sync</h1>
          <p className="text-neutral-500 mt-1">Sync contacts to SendGrid Marketing Campaign Lists</p>
        </header>

        {configStatus && (!sfConfigured && !mcConfigured || !sgConfigured) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Configuration Needed</p>
              <ul className="space-y-1">
                {!sfConfigured && !mcConfigured && <li>No data source connected. Please connect Salesforce or add your MAILCHIMP_API_KEY.</li>}
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

        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative">
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-neutral-100 -z-10 -translate-y-1/2" />

            <div className="flex flex-col items-center gap-3 bg-white p-2">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors
                ${step !== "idle" ? "border-blue-600 bg-blue-50 text-blue-600" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
                <CloudDownload className="w-5 h-5" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">1. Configure & Pull</p>
                <p className="text-xs text-neutral-500">Source → Destination</p>
              </div>

              {(step === "idle" || ((step === "complete" || step === "ready") && contactsToSync.length === 0)) && (sfConfigured || mcConfigured) && (
                <div className="w-52">
                  <Select value={dataSource} onValueChange={(v) => setDataSource(v as DataSource)}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-data-source">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {sfConfigured && <SelectItem value="salesforce"><span className="flex items-center gap-1.5"><FileText className="w-3 h-3" /> Salesforce</span></SelectItem>}
                      {mcConfigured && <SelectItem value="mailchimp"><span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> Mailchimp</span></SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {dataSource === "salesforce" && sfConfigured && (step === "idle" || ((step === "complete" || step === "ready") && contactsToSync.length === 0)) && (
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

              {dataSource === "mailchimp" && mcConfigured && (step === "idle" || ((step === "complete" || step === "ready") && contactsToSync.length === 0)) && (
                <div className="w-52 relative" ref={audienceDropdownRef}>
                  <button
                    type="button"
                    onClick={() => { if (!loadingAudiences) setAudienceDropdownOpen(!audienceDropdownOpen); }}
                    className="flex items-center w-full h-8 px-3 text-xs border rounded-md bg-white hover:bg-neutral-50 transition-colors disabled:opacity-50"
                    disabled={loadingAudiences}
                    data-testid="select-mailchimp-audience"
                  >
                    <Mail className="w-3 h-3 mr-1.5 shrink-0 text-neutral-400" />
                    <span className="truncate flex-1 text-left">
                      {loadingAudiences ? "Loading audiences..." : selectedAudienceId ? (mcAudiences.find(a => a.id === selectedAudienceId)?.name || "Select audience") : "Select audience"}
                    </span>
                    <ChevronDown className="w-3 h-3 ml-1 shrink-0 text-neutral-400" />
                  </button>
                  {audienceDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-64 bg-white border rounded-lg shadow-lg left-1/2 -translate-x-1/2">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                          <input
                            type="text"
                            value={audienceSearch}
                            onChange={(e) => setAudienceSearch(e.target.value)}
                            placeholder="Search audiences..."
                            className="w-full h-7 pl-7 pr-7 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                            data-testid="input-audience-search"
                          />
                          {audienceSearch && (
                            <button
                              type="button"
                              onClick={() => setAudienceSearch("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1">
                        {filteredAudiences.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-neutral-400">No audiences found</div>
                        ) : (
                          filteredAudiences.map((audience) => (
                            <button
                              key={audience.id}
                              type="button"
                              onClick={() => {
                                setSelectedAudienceId(audience.id);
                                setAudienceDropdownOpen(false);
                                setAudienceSearch("");
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs rounded-md hover:bg-blue-50 transition-colors flex justify-between items-center gap-2
                                ${selectedAudienceId === audience.id ? "bg-blue-50 text-blue-700 font-medium" : "text-neutral-700"}`}
                              data-testid={`option-audience-${audience.id}`}
                            >
                              <span className="truncate">{audience.name}</span>
                              <span className="shrink-0 text-neutral-400 text-[10px]">{audience.member_count}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step !== "idle" && !((step === "complete" || step === "ready") && contactsToSync.length === 0) && (
                <div className="text-xs text-neutral-500 bg-neutral-50 px-2 py-1 rounded">
                  {fetchedSourceName || selectedSourceName}
                </div>
              )}

              {sgConfigured && (step === "idle" || ((step === "complete" || step === "ready") && contactsToSync.length === 0)) && (
                <div className="w-52">
                  <div className="text-[10px] text-neutral-400 mb-1 text-center">Destination SendGrid List</div>
                  {!showCreateList ? (
                    <div className="flex flex-col gap-1.5">
                      <Select value={selectedListId} onValueChange={setSelectedListId}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-sendgrid-list">
                          <Send className="w-3 h-3 mr-1.5 shrink-0 text-neutral-400" />
                          <SelectValue placeholder="Select list" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {sendGridLists.map((list) => (
                            <SelectItem key={list.id} value={list.id}>
                              {list.name} ({list.contact_count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        onClick={() => setShowCreateList(true)}
                        className="flex items-center justify-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 transition-colors"
                        data-testid="button-show-create-list"
                      >
                        <Plus className="w-3 h-3" /> Create new list
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <input
                        type="text"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreateList(); if (e.key === "Escape") { setShowCreateList(false); setNewListName(""); } }}
                        placeholder="New list name..."
                        className="w-full h-8 px-3 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                        disabled={creatingList}
                        data-testid="input-new-list-name"
                      />
                      <div className="flex gap-1">
                        <Button
                          onClick={handleCreateList}
                          disabled={!newListName.trim() || creatingList}
                          className="flex-1 h-7 text-[11px]"
                          data-testid="button-create-list"
                        >
                          {creatingList ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create"}
                        </Button>
                        <Button
                          onClick={() => { setShowCreateList(false); setNewListName(""); }}
                          variant="outline"
                          className="h-7 text-[11px] px-2"
                          disabled={creatingList}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {step !== "idle" && !((step === "complete" || step === "ready") && contactsToSync.length === 0) && (
                <div className="text-[10px] text-neutral-400 text-center">
                  → {selectedListName}
                </div>
              )}

              <Button
                onClick={handleFetchReport}
                disabled={!(step === "idle" || (step === "complete" && contactsToSync.length === 0) || (step === "ready" && contactsToSync.length === 0)) || !sourceConfigured || (dataSource === "mailchimp" && (!selectedAudienceId || loadingAudiences)) || !selectedListId}
                className="w-32"
                data-testid="button-fetch-report"
              >
                {step === "fetching" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch Data"}
              </Button>
              {step !== "idle" && step !== "fetching" && (
                <Button
                  onClick={reset}
                  variant="outline"
                  className="w-32 text-xs"
                  data-testid="button-start-over"
                >
                  Start Over
                </Button>
              )}
            </div>

            <ArrowRight className="w-5 h-5 text-neutral-300 hidden md:block" />

            <div className="flex flex-col items-center gap-3 bg-white p-2">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors
                ${["ready", "uploading", "complete"].includes(step) ? "border-amber-500 bg-amber-50 text-amber-600"
                  : step === "analyzing" ? "border-amber-500 border-dashed bg-amber-50/50 text-amber-500"
                  : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
                <UserPlus className="w-5 h-5" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">2. Compare</p>
                <p className="text-xs text-neutral-500">vs. SendGrid List</p>
              </div>
              <div className="h-9 flex items-center">
                {step === "analyzing" && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 animate-pulse">Comparing...</Badge>}
                {["ready", "uploading", "complete"].includes(step) && (
                  <div className="flex flex-col items-center gap-1">
                    {step === "complete" && contactsToSync.length === 0 ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">All Synced</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{contactsToSync.length} to Push</Badge>
                    )}
                    {alreadyInSendGrid > 0 && (
                      <span className="text-[10px] text-neutral-400">{alreadyInSendGrid} already in list</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <ArrowRight className="w-5 h-5 text-neutral-300 hidden md:block" />

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
                {step !== "idle" && (
                  <div className="text-xs text-neutral-500 bg-neutral-50 px-2 py-1 rounded max-w-[11rem] truncate">
                    {selectedListName}
                  </div>
                )}
                <Button
                  onClick={handleUploadToSendGrid}
                  disabled={step !== "ready" || !sgConfigured || contactsToSync.length === 0}
                  className={`w-32 ${step === "complete" ? "bg-green-600 hover:bg-green-700" : ""}`}
                  data-testid="button-upload-sendgrid"
                >
                  {step === "uploading" ? <Loader2 className="w-4 h-4 animate-spin" />
                    : step === "complete" ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Synced</>
                    : "Upload"}
                </Button>
                {step === "complete" && (
                  <Button
                    onClick={handleRepush}
                    variant="outline"
                    className="w-32 text-xs"
                    data-testid="button-repush"
                  >
                    Re-push All
                  </Button>
                )}
              </div>
            </div>
          </div>

          {(step === "fetching" || step === "uploading") && (
            <div className="mt-8">
              <div className="flex justify-between text-xs text-neutral-500 mb-2">
                <span>{step === "fetching" ? `Pulling from ${(fetchedSource || dataSource) === "mailchimp" ? "Mailchimp" : "Salesforce"} and checking SendGrid list...` : `Batch uploading to ${selectedListName}...`}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>

        {step !== "idle" && step !== "fetching" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <Card>
              <CardHeader className="pb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg">{(fetchedSource || dataSource) === "mailchimp" ? "Mailchimp Audience" : "Salesforce Report"}</CardTitle>
                    <CardDescription>{fetchedSourceName || selectedSourceName}</CardDescription>
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
                            Pulling contacts...
                          </TableCell>
                        </TableRow>
                      ) : (
                        pulledContacts.map((contact, idx) => {
                          const needsSync = contactsToSync.some(c => c.email === contact.email);
                          return (
                            <TableRow key={`sf-${idx}`}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {contact.firstName} {contact.lastName}
                                  {needsSync && <Badge className="text-[10px] h-4 px-1 bg-amber-100 text-amber-800 hover:bg-amber-100 shadow-none border-none">NEW</Badge>}
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

            <Card className={step === "analyzing" ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
              <CardHeader className="pb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg text-amber-700">Contacts to Push</CardTitle>
                    <CardDescription>Not yet in "{selectedListName}"</CardDescription>
                  </div>
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none shadow-none" data-testid="badge-new-count">
                    {contactsToSync.length} to Sync
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
                      {contactsToSync.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-32 text-center text-amber-700/50">
                            All contacts are already in the SendGrid list.
                          </TableCell>
                        </TableRow>
                      ) : (
                        contactsToSync.map((contact, idx) => (
                          <TableRow key={`sync-${idx}`} className="border-amber-100/50 hover:bg-amber-50/50">
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
