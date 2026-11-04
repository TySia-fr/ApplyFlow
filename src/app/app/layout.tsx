import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, ShellSkeleton } from "@/components/app/shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The session is read inside <AppShell>, behind this boundary, so the static
 * skeleton is prerendered and the authenticated UI streams in.
 */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
