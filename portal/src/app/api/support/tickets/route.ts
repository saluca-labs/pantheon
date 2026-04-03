/**
 * Support ticket API route.
 * Persists tickets to a JSON file so they survive process restarts.
 * In production this would forward to a ticketing backend or database.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, isAuthError } from "@/lib/server-auth";
import crypto from "crypto";
import fs from "fs";
import path from "path";

interface StoredTicket {
  id: string;
  subject: string;
  description: string;
  severity: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  created_at: string;
  sla_deadline: string;
}

const SLA_HOURS: Record<string, number> = {
  P0: 4,
  P1: 24,
  P2: 72,
  P3: 168,
};

// Persist tickets to a JSON file in the project data directory
const DATA_DIR = path.join(process.cwd(), "data");
const TICKETS_FILE = path.join(DATA_DIR, "support-tickets.json");

function readTickets(): StoredTicket[] {
  try {
    if (fs.existsSync(TICKETS_FILE)) {
      const raw = fs.readFileSync(TICKETS_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // Corrupted file -- start fresh
  }
  return [];
}

function writeTickets(tickets: StoredTicket[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2), "utf-8");
  } catch {
    // If write fails, tickets remain in memory for the current process
  }
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  const tickets = readTickets();
  return NextResponse.json(tickets);
}

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const { subject, description, severity, category } = body;

    if (!subject || !description || !severity || !category) {
      return NextResponse.json(
        { detail: "subject, description, severity, and category are required" },
        { status: 400 },
      );
    }

    const now = new Date();
    const slaHours = SLA_HOURS[severity] ?? 168;
    const slaDeadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000);

    const ticket: StoredTicket = {
      id: `TIR-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      subject,
      description,
      severity,
      category,
      status: "open",
      created_at: now.toISOString(),
      sla_deadline: slaDeadline.toISOString(),
    };

    const tickets = readTickets();
    tickets.unshift(ticket);
    writeTickets(tickets);

    return NextResponse.json(
      { ticket_id: ticket.id, sla_deadline: ticket.sla_deadline },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { detail: "Invalid request body" },
      { status: 400 },
    );
  }
}
