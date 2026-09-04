"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Command, FileSearch, FolderOpen, HelpCircle, Plus, Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Productions", icon: FolderOpen },
  { href: "/projects/new", label: "New scan", icon: Plus },
];

export function ProductShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [commandsOpen, setCommandsOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandsOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[216px] border-r border-border bg-sidebar lg:flex lg:flex-col">
        <Link className="flex h-14 items-center gap-2 border-b border-border px-4" href="/">
          <span aria-hidden="true" className="size-2 bg-primary" />
          <span className="text-sm font-medium tracking-[-0.02em]">ClearCut</span>
        </Link>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 p-2">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                  active && "bg-sidebar-accent text-foreground",
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="size-3.5" strokeWidth={1.7} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-2">
          <Button className="w-full justify-start text-muted-foreground" onClick={() => setCommandsOpen(true)} variant="ghost">
            <Command className="size-3.5" />
            Commands
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">⌘K</span>
          </Button>
          <div className="mt-2 border-t border-border px-2 pt-3">
            <p className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground">HUMAN REVIEW REQUIRED</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Research support, not legal advice.</p>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
        <Link className="flex items-center gap-2 text-sm font-medium" href="/">
          <span aria-hidden="true" className="size-2 bg-primary" />
          ClearCut
        </Link>
        <div className="flex items-center gap-1">
          <Link aria-label="Open productions" className={buttonVariants({ size: "icon-sm", variant: "ghost" })} href="/"><FolderOpen /></Link>
          <Link aria-label="Start new scan" className={buttonVariants({ size: "icon-sm" })} href="/projects/new"><Plus /></Link>
        </div>
      </header>

      <div className="lg:pl-[216px]">{children}</div>

      <CommandDialog onOpenChange={setCommandsOpen} open={commandsOpen}>
        <CommandInput placeholder="Search commands…" />
        <CommandList>
          <CommandEmpty>No command found.</CommandEmpty>
          <CommandGroup heading="Navigate">
            <CommandItem onSelect={() => { setCommandsOpen(false); router.push("/"); }}><FolderOpen /> Productions <CommandShortcut>G P</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => { setCommandsOpen(false); router.push("/projects/new"); }}><FileSearch /> New clearance scan <CommandShortcut>G N</CommandShortcut></CommandItem>
          </CommandGroup>
          <CommandGroup heading="Workspace">
            <CommandItem disabled><Settings /> Settings</CommandItem>
            <CommandItem disabled><HelpCircle /> Clearance methodology</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
