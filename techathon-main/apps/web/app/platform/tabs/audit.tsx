"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { platform } from "@/lib/api";
import type { ConfigAuditRecord } from "@/lib/types";
import { Pager, usePager } from "../ui";

export function AuditTab() {
  const [rows, setRows] = useState<ConfigAuditRecord[]>([]);
  useEffect(() => { void platform.listAudit().then((d) => setRows(d.audit)); }, []);
  const { pageItems, ...pager } = usePager(rows, 5);

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">No config changes recorded yet.</td>
              </tr>
            ) : (
              pageItems.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.actor_name}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{r.action}</Badge></td>
                  <td className="px-3 py-2 font-mono text-xs">{r.target}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
    </div>
  );
}
