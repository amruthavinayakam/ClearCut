"use client";

import type { ClearanceItem } from "@clearcut/contracts";
import { FilePlus2, Paperclip } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { documentClient, type DocumentClient } from "@/lib/project-actions";

export function DocumentSheet({ projectId, item, client = documentClient }: { projectId: string; item: ClearanceItem; client?: DocumentClient }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("license");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const fields = new FormData(event.currentTarget);
    fields.set("file", file);
    fields.set("kind", kind);
    fields.set("perpetual", fields.get("perpetual") ? "true" : "false");
    try {
      await client.uploadDocument(projectId, item.id, fields);
      setOpen(false);
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The document could not be attached.");
      setBusy(false);
    }
  };

  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)} size="sm" variant="outline"><FilePlus2 /> Attach production record</Button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent aria-label="Attach production record" className="w-full overflow-y-auto sm:max-w-[440px]">
          <SheetHeader className="border-b border-border"><SheetTitle>Attach production record</SheetTitle><SheetDescription>Store the file and its recorded scope. ClearCut compares metadata; it does not interpret legal meaning.</SheetDescription></SheetHeader>
          <form className="flex flex-1 flex-col" onSubmit={submit}>
            <div className="space-y-4 p-4">
              <div><Label htmlFor="document-file">Document file</Label><Input accept=".pdf,.doc,.docx,.txt,image/*" className="mt-1.5" id="document-file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /></div>
              <div><Label>Record type</Label><Select onValueChange={(value) => value && setKind(value)} value={kind}><SelectTrigger className="mt-1.5 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="license">Licence</SelectItem><SelectItem value="release">Release</SelectItem><SelectItem value="permit">Permit</SelectItem><SelectItem value="correspondence">Correspondence</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
              <div><Label htmlFor="document-title">Title</Label><Input className="mt-1.5" id="document-title" name="title" placeholder={file?.name ?? "Document title"} /></div>
              <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="document-media">Media</Label><Input className="mt-1.5" id="document-media" name="media" placeholder="streaming, festival" /></div><div><Label htmlFor="document-territories">Territories</Label><Input className="mt-1.5" id="document-territories" name="territories" placeholder="US, CA" /></div></div>
              <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="document-start">Starts</Label><Input className="mt-1.5" id="document-start" name="starts_on" type="date" /></div><div><Label htmlFor="document-end">Ends</Label><Input className="mt-1.5" id="document-end" name="ends_on" type="date" /></div></div>
              <Label className="flex items-center gap-2 font-normal"><Checkbox name="perpetual" /> Perpetual term recorded</Label>
              <div><Label htmlFor="document-use">Covered use</Label><Textarea className="mt-1.5" id="document-use" name="covered_use" placeholder="Describe the use stated in the production record." /></div>
              <div><Label htmlFor="document-actor">Attached by</Label><Input className="mt-1.5" id="document-actor" name="attached_by" placeholder="Coordinator name" /></div>
              <div><Label htmlFor="document-notes">Notes</Label><Textarea className="mt-1.5" id="document-notes" name="notes" placeholder="Internal coordination notes" /></div>
              {error && <p className="text-[11px] text-risk-red">{error}</p>}
            </div>
            <SheetFooter className="border-t border-border"><Button disabled={!file || busy} type="submit"><Paperclip />{busy ? "Attaching record" : "Attach record"}</Button></SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
