/**
 * Business OS Phase 6 — signature drawing panel.
 *
 * Canvas-based signature capture widget with mouse + touch support.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

'use client';

import React, { useRef, useState, useCallback } from 'react';
import type { BusinessDocument } from '@/lib/agentic-os/business/documents';

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
    'w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-accent focus:outline-none';
  const labelClass = 'block text-xs text-text-secondary mb-1';

  if (doc.status !== 'sent') {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6">
        <p className="text-sm text-text-secondary text-center">
          {doc.status === 'draft'
            ? 'Send this document to enable signature capture.'
            : doc.status === 'signed'
              ? 'This document has been signed.'
              : `Signature capture is not available for documents in '${doc.status}' status.`}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Signature</h3>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Signer Name *</label>
          <input
            className={inputClass}
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Jane Smith"
            required
          />
        </div>
        <div>
          <label className={labelClass}>Signer Email</label>
          <input
            className={inputClass}
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Draw your signature</label>
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          className="w-full max-w-[400px] h-[120px] rounded-lg border border-border-subtle bg-surface-0 cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        <button
          type="button"
          onClick={clearCanvas}
          className="mt-2 text-xs text-[#64748b] hover:text-white transition-colors"
        >
          Clear signature
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-accent hover:bg-[#3a56d4] text-white px-4 py-2 text-sm font-medium"
      >
        {loading ? 'Capturing...' : 'Capture Signature'}
      </button>
    </form>
  );
}
