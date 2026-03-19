import { useEffect, useRef, useState, useCallback } from 'react';
import { pdfjsLib } from '../utils/pdfWorker';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageContent, TextBlock, Tool, HighlightAnnotation, PenStroke } from '../types/pdf.types';
import { isBlockModified } from '../utils/pdfUtils';

interface PdfViewerProps {
  pdfData: ArrayBuffer;
  currentPage: number;
  pageContent: PageContent | undefined;
  focusedBlockId: string | null;
  onBlockFocus: (blockId: string) => void;
  onBlockBlur: () => void;
  onTextChange: (blockId: string, newText: string) => void;
  onBlockResize: (blockId: string, newWidth: number, newHeight: number) => void;
  onEraseBlock: (blockId: string) => void;
  onAddTextBlock: (pageIndex: number, x: number, y: number) => string;
  activeTool: Tool;
  scale?: number;
  highlights: HighlightAnnotation[];
  onHighlightAdd: (h: HighlightAnnotation) => void;
  penStrokes: PenStroke[];
  onPenStrokeAdd: (s: PenStroke) => void;
  highlightColor: string;
  penColor: string;
}

type Edge = 'top' | 'bottom' | 'left' | 'right';

/** Build inline CSS style from TextBlock font/color properties */
function blockStyle(block: TextBlock, fontSize: number): React.CSSProperties {
  // fontFamily is now pre-mapped (e.g. "Roboto, sans-serif") — use directly
  const fontFamily = block.fontFamily || 'Helvetica, sans-serif';

  const { r, g, b } = block.color;
  const color = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

  return {
    fontSize: `${fontSize}px`,
    fontFamily,
    fontWeight: block.isBold ? 'bold' : 'normal',
    fontStyle: block.isItalic ? 'italic' : 'normal',
    color,
  };
}

