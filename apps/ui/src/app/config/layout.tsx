"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const CONFIG_TABS = [
  { href: "/config/playbook", label: "Playbook" },
  { href: "/config/brains", label: "Brains" },
  { href: "/config/exposure", label: "Exposure" },
  { href: "/config/news", label: "News" },
  { href: "/config/safety", label: "Safety" },
];

export default function ConfigLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Gerenciamento de configuração com diff, motivo obrigatório e apply mode.
        </p>
      </div>

      {/* Sub-navigation */}
      <div className="flex border-b border-border">
        {CONFIG_TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2",
              pathname === tab.href
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
