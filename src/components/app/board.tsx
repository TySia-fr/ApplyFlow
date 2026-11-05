"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

/**
 * The drop target is what's under the pointer, which is what users expect.
 * Rect-based detection alone picks the neighbouring column when a wide card is
 * grabbed near its edge. Keyboard drags have no pointer, so fall back.
 */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return closestCorners(args);
  // Prefer a card (precise insertion point) over the column that contains it.
  const card = hits.find((h) => !String(h.id).startsWith("col:"));
  return card ? [card] : hits;
};
import { moveApplicationAction } from "@/server/actions/applications";
import { CLOSED_STATUSES, STATUSES, type Status } from "@/lib/applications/status";
import type { Dictionary } from "@/lib/i18n";
import { Button, cn } from "@/components/ui";
import { PriorityMark } from "@/components/status";

export type Card = {
  id: string;
  title: string;
  companyName: string;
  status: Status;
  priority: "low" | "medium" | "high";
  location: string | null;
};

/**
 * Optimistic board: the move is applied locally first, then persisted. If
 * the server rejects it, the board snaps back and says so; it never shows a
 * state the database doesn't have for longer than one round-trip.
 */
export function Board({ initial, dict }: { initial: Card[]; dict: Dictionary }) {
  const [cards, setCards] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  // Closed columns are collapsed by default; the choice is remembered per browser.
  const [showClosed, setShowClosed] = useState(false);
  useEffect(() => {
    try {
      // Reading browser storage after mount is the point here; there's no external store to subscribe to.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowClosed(window.localStorage.getItem("board:showClosed") === "1");
    } catch {
      /* storage unavailable: keep the default */
    }
  }, []);
  function toggleClosed() {
    setShowClosed((v) => {
      try {
        window.localStorage.setItem("board:showClosed", v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const byStatus = (s: Status) => cards.filter((c) => c.status === s);
  const active = cards.find((c) => c.id === activeId) ?? null;
  const closedCount = cards.filter((c) => CLOSED_STATUSES.has(c.status)).length;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setError(false);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const id = String(e.active.id);
    const card = cards.find((c) => c.id === id);
    if (!card) return;

    // Dropped on a column → bottom of it. Dropped on a card → before that card.
    const overCard = cards.find((c) => c.id === overId);
    const to: Status = overCard ? overCard.status : (overId.replace("col:", "") as Status);
    const beforeId = overCard && overCard.id !== id ? overCard.id : undefined;
    if (!overCard && card.status === to) return;
    if (overCard?.id === id) return;

    const previous = cards;
    const moved = { ...card, status: to };
    const without = cards.filter((c) => c.id !== id);
    const insertAt = beforeId ? without.findIndex((c) => c.id === beforeId) : -1;
    const next = insertAt >= 0 ? [...without.slice(0, insertAt), moved, ...without.slice(insertAt)] : [...without, moved];
    setCards(next);

    startTransition(async () => {
      const res = await moveApplicationAction({ applicationId: id, status: to, beforeId }).catch(() => ({ ok: false }));
      if (!res.ok) {
        setCards(previous);
        setError(true);
      }
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{dict.applications.boardHint}</p>
        <Button size="sm" variant="ghost" onClick={toggleClosed} aria-pressed={showClosed}>
          {showClosed ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {showClosed ? dict.applications.hideClosed : dict.applications.showClosed} ({closedCount})
        </Button>
      </div>
      {error ? <p role="alert" className="mb-3 text-sm text-danger">{dict.applications.moveFailed}</p> : null}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}
        // Default 20% edge zone scrolls too eagerly on wide boards; 10% feels deliberate.
        autoScroll={{ threshold: { x: 0.1, y: 0.1 } }}
      >
        <div data-wide className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          {STATUSES.map((s) => (
            <Column
              key={s}
              status={s}
              label={dict.status[s]}
              count={byStatus(s).length}
              // Empty and (by default) closed columns shrink to a strip. They stay
              // drop targets, and widths never change mid-drag (no layout jump).
              collapsed={byStatus(s).length === 0 || (CLOSED_STATUSES.has(s) && !showClosed)}
              onExpand={CLOSED_STATUSES.has(s) && byStatus(s).length > 0 ? toggleClosed : undefined}
            >
              {byStatus(s).map((c) => (
                <DraggableCard key={c.id} card={c} dict={dict} dimmed={c.id === activeId} />
              ))}
            </Column>
          ))}
        </div>
        <DragOverlay>{active ? <CardBody card={active} dict={dict} lifted /> : null}</DragOverlay>
      </DndContext>
    </>
  );
}

function Column({
  status,
  label,
  count,
  collapsed,
  onExpand,
  children,
}: {
  status: Status;
  label: string;
  count: number;
  collapsed: boolean;
  onExpand?: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  const base = "flex shrink-0 flex-col rounded-lg border border-border bg-surface-2/60 transition-colors";
  const over = isOver && "border-accent bg-accent-soft/60";
  if (collapsed) {
    const inner = (
      <>
        <span className="text-xs tabular-nums text-muted">{count}</span>
        <span className="text-xs font-medium whitespace-nowrap text-muted [writing-mode:vertical-rl]">{label}</span>
      </>
    );
    return (
      <section ref={setNodeRef} aria-label={`${label} (${count})`} className={cn(base, "min-h-64 w-10 items-center", over)}>
        {onExpand ? (
          <button type="button" onClick={onExpand} className="flex flex-1 flex-col items-center gap-2 py-3 hover:text-fg" title={label}>
            {inner}
          </button>
        ) : (
          <div className="flex flex-1 flex-col items-center gap-2 py-3">{inner}</div>
        )}
      </section>
    );
  }
  return (
    <section ref={setNodeRef} aria-label={`${label} (${count})`} className={cn(base, "min-h-64 w-56 min-w-56 flex-1 md:max-w-80", over)}>
      <h2 className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted">
        <span>{label}</span>
        <span className="tabular-nums">{count}</span>
      </h2>
      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">{children}</div>
    </section>
  );
}

function DraggableCard({ card, dict, dimmed }: { card: Card; dict: Dictionary; dimmed: boolean }) {
  const drag = useDraggable({ id: card.id });
  const drop = useDroppable({ id: card.id });
  return (
    <div
      ref={(n) => {
        drag.setNodeRef(n);
        drop.setNodeRef(n);
      }}
      {...drag.listeners}
      {...drag.attributes}
      className={cn("touch-none rounded-md outline-none", dimmed && "opacity-40", drop.isOver && !dimmed && "border-t-2 border-accent pt-1")}
    >
      <CardBody card={card} dict={dict} />
    </div>
  );
}

function CardBody({ card, dict, lifted }: { card: Card; dict: Dictionary; lifted?: boolean }) {
  return (
    <div className={cn("rounded-md border border-border bg-surface p-2.5 text-sm shadow-xs", lifted && "rotate-1 shadow-lg")}>
      <Link href={`/app/applications/${card.id}`} className="block font-medium leading-snug hover:underline">
        {card.title}
      </Link>
      <div className="mt-0.5 truncate text-xs text-muted">{card.companyName}{card.location ? ` · ${card.location}` : ""}</div>
      <div className="mt-2"><PriorityMark priority={card.priority} dict={dict} /></div>
    </div>
  );
}