export default function PdfViewer({
  pdfData,
  currentPage,
  pageContent,
  focusedBlockId,
  onBlockFocus,
  onBlockBlur,
  onTextChange,
  onBlockResize,
  onEraseBlock,
  onAddTextBlock,
  activeTool,
  scale = 1.2,
  highlights,
  onHighlightAdd,
  penStrokes,
  onPenStrokeAdd,
  highlightColor,
  penColor,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLDivElement>(null);

  // Store clean canvas snapshot (before white rects) for fast re-blanchiment
  const cleanCanvasRef = useRef<ImageData | null>(null);
  const [renderGen, setRenderGen] = useState(0); // increments after each PDF render

  // Live resize preview
  const [dragEdge, setDragEdge] = useState<Edge | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const dragRef = useRef<{ startPos: number; blockId: string; edge: Edge } | null>(null);

  // Drawing state (highlight + pen)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [penPoints, setPenPoints] = useState<{ x: number; y: number }[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  // Load PDF document once
  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    const loadDoc = async () => {
      try {
        const copy = pdfData.slice(0);
        doc = await pdfjsLib.getDocument({ data: new Uint8Array(copy) }).promise;
        if (!cancelled) setPdfDoc(doc);
        else doc.destroy();
      } catch (err) {
        console.error('Error loading PDF document:', err);
      }
    };
    loadDoc();
    return () => { cancelled = true; if (doc) doc.destroy(); setPdfDoc(null); };
  }, [pdfData]);

  // Render page (HiDPI-aware)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pdfDoc) return;
    let cancelled = false;
    const render = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage + 1);
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });
        const hiDpiViewport = page.getViewport({ scale: scale * dpr });
        canvas.width = hiDpiViewport.width;
        canvas.height = hiDpiViewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setCanvasSize({ width: viewport.width, height: viewport.height });
        const context = canvas.getContext('2d');
        if (!context) return;
        await page.render({ canvasContext: context, viewport: hiDpiViewport }).promise;
        if (cancelled) return;

        // Save a clean snapshot of the rendered page (before any white rects)
        cleanCanvasRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
        setRenderGen((g) => g + 1);
      } catch (err) {
        if (!cancelled) console.error('Error rendering page:', err);
      }
    };
    render();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage, scale]);

  // Restore clean canvas then paint white rects over modified blocks
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pageContent || canvasSize.width === 0 || !cleanCanvasRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Restore the clean PDF render
    ctx.putImageData(cleanCanvasRef.current, 0, 0);

    // Paint rects to cover original text of modified/erased blocks,
    // sampling the background color from the clean canvas so it blends on any bg
    const dpr = window.devicePixelRatio || 1;
    const sX = (canvasSize.width * dpr) / pageContent.width;
    const sY = (canvasSize.height * dpr) / pageContent.height;
    const imgData = cleanCanvasRef.current;
    const cw = canvas.width;

    for (const block of pageContent.textBlocks) {
      if (!isBlockModified(block) && block.id !== editingBlockId) continue;
      const fs = block.originalFontSize || block.fontSize;
      const x = Math.round(block.x * sX - 1);
      const y = Math.round((pageContent.height - block.y) * sY - fs * sY - 1);
      const w = Math.round(Math.max(block.originalWidth, block.width) * sX + 2);
      const h = Math.round((Math.max(block.originalHeight, block.height) + fs * 0.3) * sY + 2);

      // Sample background color from a few pixels at the edges of the block area
      // (corners + edges, avoiding text in the center)
      const samples: [number, number][] = [
        [x + 1, y + 1],                   // top-left
        [x + w - 2, y + 1],               // top-right
        [x + 1, y + h - 2],               // bottom-left
        [x + w - 2, y + h - 2],           // bottom-right
        [x + Math.round(w / 2), y + 1],   // top-center
      ];
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (const [sx, sy] of samples) {
        if (sx >= 0 && sx < cw && sy >= 0 && sy < canvas.height) {
          const idx = (sy * cw + sx) * 4;
          rSum += imgData.data[idx];
          gSum += imgData.data[idx + 1];
          bSum += imgData.data[idx + 2];
          count++;
        }
      }
      if (count > 0) {
        ctx.fillStyle = `rgb(${Math.round(rSum / count)},${Math.round(gSum / count)},${Math.round(bSum / count)})`;
      } else {
        ctx.fillStyle = '#ffffff';
      }

      ctx.fillRect(x, y, w, h);
    }
  }, [pageContent, canvasSize, editingBlockId, renderGen]);

  // Reset on page change
  useEffect(() => {
    setEditingBlockId(null);
    setSelectedBlockId(null);
    setDragEdge(null);
    setDragDelta(0);
  }, [currentPage]);

  // Focus contentEditable div and select all text
  useEffect(() => {
    if (editingBlockId && inputRef.current) {
      const el = inputRef.current;
      // Set initial text content
      el.innerText = editValue;
      el.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingBlockId]);

  const getScales = useCallback(() => {
    if (!pageContent || canvasSize.width === 0) return { scaleX: 0, scaleY: 0 };
    return {
      scaleX: canvasSize.width / pageContent.width,
      scaleY: canvasSize.height / pageContent.height,
    };
  }, [pageContent, canvasSize]);

  // Block rect in screen px
  const getBlockRect = useCallback(
    (block: TextBlock) => {
      const { scaleX, scaleY } = getScales();
      if (scaleX === 0 || !pageContent) return { left: 0, top: 0, width: 0, height: 0 };

      // block.y is the PDF baseline (bottom-left origin). Convert to screen top-left.
      // The text sits above the baseline by ~fontSize. block.height is the extent
      // from the lowest to the highest baseline in the block.
      const fontSize = block.fontSize * scaleY;
      let w = Math.max(block.width * scaleX, 20);
      let h = Math.max(block.height * scaleY, fontSize) + fontSize * 0.3; // tight: text height + small descender
      let left = block.x * scaleX;
      let top = (pageContent.height - block.y) * scaleY - fontSize;

      if (dragEdge && selectedBlockId === block.id && dragDelta !== 0) {
        switch (dragEdge) {
          case 'right':  w = Math.max(w + dragDelta, 20); break;
          case 'left':   w = Math.max(w - dragDelta, 20); left += dragDelta; break;
          case 'bottom': h = Math.max(h + dragDelta, 12); break;
          case 'top':    h = Math.max(h - dragDelta, 12); top += dragDelta; break;
        }
      }

      return { left, top, width: w, height: h };
    },
    [getScales, pageContent, dragEdge, dragDelta, selectedBlockId]
  );

  // Get mouse position relative to container in PDF coordinates
  const getRelativePos = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const toPdfCoords = (screenX: number, screenY: number) => {
    const { scaleX, scaleY } = getScales();
    if (!pageContent || scaleX === 0) return { x: 0, y: 0 };
    return {
      x: screenX / scaleX,
      y: pageContent.height - screenY / scaleY,
    };
  };

  // --- Tool-specific interactions ---
  const handleBlockClick = (block: TextBlock) => {
    if (activeTool === 'eraser') {
      onEraseBlock(block.id);
      return;
    }
    if (activeTool !== 'select') return;
    if (dragRef.current) return;
    if (selectedBlockId === block.id) {
      setEditingBlockId(block.id);
      setEditValue(block.text);
    } else {
      setSelectedBlockId(block.id);
      setEditingBlockId(null);
    }
    onBlockFocus(block.id);
  };

  const handleBlockDoubleClick = (block: TextBlock) => {
    if (activeTool !== 'select') return;
    setSelectedBlockId(block.id);
    setEditingBlockId(block.id);
    setEditValue(block.text);
    onBlockFocus(block.id);
  };

  const deselectBlock = () => {
    setSelectedBlockId(null);
    setEditingBlockId(null);
    onBlockBlur();
  };

  const commitEdit = () => {
    if (editingBlockId) {
      const text = inputRef.current?.innerText || editValue;
      onTextChange(editingBlockId, text);
      setEditingBlockId(null);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (activeTool === 'addText' && pageContent) {
      const pos = getRelativePos(e);
      const pdfPos = toPdfCoords(pos.x, pos.y);
      const newId = onAddTextBlock(currentPage, pdfPos.x, pdfPos.y);
      setSelectedBlockId(newId);
      setEditingBlockId(newId);
      setEditValue('');
      onBlockFocus(newId);
      return;
    }
    if (selectedBlockId && !editingBlockId) deselectBlock();
  };

  // Drawing handlers
  const handleDrawMouseDown = (e: React.MouseEvent) => {
    if (activeTool !== 'highlight' && activeTool !== 'pen') return;
    e.preventDefault();
    const pos = getRelativePos(e);
    setDrawStart(pos);
    setDrawCurrent(pos);
    if (activeTool === 'pen') setPenPoints([pos]);
  };

  const handleDrawMouseMove = (e: React.MouseEvent) => {
    if (!drawStart) return;
    const pos = getRelativePos(e);
    setDrawCurrent(pos);
    if (activeTool === 'pen') setPenPoints((prev) => [...prev, pos]);
  };

  const handleDrawMouseUp = () => {
    if (!drawStart || !drawCurrent || !pageContent) {
      setDrawStart(null);
      setDrawCurrent(null);
      setPenPoints([]);
      return;
    }

    const { scaleX, scaleY } = getScales();

    if (activeTool === 'highlight') {
      const x = Math.min(drawStart.x, drawCurrent.x);
      const y = Math.min(drawStart.y, drawCurrent.y);
      const w = Math.abs(drawCurrent.x - drawStart.x);
      const h = Math.abs(drawCurrent.y - drawStart.y);
      if (w > 5 && h > 5) {
        onHighlightAdd({
          id: `hl-${Date.now()}`,
          pageIndex: currentPage,
          x: x / scaleX,
          y: pageContent.height - (y + h) / scaleY,
          width: w / scaleX,
          height: h / scaleY,
          color: highlightColor,
        });
      }
    } else if (activeTool === 'pen' && penPoints.length > 2) {
      onPenStrokeAdd({
        id: `pen-${Date.now()}`,
        pageIndex: currentPage,
        points: penPoints.map((p) => ({
          x: p.x / scaleX,
          y: pageContent.height - p.y / scaleY,
        })),
        color: penColor,
        lineWidth: 2,
      });
    }

    setDrawStart(null);
    setDrawCurrent(null);
    setPenPoints([]);
  };

  // --- Drag resize ---
  const handleHandleMouseDown = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedBlockId) return;

      const isHorizontal = edge === 'left' || edge === 'right';
      const startPos = isHorizontal ? e.clientX : e.clientY;

      dragRef.current = { startPos, blockId: selectedBlockId, edge };
      setDragEdge(edge);
      setDragDelta(0);

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const current = isHorizontal ? ev.clientX : ev.clientY;
        setDragDelta(current - dragRef.current.startPos);
      };

      const onMouseUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        if (!dragRef.current || !pageContent) {
          dragRef.current = null;
          return;
        }

        const { scaleX, scaleY } = getScales();
        const block = pageContent.textBlocks.find((b) => b.id === dragRef.current!.blockId);
        if (!block || scaleX === 0) {
          dragRef.current = null;
          setDragEdge(null);
          setDragDelta(0);
          return;
        }

        const delta = (isHorizontal ? ev.clientX : ev.clientY) - dragRef.current.startPos;
        let newWidth = block.width;
        let newHeight = block.height;

        switch (edge) {
          case 'right':  newWidth  = Math.max(block.width  + delta / scaleX, 5); break;
          case 'left':   newWidth  = Math.max(block.width  - delta / scaleX, 5); break;
          case 'bottom': newHeight = Math.max(block.height + delta / scaleY, 5); break;
          case 'top':    newHeight = Math.max(block.height - delta / scaleY, 5); break;
        }

        onBlockResize(dragRef.current.blockId, newWidth, newHeight);
        dragRef.current = null;
        setDragEdge(null);
        setDragDelta(0);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [selectedBlockId, getScales, pageContent, onBlockResize]
  );

  const blocks = pageContent?.textBlocks.filter((b) => !b.isErased) ?? [];
  const erasedBlocks = pageContent?.textBlocks.filter((b) => b.isErased) ?? [];
  const isDrawing = activeTool === 'highlight' || activeTool === 'pen';
  const cursorClass = activeTool === 'addText' ? 'cursor-text'
    : activeTool === 'eraser' ? 'cursor-pointer'
    : isDrawing ? 'cursor-crosshair'
    : 'cursor-default';

  return (
    <div
      ref={containerRef}
      className={`relative inline-block select-none ${cursorClass}`}
      onMouseDown={isDrawing ? handleDrawMouseDown : undefined}
      onMouseMove={isDrawing && drawStart ? handleDrawMouseMove : undefined}
      onMouseUp={isDrawing && drawStart ? handleDrawMouseUp : undefined}
      onMouseLeave={isDrawing && drawStart ? handleDrawMouseUp : undefined}
    >
      <canvas ref={canvasRef} className="rounded-lg shadow-[0_2px_20px_rgba(0,0,0,0.12)]" onClick={handleCanvasClick} />

      {/* Erased blocks: subtle indicator (original text already hidden on canvas) */}
      {canvasSize.width > 0 && erasedBlocks.map((block) => {
        const rect = getBlockRect(block);
        return (
          <div
            key={`erased-${block.id}`}
            className="absolute pointer-events-none"
            style={{ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }}
          />
        );
      })}

      {/* Highlight annotations */}
      {canvasSize.width > 0 && highlights.map((hl) => {
        const { scaleX, scaleY } = getScales();
        if (scaleX === 0 || !pageContent) return null;
        const left = hl.x * scaleX;
        const top = (pageContent.height - hl.y - hl.height) * scaleY;
        const width = hl.width * scaleX;
        const height = hl.height * scaleY;
        return (
          <div
            key={hl.id}
            className="absolute pointer-events-none rounded-sm"
            style={{ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, backgroundColor: hl.color, opacity: 0.35 }}
          />
        );
      })}

      {/* Pen strokes */}
      {canvasSize.width > 0 && penStrokes.length > 0 && (
        <svg className="absolute inset-0 pointer-events-none" width={canvasSize.width} height={canvasSize.height}>
          {penStrokes.map((stroke) => {
            const { scaleX, scaleY } = getScales();
            if (scaleX === 0 || !pageContent) return null;
            const d = stroke.points.map((p, i) => {
              const sx = p.x * scaleX;
              const sy = (pageContent.height - p.y) * scaleY;
              return `${i === 0 ? 'M' : 'L'}${sx},${sy}`;
            }).join(' ');
            return <path key={stroke.id} d={d} fill="none" stroke={stroke.color} strokeWidth={stroke.lineWidth * scaleX} strokeLinecap="round" strokeLinejoin="round" />;
          })}
        </svg>
      )}

      {/* Live drawing preview */}
      {drawStart && drawCurrent && activeTool === 'highlight' && (
        <div
          className="absolute border-2 border-yellow-400 rounded-sm pointer-events-none"
          style={{
            left: `${Math.min(drawStart.x, drawCurrent.x)}px`,
            top: `${Math.min(drawStart.y, drawCurrent.y)}px`,
            width: `${Math.abs(drawCurrent.x - drawStart.x)}px`,
            height: `${Math.abs(drawCurrent.y - drawStart.y)}px`,
            backgroundColor: highlightColor,
            opacity: 0.3,
          }}
        />
      )}
      {drawStart && penPoints.length > 1 && activeTool === 'pen' && (
        <svg ref={svgRef} className="absolute inset-0 pointer-events-none" width={canvasSize.width} height={canvasSize.height}>
          <path
            d={penPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={penColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Modified text overlays */}
      {canvasSize.width > 0 &&
        blocks.map((block) => {
          if (!isBlockModified(block)) return null;
          if (editingBlockId === block.id) return null;

          const rect = getBlockRect(block);
          const { scaleX } = getScales();
          const fontSize = Math.max(block.fontSize * scaleX, 6);

          return (
            <div
              key={`mod-${block.id}`}
              className="absolute pointer-events-none"
              style={{
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
              }}
            >
              <span
                className="block whitespace-pre-wrap"
                style={{
                  ...blockStyle(block, fontSize),
                  lineHeight: `${fontSize * 1.2}px`,
                }}
              >
                {block.text}
              </span>
            </div>
          );
        })}

      {/* Block overlays (interactive zones) — only in select/eraser/addText mode */}
      {canvasSize.width > 0 && (activeTool === 'select' || activeTool === 'eraser') &&
        blocks.map((block) => {
          if (editingBlockId === block.id) return null;

          const isSelected = selectedBlockId === block.id;
          const isFocused = focusedBlockId === block.id && !isSelected;
          const isModified = isBlockModified(block);
          const rect = getBlockRect(block);
          const isEraserMode = activeTool === 'eraser';

          return (
            <div
              key={block.id}
              onClick={(e) => { e.stopPropagation(); handleBlockClick(block); }}
              onDoubleClick={(e) => { e.stopPropagation(); handleBlockDoubleClick(block); }}
              className={`absolute rounded-sm transition-colors duration-150 ${
                isEraserMode
                  ? 'cursor-pointer border border-transparent hover:border-red-400 hover:bg-red-400/10'
                  : isSelected
                  ? 'border-2 border-teal-600 bg-teal-600/5 z-10 cursor-pointer'
                  : isFocused
                  ? 'border-2 border-teal-600/50 bg-teal-600/5 cursor-pointer'
                  : isModified
                  ? 'border border-teal-600/40 hover:bg-teal-600/10 cursor-pointer'
                  : 'border border-transparent hover:border-teal-600/30 hover:bg-teal-600/5 cursor-pointer'
              }`}
              style={{
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
              }}
            >
              {isSelected && !isEraserMode && (
                <>
                  <div onMouseDown={(e) => handleHandleMouseDown(e, 'top')} className="absolute -top-4 left-1/2 -translate-x-1/2 w-12 h-5 cursor-ns-resize group/handle flex items-center justify-center">
                    <div className="w-10 h-1.5 bg-teal-600 rounded-full shadow group-hover/handle:bg-teal-500 group-hover/handle:h-2 transition-all" />
                  </div>
                  <div onMouseDown={(e) => handleHandleMouseDown(e, 'bottom')} className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-12 h-5 cursor-ns-resize group/handle flex items-center justify-center">
                    <div className="w-10 h-1.5 bg-teal-600 rounded-full shadow group-hover/handle:bg-teal-500 group-hover/handle:h-2 transition-all" />
                  </div>
                  <div onMouseDown={(e) => handleHandleMouseDown(e, 'left')} className="absolute -left-4 top-1/2 -translate-y-1/2 h-12 w-5 cursor-ew-resize group/handle flex items-center justify-center">
                    <div className="h-10 w-1.5 bg-teal-600 rounded-full shadow group-hover/handle:bg-teal-500 group-hover/handle:w-2 transition-all" />
                  </div>
                  <div onMouseDown={(e) => handleHandleMouseDown(e, 'right')} className="absolute -right-4 top-1/2 -translate-y-1/2 h-12 w-5 cursor-ew-resize group/handle flex items-center justify-center">
                    <div className="h-10 w-1.5 bg-teal-600 rounded-full shadow group-hover/handle:bg-teal-500 group-hover/handle:w-2 transition-all" />
                  </div>
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 bg-gray-900/90 text-white text-[9px] rounded-md shadow-lg pointer-events-none backdrop-blur-sm">
                    Double-clic pour editer
                  </div>
                </>
              )}
            </div>
          );
        })}

      {/* Inline editing textarea */}
      {editingBlockId && pageContent && canvasSize.width > 0 && (() => {
        const block = (pageContent.textBlocks).find((b) => b.id === editingBlockId);
        if (!block) return null;
        const rect = getBlockRect(block);
        const { scaleX } = getScales();
        const fontSize = Math.max(block.fontSize * scaleX, 8);

        return (
          <div
            className="absolute z-20"
            onClick={(e) => e.stopPropagation()}
            style={{
              left: `${rect.left}px`,
              top: `${rect.top}px`,
            }}
          >
            <div
              ref={inputRef}
              contentEditable
              suppressContentEditableWarning
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (inputRef.current) inputRef.current.innerText = block.text;
                  setEditingBlockId(null);
                }
              }}
              onBlur={commitEdit}
              className="border-2 border-teal-600 rounded px-0.5 focus:outline-none focus:ring-2 focus:ring-teal-600/20 whitespace-pre-wrap break-words"
              style={{
                ...blockStyle(block, fontSize),
                lineHeight: `${fontSize * 1.2}px`,
                background: 'transparent',
                minWidth: `${Math.max(rect.width, 80)}px`,
                minHeight: `${Math.max(rect.height, 20)}px`,
                width: 'auto',
                height: 'auto',
                display: 'inline-block',
              }}
            />
          </div>
        );
      })()}
    </div>
  );
}
