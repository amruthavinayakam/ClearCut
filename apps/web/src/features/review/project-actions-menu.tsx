"use client";

import { Archive, ArchiveRestore, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ProjectAdminClient = {
  rename(projectId: string, title: string): Promise<void>;
  setArchived(projectId: string, archived: boolean): Promise<void>;
  remove(projectId: string): Promise<void>;
};

export const browserProjectAdminClient: ProjectAdminClient = {
  async rename(projectId, title) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) throw new Error("The production could not be renamed.");
  },
  async setArchived(projectId, archived) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    if (!response.ok) throw new Error("The production could not be archived.");
  },
  async remove(projectId) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("The production could not be deleted.");
  },
};

/**
 * Production-level actions.
 *
 * Confirmation is scaled to consequence: renaming is reversible and applies
 * straight from its own dialog, archiving is reversible and only needs a
 * click, and deletion is not reversible so it asks the coordinator to type the
 * title before it will proceed.
 */
export function ProjectActionsMenu({
  projectId,
  title,
  archived,
  client = browserProjectAdminClient,
}: {
  projectId: string;
  title: string;
  archived: boolean;
  client?: ProjectAdminClient;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, after: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      after();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Production actions"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => { setDraftTitle(title); setRenaming(true); }}>
            <PencilLine /> Rename production
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void run(() => client.setArchived(projectId, !archived), () => router.refresh())}
          >
            {archived ? <><ArchiveRestore /> Restore to library</> : <><Archive /> Archive production</>}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => { setConfirmTitle(""); setDeleting(true); }}
            variant="destructive"
          >
            <Trash2 /> Delete production
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setRenaming} open={renaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename production</DialogTitle>
            <DialogDescription>The new title appears across the workspace and on packets exported from now on. Earlier exports keep the title they were made under, and the change is recorded in the project history.</DialogDescription>
          </DialogHeader>
          <div className="px-6">
            <Label className="text-xs" htmlFor="production-title">Title</Label>
            <Input
              autoFocus
              className="mt-1.5"
              id="production-title"
              maxLength={200}
              onChange={(event) => setDraftTitle(event.target.value)}
              value={draftTitle}
            />
            {error && <p className="mt-2 text-xs text-risk-red">{error}</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => setRenaming(false)} variant="outline">Cancel</Button>
            <Button
              disabled={busy || !draftTitle.trim() || draftTitle.trim() === title}
              onClick={() => void run(
                () => client.rename(projectId, draftTitle.trim()),
                () => { setRenaming(false); router.refresh(); },
              )}
            >
              {busy ? "Saving" : "Save title"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setDeleting} open={deleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><Trash2 /></AlertDialogMedia>
            <AlertDialogTitle>Delete this production?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the clearance cases, the recorded human decisions, the production documents, and the uploaded screenplay and cut. It cannot be undone. Archive it instead if you only want it out of the active library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            <Label className="text-xs" htmlFor="confirm-title">Type <span className="font-medium text-foreground">{title}</span> to confirm</Label>
            <Input
              autoComplete="off"
              className="mt-1.5"
              id="confirm-title"
              onChange={(event) => setConfirmTitle(event.target.value)}
              value={confirmTitle}
            />
            {error && <p className="mt-2 text-xs text-risk-red">{error}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              // Deletion is irreversible, so the title has to be typed. A
              // single click is the right cost for archiving, not for this.
              disabled={busy || confirmTitle.trim() !== title.trim()}
              onClick={(event) => {
                event.preventDefault();
                void run(() => client.remove(projectId), () => { setDeleting(false); router.push("/"); });
              }}
            >
              {busy ? "Deleting" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
