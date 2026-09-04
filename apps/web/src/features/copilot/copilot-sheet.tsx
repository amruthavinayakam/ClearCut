"use client";

import { ArrowUp, Bot, SearchCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { copilotClient, type CopilotClient } from "@/lib/project-actions";

type Message = { role: "user" | "assistant"; text: string };

export function CopilotSheet({ projectId, client = copilotClient }: { projectId: string; client?: CopilotClient }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setQuestion("");
    setBusy(true);
    try {
      const response = await client.ask(projectId, trimmed);
      setMessages((current) => [...current, { role: "assistant", text: response.answer }]);
    } catch (reason) {
      setMessages((current) => [...current, { role: "assistant", text: reason instanceof Error ? reason.message : "The copilot could not answer." }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button aria-label="Ask ClearCut" onClick={() => setOpen(true)} size="sm" variant="outline"><Bot /> Ask ClearCut</Button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent aria-label="Ask ClearCut" className="w-full sm:max-w-[420px]">
          <SheetHeader className="border-b border-border"><SheetTitle>Ask ClearCut</SheetTitle><SheetDescription>Read-only project copilot. It can explain stored evidence and request research, but cannot record a clearance decision.</SheetDescription></SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? <div className="border-y border-border py-5"><SearchCheck className="size-4 text-muted-foreground" /><p className="mt-2 text-xs font-medium">Ask about evidence, gaps, or contact routes.</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">Answers stay grounded in the current production record and cited research.</p></div> : messages.map((message, index) => <div className={message.role === "assistant" ? "border-l border-primary pl-3" : "pl-3 text-muted-foreground"} key={index}><span className="font-mono text-[9px] uppercase">{message.role}</span><p className="mt-1 text-xs leading-5">{message.text}</p></div>)}
          </div>
          <SheetFooter className="border-t border-border"><form className="flex gap-2" onSubmit={send}><div className="min-w-0 flex-1"><Label className="sr-only" htmlFor="copilot-question">Question</Label><Input aria-label="Question" id="copilot-question" onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this production…" value={question} /></div><Button aria-label="Send question" disabled={!question.trim() || busy} size="icon" type="submit"><ArrowUp /></Button></form></SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
