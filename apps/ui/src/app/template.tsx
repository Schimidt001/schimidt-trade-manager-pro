"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // A página raiz "/" faz redirect, não precisa de shell
  if (pathname === "/") {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
