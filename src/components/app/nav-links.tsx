"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare, FileText, KanbanSquare, LayoutDashboard, List, Radar, Settings } from "lucide-react";
import { cn } from "@/components/ui";

type Labels = Record<"dashboard" | "discover" | "applications" | "board" | "interviews" | "followUps" | "documents" | "settings", string>;

const ITEMS = [
  { href: "/app", key: "dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/discover", key: "discover", icon: Radar, exact: false },
  { href: "/app/applications", key: "applications", icon: List, exact: false, not: "/app/applications/board" },
  { href: "/app/applications/board", key: "board", icon: KanbanSquare, exact: true },
  { href: "/app/interviews", key: "interviews", icon: CalendarDays, exact: false },
  { href: "/app/follow-ups", key: "followUps", icon: CheckSquare, exact: false },
  { href: "/app/documents", key: "documents", icon: FileText, exact: false },
  { href: "/app/settings", key: "settings", icon: Settings, exact: false },
] as const;

export function NavLinks({ labels }: { labels: Labels }) {
  const path = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {ITEMS.map((item) => {
        const active = item.exact
          ? path === item.href
          : path.startsWith(item.href) && !("not" in item && path.startsWith(item.not));
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {labels[item.key]}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
