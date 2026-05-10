"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LifeBuoy, AlertTriangle, CheckCircle2, Clock, ChevronDown, MessageCircle } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";

/** Support ticket system -- create, track, and manage support tickets. Uses live API. */

type Severity = "P0" | "P1" | "P2" | "P3";
type Category = "bug" | "security" | "outage" | "question" | "feature";
type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

interface SupportTicket {
  id: string;
  ticket_id?: string;
  subject: string;
  severity: Severity;
  category: Category;
  status: TicketStatus;
  created_at: string;
  sla_deadline: string;
  description?: string;
}

interface SubmitTicketResponse {
  ticket_id: string;
  sla_deadline: string;
}

const SEVERITY_OPTIONS: { value: Severity; label: string; sla: string; warning?: string }[] = [
  {
    value: "P0",
    label: "P0 — Critical",
    sla: "4-hour SLA",
    warning: "Critical — 4-hour SLA. Use for production outages only.",
  },
  { value: "P1", label: "P1 — High", sla: "24-hour SLA" },
  { value: "P2", label: "P2 — Medium", sla: "72-hour SLA" },
  { value: "P3", label: "P3 — Low", sla: "72-hour SLA" },
];

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "bug", label: "Bug Report" },
  { value: "security", label: "Security Issue" },
  { value: "outage", label: "Service Outage" },
  { value: "question", label: "Question / Help" },
  { value: "feature", label: "Feature Request" },
];

const SEVERITY_BADGE: Record<Severity, string> = {
  P0: "bg-red-500/15 border border-red-500/30 text-red-400",
  P1: "bg-orange-500/15 border border-orange-500/30 text-orange-400",
  P2: "bg-yellow-500/15 border border-yellow-500/30 text-yellow-400",
  P3: "bg-of-outline/15 border border-of-outline/30 text-of-on-surface-variant",
};

