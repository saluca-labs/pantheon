/**
 * Business OS Phase 6 — signature drawing panel.
 *
 * Canvas-based signature capture widget with mouse + touch support.
 *
 * Wave D (UI Depth Wave) polish: the gating not-`sent` state now uses the
 * shared `EmptyState` primitive ("doors, not apologies"), the error panel maps
 * to the `danger` status token, the canvas gets a clearer dashed-border draw
 * affordance, and legacy raw-text + raw-hex literals are migrated onto the
 * visual-language tokens. Same capture flow, same route, same payload —
 * presentation only.
 *
 * Carve-out: the Canvas 2D `strokeStyle` literal below stays as raw hex; it's
 * a JS API call (not a Tailwind class) and cannot resolve a CSS var without a
 * `getComputedStyle` lookup, which would be a logic change.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

'use client';

import React, { useId, useRef, useState, useCallback } from 'react';
import { FileSignature, Eraser } from 'lucide-react';
import type { BusinessDocument } from '@/lib/agentic-os/business/documents';
import { EmptyState } from '@/components/agentic-os/_shared/views';

interface Props {
  document: BusinessDocument;
  onSignatureCaptured?: () => void;
}

export default function SignaturePanel({
  document: doc,
  onSignatureCaptured,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;
  const canvasId = fid('signature-canvas');

  const getCanvasPos = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    [],
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      setIsDrawing(true);
      let clientX: number, clientY: number;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const pos = getCanvasPos(clientX, clientY);
      lastPos.current = pos;

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      }
    },
    [getCanvasPos],
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();

      let clientX: number, clientY: number;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const pos = getCanvasPos(clientX, clientY);
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ffffff';
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      }
      setHasSignature(true);
    },
    [isDrawing, getCanvasPos],
  );

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    lastPos.current = null;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.beginPath();
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignature(false);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!signerName.trim()) {
        setError('Please enter the signer name.');
        return;
      }
      if (!hasSignature) {
        setError('Please draw a signature.');
        return;
      }

      setLoading(true);
      setError('');

      const canvas = canvasRef.current;
      const signatureDataUrl = canvas?.toDataURL('image/png') ?? '';

      try {
        const res = await fetch(
          `/api/tiresias/agentic-os/business/documents/${doc.id}/signatures`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signer_name: signerName.trim(),
              signer_email: signerEmail.trim() || null,
              signature_image_url: signatureDataUrl,
            }),
          },
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(err.error || 'Failed to capture signature');
          return;
        }

        onSignatureCaptured?.();
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    },
    [doc.id, signerName, signerEmail, hasSignature, onSignatureCaptured],
  );

  const inputClass =
    'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none transition';
  const labelClass = 'block text-xs text-text-secondary mb-1';

  if (doc.status !== 'sent') {
    return (
      <EmptyState
        icon={<FileSignature className="h-6 w-6" />}
        title={
          doc.status === 'signed'
            ? 'This document has been signed'
            : doc.status === 'draft'
              ? 'Signature capture is locked'
              : 'Signature capture unavailable'
        }
        description={
          doc.status === 'draft'
            ? 'Send this document to enable signature capture.'
            : doc.status === 'signed'
              ? 'A signature is already on file for this document.'
              : `Signatures can only be captured on sent documents — this one is '${doc.status}'.`
        }
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Signature</h3>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor={fid('signer-name')} className={labelClass}>Signer Name *</label>
          <input
            id={fid('signer-name')}
            className={inputClass}
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Jane Smith"
            required
          />
        </div>
        <div>
          <label htmlFor={fid('signer-email')} className={labelClass}>Signer Email</label>
          <input
            id={fid('signer-email')}
            className={inputClass}
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor={canvasId} className={labelClass}>Draw your signature</label>
        <div className="max-w-[400px] rounded-lg border border-dashed border-border-strong bg-surface-0 p-1 transition focus-within:border-accent">
          <canvas
            id={canvasId}
            ref={canvasRef}
            width={400}
            height={120}
            aria-label="Signature drawing area"
            className="h-[120px] w-full cursor-crosshair rounded touch-none"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-2xs text-text-tertiary">
            Sign with your mouse or finger inside the box.
          </p>
          <button
            type="button"
            onClick={clearCanvas}
            disabled={!hasSignature}
            className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary disabled:opacity-40 transition"
          >
            <Eraser className="h-3 w-3" />
            Clear
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium transition"
      >
        <FileSignature className="h-4 w-4" />
        {loading ? 'Capturing...' : 'Capture Signature'}
      </button>
    </form>
  );
}
