# `_shared/pdf/` — Agentic OS PDF primitive

This directory holds the OS-agnostic PDF rendering primitive used by every
Agentic OS vertical. The primitive is a thin wrapper over
[`@react-pdf/renderer`](https://react-pdf.org/) (MIT, container-friendly,
no native deps) plus a small library of layout components.

## What lives here

| File | Purpose |
| --- | --- |
| `render.ts` | Single server-side entry point: `renderPdfToBuffer(element)`. |
| `primitives.tsx` | Re-exports `Document`, `Page`, `View`, `Text`, `Image`, `StyleSheet`, `Font` plus `PdfHeader`, `PdfFooter`, `PdfMetadataBlock`, `PdfTable`, `PdfPageStyles`. |

Per-OS templates live under `lib/agentic-os/<os-slug>/pdf/<template-name>.tsx`
and import from here.

## Adding a new PDF template

1. Create `lib/agentic-os/<os-slug>/pdf/<template-name>.tsx`. Export a
   typed React.FC that returns a `<Document>` composed from the
   primitives:

   ```tsx
   import { Document, Page, View, Text, PdfHeader, PdfFooter, PdfPageStyles } from '../../_shared/pdf/primitives';

   export function CallSheetPdf({ project, day }: Props) {
     return (
       <Document>
         <Page size="LETTER" style={PdfPageStyles.page}>
           <PdfHeader title="Call Sheet" subtitle={`Day ${day.dayNumber}`} projectName={project.name} />
           {/* ...body... */}
           <PdfFooter projectName={project.name} />
         </Page>
       </Document>
     );
   }
   ```

2. Create a Route Handler in
   `app/api/tiresias/agentic-os/<os-slug>/.../exports/<name>.pdf/route.ts`:

   ```ts
   export const runtime = 'nodejs';
   export const dynamic = 'force-dynamic';

   import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
   import { CallSheetPdf } from '@/lib/agentic-os/<os-slug>/pdf/call-sheet';

   export async function GET(request: NextRequest, { params }: Props) {
     // …auth + load data…
     const buffer = await renderPdfToBuffer(<CallSheetPdf project={…} day={…} />);
     return new Response(buffer, {
       headers: {
         'Content-Type': 'application/pdf',
         'Content-Disposition': `attachment; filename="call-sheet-day-${day.dayNumber}.pdf"`,
       },
     });
   }
   ```

3. Call `recordAudit({ action: '<os>.<entity>.export_pdf', … })`.

## Runtime

`@react-pdf/renderer` requires the Node runtime. Always set
`export const runtime = 'nodejs'` on PDF route handlers so they are not
statically optimised onto the Edge runtime.

## Fonts

The primitive defaults to Helvetica (built in). Custom fonts can be
registered globally via `Font.register({ family, src })` re-exported from
`./primitives`. Phase 6 ships with the default font only.

## Images

`<Image src="https://..."/>` works server-side — `@react-pdf/renderer`
fetches the URL during render. Per the MCP storage transfer workstream
(`docs/architecture/mcp-storage-transfer.md`) we store URLs only; no
binary upload pathway is provided by this primitive.