const STATUS_BADGE: Record<TicketStatus, string> = {
  open: "bg-of-primary/10 border border-of-primary/25 text-of-primary",
  in_progress: "bg-blue-500/10 border border-blue-500/25 text-blue-400",
  resolved: "bg-green-500/10 border border-green-500/25 text-green-400",
  closed: "bg-of-outline/10 border border-of-outline/25 text-of-on-surface-variant",
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Lightweight custom select to match Obsidian Flux tokens
function OFSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-of-surface-container border border-of-outline-variant/25 text-sm text-of-on-surface focus:outline-none focus:border-of-primary/40 hover:border-of-outline-variant/40 transition-colors"
      >
        <span className={selected ? "text-of-on-surface" : "text-of-on-surface-variant/50"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-of-on-surface-variant transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full rounded-lg bg-of-surface-container-high border border-of-outline-variant/20 shadow-xl py-1 overflow-hidden"
          >
            {options.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-of-surface-container-highest ${
                    opt.value === value
                      ? "text-of-primary"
                      : "text-of-on-surface"
                  }`}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SupportPage() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [category, setCategory] = useState<Category | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<SubmitTicketResponse | null>(null);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState<string | null>(null);

  const selectedSeverityOption = SEVERITY_OPTIONS.find((o) => o.value === severity);

  useEffect(() => {
    async function loadTickets() {
      try {
        const raw = await api.get<SupportTicket[]>("/v1/support/tickets");
        // Normalize backend response: ticket_id → id, lowercase severity → uppercase
        const normalized = (raw ?? []).map((t) => ({
          ...t,
          id: t.id || (t as unknown as Record<string, string>).ticket_id || "",
          severity: (t.severity ?? "P2").toUpperCase() as Severity,
          status: ((t.status as string) === "acknowledged" ? "in_progress" : t.status) as TicketStatus,
        }));
        setTickets(normalized);
      } catch (err: unknown) {
        setTicketsError(err instanceof Error ? err.message : "Failed to load tickets");
      } finally {
        setTicketsLoading(false);
      }
    }
    loadTickets();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim() || !severity || !category) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api.post<SubmitTicketResponse>("/v1/support/tickets", {
        subject: subject.trim(),
        description: description.trim(),
        severity,
        category,
        ...(contactEmail.trim() && { contact_email: contactEmail.trim() }),
      });
      setSuccessData(result);
      // Refresh ticket list
      const updatedRaw = await api.get<SupportTicket[]>("/v1/support/tickets");
      const updated = (updatedRaw ?? []).map((t) => ({
        ...t,
        id: t.id || (t as unknown as Record<string, string>).ticket_id || "",
        severity: (t.severity ?? "P2").toUpperCase() as Severity,
        status: ((t.status as string) === "acknowledged" ? "in_progress" : t.status) as TicketStatus,
      }));
      setTickets(updated);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNewTicket() {
    setSuccessData(null);
    setSubject("");
    setDescription("");
    setContactEmail("");
    setSeverity("");
    setCategory("");
  }

  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "in_progress");
  const closedTickets = tickets.filter((t) => t.status === "resolved" || t.status === "closed");

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-of-primary/10 border border-of-primary/20 flex items-center justify-center">
            <LifeBuoy className="w-5 h-5 text-of-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-of-on-surface tracking-tight">Support</h1>
            <p className="text-sm text-of-on-surface-variant mt-0.5">
              Report issues, track tickets, and get help from the Pantheon team.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/support/chat"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-of-primary/10 border border-of-primary/20 text-sm font-semibold text-of-primary hover:bg-of-primary/15 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          Chat with Support
        </Link>
      </div>

      {/* Report Issue Form */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl bg-of-surface-container-low border border-of-outline-variant/15 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-of-outline-variant/15">
          <h2 className="text-base font-bold text-of-on-surface">Report an Issue</h2>
          <p className="text-xs text-of-on-surface-variant mt-0.5">
            Describe your issue and our team will respond within your plan SLA.
          </p>
        </div>

        <div className="px-6 py-6">
          <AnimatePresence mode="wait">
            {successData ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center gap-4 py-8 text-center"
              >
                <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-green-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-of-on-surface">Ticket Submitted</p>
                  <p className="text-sm text-of-on-surface-variant mt-1">
                    Ticket ID:{" "}
                    <span className="font-mono font-semibold text-of-primary">{successData.ticket_id}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-of-surface-container border border-of-outline-variant/20">
                  <Clock className="w-4 h-4 text-of-on-surface-variant shrink-0" />
                  <span className="text-sm text-of-on-surface-variant">
                    SLA deadline:{" "}
                    <span className="font-medium text-of-on-surface">{formatDate(successData.sla_deadline)}</span>
                  </span>
                </div>
                <button
                  onClick={handleNewTicket}
                  className="mt-2 px-4 py-2 rounded-lg bg-of-primary/10 border border-of-primary/20 text-sm font-semibold text-of-primary hover:bg-of-primary/15 transition-colors"
                >
                  Submit Another Ticket
                </button>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleSubmit}
                className="space-y-5"
              >
                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-of-on-surface-variant uppercase tracking-wider">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief summary of the issue"
                    required
                    maxLength={200}
                    className="w-full px-3 py-2.5 rounded-lg bg-of-surface-container border border-of-outline-variant/25 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/50 focus:outline-none focus:border-of-primary/40 transition-colors"
                  />
                </div>

                {/* Contact Email */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-of-on-surface-variant uppercase tracking-wider">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="your@email.com (for ticket updates)"
                    maxLength={200}
                    className="w-full px-3 py-2.5 rounded-lg bg-of-surface-container border border-of-outline-variant/25 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/50 focus:outline-none focus:border-of-primary/40 transition-colors"
                  />
                </div>

                {/* Severity + Category row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-of-on-surface-variant uppercase tracking-wider">
                      Severity
                    </label>
                    <OFSelect
                      value={severity}
                      onChange={setSeverity}
                      options={SEVERITY_OPTIONS}
                      placeholder="Select severity"
                    />
                    <AnimatePresence>
                      {selectedSeverityOption?.warning && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/[0.08] border border-red-500/20 overflow-hidden"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                          <span className="text-xs text-red-400">{selectedSeverityOption.warning}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-of-on-surface-variant uppercase tracking-wider">
                      Category
                    </label>
                    <OFSelect
                      value={category}
                      onChange={setCategory}
                      options={CATEGORY_OPTIONS}
                      placeholder="Select category"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-of-on-surface-variant uppercase tracking-wider">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the issue in detail. Include steps to reproduce, expected vs actual behavior, and any relevant agent IDs or trace IDs."
                    required
                    rows={5}
                    maxLength={5000}
                    className="w-full px-3 py-2.5 rounded-lg bg-of-surface-container border border-of-outline-variant/25 text-sm text-of-on-surface placeholder:text-of-on-surface-variant/50 focus:outline-none focus:border-of-primary/40 transition-colors resize-none"
                  />
                  <p className="text-[11px] text-of-on-surface-variant/60 text-right">
                    {description.length}/5000
                  </p>
                </div>

                {submitError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/[0.08] border border-red-500/20">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-sm text-red-400">{submitError}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-of-on-surface-variant">
                    {severity
                      ? `SLA: ${SEVERITY_OPTIONS.find((o) => o.value === severity)?.sla}`
                      : "Select severity to see SLA"}
                  </p>
                  <button
                    type="submit"
                    disabled={submitting || !subject.trim() || !description.trim() || !severity || !category}
                    className="px-5 py-2.5 rounded-lg bg-of-primary text-of-on-primary text-sm font-bold tracking-wide transition-all duration-200 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Submitting..." : "Submit Ticket"}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* My Tickets */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-2xl bg-of-surface-container-low border border-of-outline-variant/15 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-of-outline-variant/15 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-of-on-surface">My Tickets</h2>
            <p className="text-xs text-of-on-surface-variant mt-0.5">
              Active and recent support tickets for your organization.
            </p>
          </div>
          {!ticketsLoading && (
            <span className="px-2 py-1 rounded-md bg-of-surface-container border border-of-outline-variant/20 text-xs font-semibold text-of-on-surface-variant">
              {openTickets.length} open
            </span>
          )}
        </div>

        {ticketsLoading ? (
          <div className="px-6 py-10 flex items-center justify-center">
            <div className="flex items-center gap-3 text-of-on-surface-variant">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-of-outline-variant/30 border-t-of-primary rounded-full"
              />
              <span className="text-sm">Loading tickets...</span>
            </div>
          </div>
        ) : ticketsError ? (
          <div className="px-6 py-8 flex items-center justify-center">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">{ticketsError}</span>
            </div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="px-6 py-10 flex flex-col items-center gap-2 text-of-on-surface-variant">
            <LifeBuoy className="w-8 h-8 opacity-30" />
            <p className="text-sm">No tickets yet. Submit one above if you need help.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-of-outline-variant/10">
                  <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-of-on-surface-variant">
                    Ticket ID
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-of-on-surface-variant">
                    Subject
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-of-on-surface-variant">
                    Severity
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-of-on-surface-variant">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-of-on-surface-variant">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-of-on-surface-variant">
                    SLA Deadline
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...openTickets, ...closedTickets].map((ticket, i) => (
                  <motion.tr
                    key={ticket.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.04 }}
                    className="border-b border-of-outline-variant/[0.08] hover:bg-of-surface-container/50 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <span className="font-mono text-xs text-of-primary">{ticket.id}</span>
                    </td>
                    <td className="px-4 py-3.5 max-w-[240px]">
                      <span className="text-of-on-surface truncate block" title={ticket.subject}>
                        {ticket.subject}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${SEVERITY_BADGE[ticket.severity]}`}
                      >
                        {ticket.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${STATUS_BADGE[ticket.status]}`}
                      >
                        {STATUS_LABEL[ticket.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-of-on-surface-variant whitespace-nowrap">
                      {formatDate(ticket.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-of-on-surface-variant whitespace-nowrap">
                      {formatDate(ticket.sla_deadline)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </div>
  );
}
