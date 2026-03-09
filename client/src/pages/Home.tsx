import { useState } from "react";
import { salesforceReport, existingContacts, type Contact } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, CloudDownload, Send, Settings, UserPlus, CheckCircle2, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type SyncStep = "idle" | "fetching" | "analyzing" | "ready" | "uploading" | "complete";

export default function Home() {
  const { toast } = useToast();
  const [step, setStep] = useState<SyncStep>("idle");
  const [fetchedContacts, setFetchedContacts] = useState<Contact[]>([]);
  const [newContacts, setNewContacts] = useState<Contact[]>([]);
  const [progress, setProgress] = useState(0);

  const handleFetchReport = () => {
    setStep("fetching");
    setProgress(20);
    
    // Simulate API delay
    setTimeout(() => {
      setFetchedContacts(salesforceReport);
      setStep("analyzing");
      setProgress(50);
      
      // Simulate analysis delay
      setTimeout(() => {
        // Filter contacts whose email doesn't exist in existingContacts
        const existingEmails = new Set(existingContacts.map(c => c.email));
        const newOnes = salesforceReport.filter(c => !existingEmails.has(c.email));
        
        setNewContacts(newOnes);
        setStep("ready");
        setProgress(100);
        
        toast({
          title: "Analysis Complete",
          description: `Found ${newOnes.length} new contacts out of ${salesforceReport.length} total.`,
        });
      }, 1500);
    }, 1500);
  };

  const handleUploadToSendGrid = () => {
    setStep("uploading");
    setProgress(30);
    
    // Simulate batch upload delay
    let currentProgress = 30;
    const interval = setInterval(() => {
      currentProgress += 15;
      if (currentProgress > 95) {
        clearInterval(interval);
        setTimeout(() => {
          setStep("complete");
          setProgress(100);
          toast({
            title: "Upload Successful",
            description: `Successfully added ${newContacts.length} contacts to SendGrid marketing list.`,
          });
        }, 500);
      } else {
        setProgress(currentProgress);
      }
    }, 400);
  };

  const reset = () => {
    setStep("idle");
    setFetchedContacts([]);
    setNewContacts([]);
    setProgress(0);
  };

  return (
    <div className="min-h-screen bg-neutral-50/50 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Contact Sync</h1>
            <p className="text-neutral-500 mt-1">Salesforce to SendGrid Marketing Campaign Pipeline</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={reset} disabled={step === "idle"}>
              Reset Workflow
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="w-4 h-4 text-neutral-500" />
            </Button>
          </div>
        </header>

        {/* Workflow Pipeline Visualization */}
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-neutral-100 -z-10 -translate-y-1/2" />
            
            {/* Step 1: Salesforce */}
            <div className="flex flex-col items-center gap-3 bg-white p-2">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors
                ${step !== "idle" ? "border-blue-600 bg-blue-50 text-blue-600" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
                <CloudDownload className="w-5 h-5" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">1. Pull Report</p>
                <p className="text-xs text-neutral-500">Salesforce DB</p>
              </div>
              <Button 
                onClick={handleFetchReport} 
                disabled={step !== "idle"}
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
              <Button 
                onClick={handleUploadToSendGrid} 
                disabled={step !== "ready"}
                className={`w-32 ${step === "complete" ? "bg-green-600 hover:bg-green-700" : ""}`}
                data-testid="button-upload-sendgrid"
              >
                {step === "uploading" ? <Loader2 className="w-4 h-4 animate-spin" /> 
                  : step === "complete" ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Synced</> 
                  : "Upload"}
              </Button>
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
        {step !== "idle" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Raw Report */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg">Raw Salesforce Report</CardTitle>
                    <CardDescription>All contacts pulled from the latest report</CardDescription>
                  </div>
                  <Badge variant="secondary">{fetchedContacts.length} Total</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-neutral-50/50 hover:bg-neutral-50/50">
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Company</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {step === "fetching" ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-32 text-center text-neutral-500">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-400" />
                            Downloading report...
                          </TableCell>
                        </TableRow>
                      ) : (
                        fetchedContacts.map((contact) => {
                          const isNew = newContacts.some(nc => nc.id === contact.id);
                          return (
                            <TableRow key={contact.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {contact.firstName} {contact.lastName}
                                  {isNew && step !== "analyzing" && <Badge className="text-[10px] h-4 px-1 bg-amber-100 text-amber-800 hover:bg-amber-100 shadow-none border-none">NEW</Badge>}
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

            {/* Filtered Results */}
            <Card className={step === "analyzing" ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
              <CardHeader className="pb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg text-amber-700">New Contacts Detected</CardTitle>
                    <CardDescription>Filtered against existing database</CardDescription>
                  </div>
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none shadow-none">{newContacts.length} to Sync</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border border-amber-100 rounded-md bg-amber-50/30 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-amber-50 hover:bg-amber-50 border-amber-100">
                        <TableHead className="text-amber-900">Name</TableHead>
                        <TableHead className="text-amber-900">Email</TableHead>
                        <TableHead className="text-amber-900">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {step === "fetching" || step === "analyzing" ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-32 text-center text-amber-700/50">
                            Awaiting analysis...
                          </TableCell>
                        </TableRow>
                      ) : newContacts.length === 0 ? (
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
