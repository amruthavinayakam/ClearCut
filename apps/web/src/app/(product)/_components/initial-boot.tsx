"use client";

import { useEffect, useState } from "react";

import { BootScreen, ready, type BootResource } from "./boot-screen";

export function InitialBoot({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = [200, 400, 600, 820].map((delay, index) => setTimeout(() => setStep(index + 1), delay));
    return () => timers.forEach(clearTimeout);
  }, []);
  if (step >= 4) return children;
  const state = (threshold: number): BootResource<null> => step >= threshold ? ready(null) : { status: "loading" };
  return <BootScreen config={state(1)} projects={state(2)} workspace={state(3)} />;
}
