import { en } from "@/lib/i18n/en";
import { ButtonLink } from "@/components/ui";

// Static and English: rendered for any locale and also for unauthenticated hits.
export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <p className="text-sm font-medium text-muted">404</p>
      <h1 className="text-xl font-semibold">{en.common.notFound}</h1>
      <p className="max-w-sm text-sm text-muted">{en.common.notFoundBody}</p>
      <ButtonLink href="/app" className="mt-2">{en.common.goHome}</ButtonLink>
    </main>
  );
}
