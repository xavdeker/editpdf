import { useEffect, useRef, useState } from 'react';
import { pdfjsLib } from '../utils/pdfWorker';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface PageThumbnailsProps {
  pdfData: ArrayBuffer;
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  modifiedPages: Set<number>;
}

export default function PageThumbnails({
  pdfData,
  totalPages,
  currentPage,
  onPageChange,
  modifiedPages,
}: PageThumbnailsProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const [rendered, setRendered] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF doc
  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    const load = async () => {
      try {
        const copy = pdfData.slice(0);
        doc = await pdfjsLib.getDocument({ data: new Uint8Array(copy) }).promise;
        if (!cancelled) setPdfDoc(doc);
        else doc.destroy();
      } catch (err) {
        console.error('Thumbnail PDF load error:', err);
      }
    };
    load();
    return () => { cancelled = true; if (doc) doc.destroy(); setPdfDoc(null); };
  }, [pdfData]);

  // Render thumbnails
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    const renderPage = async (pageIdx: number) => {
      const canvas = canvasRefs.current.get(pageIdx);
      if (!canvas || rendered.has(pageIdx)) return;

      try {
        const page = await pdfDoc.getPage(pageIdx + 1);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 0.3 });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: 0.3 * dpr }) }).promise;
        if (!cancelled) setRendered((prev) => new Set(prev).add(pageIdx));
      } catch {
        // ignore render errors for thumbnails
      }
    };

    // Render all pages
    for (let i = 0; i < totalPages; i++) {
      renderPage(i);
    }

    return () => { cancelled = true; };
  }, [pdfDoc, totalPages, rendered]);

  // Scroll current page into view
  useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-page="${currentPage}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-2 p-2 overflow-y-auto h-full"
    >
      {Array.from({ length: totalPages }, (_, i) => (
        <button
          key={i}
          data-page={i}
          onClick={() => onPageChange(i)}
          className={`relative group rounded-lg overflow-hidden transition-all shrink-0 ${
            currentPage === i
              ? 'ring-2 ring-teal-600 ring-offset-2 shadow-md'
              : 'hover:ring-2 hover:ring-gray-300 hover:ring-offset-1 opacity-70 hover:opacity-100'
          }`}
        >
          <canvas
            ref={(el) => {
              if (el) canvasRefs.current.set(i, el);
              else canvasRefs.current.delete(i);
            }}
            className="w-full bg-white"
          />
          <div className={`absolute bottom-0 inset-x-0 flex items-center justify-center py-0.5 text-[10px] font-medium ${
            currentPage === i ? 'bg-teal-600 text-white' : 'bg-black/50 text-white'
          }`}>
            {i + 1}
          </div>
          {modifiedPages.has(i) && (
            <div className="absolute top-1 right-1 w-2 h-2 bg-teal-600 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
