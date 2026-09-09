"use client";

import { ArrowUp, Bot, SearchCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { copilotClient, type CopilotClient } from "@/lib/project-actions";

type Message = {
  role: "user" | "assistant";
  text: string;
  citations?: string[];
  streaming?: boolean;
};

/**
 * Markdown for a narrow chat column. The element styling lives here rather than
 * in a prose class so the copilot matches the workspace's compact type scale.
 */
function AnswerBody({ text }: { text: string }) {
  return (
    <div className="mt-1 text-xs leading-5 [&_a]:underline [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px] [&_em]:italic [&_h1]:mt-3 [&_h1]:text-xs [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:text-xs [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-xs [&_h3]:font-semibold [&_li]:mt-0.5 [&_ol]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mt-1.5 [&_p:first-child]:mt-0 [&_strong]:font-semibold [&_ul]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-4">
      <Markdown
        components={{
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer noopener" target="_blank">{children}</a>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

export function CopilotSheet({ projectId, client = copilotClient }: { projectId: string; client?: CopilotClient }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest text in view as it streams in. Guarded because jsdom, and
  // some older engines, do not implement scrollIntoView.
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "end" }); }, [messages]);

  const replaceLast = (update: (message: Message) => Message) =>
    setMessages((current) => current.map((message, index) =>
      index === current.length - 1 ? update(message) : message));

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setQuestion("");
    setBusy(true);
    setMessages((current) => [
      ...current,
      { role: "user", text: trimmed },
      { role: "assistant", text: "", streaming: true },
    ]);

    try {
      for await (const chunk of client.askStream(projectId, trimmed)) {
        if (chunk.type === "delta") {
          replaceLast((message) => ({ ...message, text: message.text + chunk.text }));
        } else if (chunk.type === "done") {
          replaceLast((message) => ({ ...message, citations: chunk.citations, streaming: false }));
        } else {
          replaceLast((message) => ({ ...message, text: chunk.message, streaming: false }));
        }
      }
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "The copilot could not answer.";
      replaceLast((message) => ({ ...message, text: message.text || text, streaming: false }));
    } finally {
      replaceLast((message) => ({ ...message, streaming: false }));
      setBusy(false);
    }
  };

  return (
    <>
      <Button aria-label="Ask ClearCut" onClick={() => setOpen(true)} size="sm" variant="outline"><Bot /> Ask ClearCut</Button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent aria-label="Ask ClearCut" className="w-full sm:max-w-[420px]">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Ask ClearCut</SheetTitle>
            <SheetDescription>Read-only project copilot. It can explain stored evidence and request research, but cannot record a clearance decision.</SheetDescription>
          </SheetHeader>
          <div aria-busy={busy} aria-live="polite" className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="border-y border-border py-5">
                <SearchCheck className="size-4 text-muted-foreground" />
                <p className="mt-2 text-xs font-medium">Ask about evidence, gaps, or contact routes.</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Answers stay grounded in the current production record and cited research.</p>
              </div>
            ) : messages.map((message, index) => (
              <div className={message.role === "assistant" ? "border-l border-primary pl-3" : "pl-3 text-muted-foreground"} key={index}>
                <span className="font-mono text-[9px] uppercase">{message.role}</span>
                {message.role === "assistant"
                  ? (
                    <>
                      <AnswerBody text={message.text} />
                      {message.streaming && message.text === "" ? (
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">Reading the production record…</p>
                      ) : null}
                      {message.citations?.length ? (
                        <ul className="mt-2 space-y-0.5 border-t border-border pt-2">
                          {message.citations.map((url) => (
                            <li className="truncate text-[10px] leading-4" key={url}>
                              <a className="text-muted-foreground underline" href={url} rel="noreferrer noopener" target="_blank">{url}</a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )
                  : <p className="mt-1 text-xs leading-5">{message.text}</p>}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <SheetFooter className="border-t border-border">
            <form className="flex gap-2" onSubmit={send}>
              <div className="min-w-0 flex-1">
                <Label className="sr-only" htmlFor="copilot-question">Question</Label>
                <Input aria-label="Question" id="copilot-question" onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this production…" value={question} />
              </div>
              <Button aria-label="Send question" disabled={!question.trim() || busy} size="icon" type="submit"><ArrowUp /></Button>
            </form>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
