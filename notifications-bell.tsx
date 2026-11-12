"use client";

import { Bell, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/format";
import type { NotificationDto } from "@/lib/types";

export function NotificationsBell({
  items,
  unread,
  onReadAll,
  onOpenPayment,
  nowMs,
}: {
  items: NotificationDto[];
  unread: number;
  onReadAll: () => void;
  onOpenPayment: (id: string) => void;
  nowMs: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Give the user a beat to see what's new, then clear the unread badge.
  useEffect(() => {
    if (!open || unread === 0) return;
    const t = setTimeout(onReadAll, 900);
    return () => clearTimeout(t);
  }, [open, unread, onReadAll]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-10 place-items-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
        aria-label="Notifications"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-pop-in absolute top-12 right-0 z-50 w-[380px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-900/5">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="font-display text-sm font-semibold text-gray-900">
              Notifications
            </p>
            <p className="text-xs text-gray-400">Auto-refunds appear here</p>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">
              No notifications yet. If a payment stalls and refunds itself, it
              will show up here.
            </p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      onOpenPayment(n.paymentId);
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50"
                  >
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-accent/8 text-accent">
                      <Undo2 className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] leading-snug text-gray-800">
                        {n.message}
                      </span>
                      <span className="mt-1 block text-xs text-gray-400">
                        {timeAgo(n.createdAt, nowMs)}
                      </span>
                    </span>
                    {!n.read && (
                      <span className="mt-2 ml-auto size-2 shrink-0 rounded-full bg-accent" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
