import { useState, useMemo, useCallback } from 'react';
import PdfViewer from './PdfViewer';
import PageThumbnails from './PageThumbnails';
import type { PageContent, TextBlock, Tool, HighlightAnnotation, PenStroke } from '../types/pdf.types';
import { isBlockModified } from '../utils/pdfUtils';

const FONT_OPTIONS: { label: string; value: string; group: string }[] = [
  // Sans-serif - System
  { label: 'Arial', value: 'Arial, sans-serif', group: 'Sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, sans-serif', group: 'Sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif', group: 'Sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif', group: 'Sans-serif' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif', group: 'Sans-serif' },
  // Sans-serif - Google Fonts
  { label: 'Roboto', value: 'Roboto, sans-serif', group: 'Sans-serif' },
  { label: 'Open Sans', value: 'Open Sans, sans-serif', group: 'Sans-serif' },
  { label: 'Lato', value: 'Lato, sans-serif', group: 'Sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, sans-serif', group: 'Sans-serif' },
  { label: 'Poppins', value: 'Poppins, sans-serif', group: 'Sans-serif' },
  { label: 'Raleway', value: 'Raleway, sans-serif', group: 'Sans-serif' },
  { label: 'Inter', value: 'Inter, sans-serif', group: 'Sans-serif' },
  { label: 'Nunito', value: 'Nunito, sans-serif', group: 'Sans-serif' },
  { label: 'Ubuntu', value: 'Ubuntu, sans-serif', group: 'Sans-serif' },
  { label: 'Oswald', value: 'Oswald, sans-serif', group: 'Sans-serif' },
  { label: 'Quicksand', value: 'Quicksand, sans-serif', group: 'Sans-serif' },
  { label: 'Cabin', value: 'Cabin, sans-serif', group: 'Sans-serif' },
  { label: 'Work Sans', value: 'Work Sans, sans-serif', group: 'Sans-serif' },
  { label: 'Rubik', value: 'Rubik, sans-serif', group: 'Sans-serif' },
  { label: 'Karla', value: 'Karla, sans-serif', group: 'Sans-serif' },
  { label: 'Josefin Sans', value: 'Josefin Sans, sans-serif', group: 'Sans-serif' },
  { label: 'Barlow', value: 'Barlow, sans-serif', group: 'Sans-serif' },
  { label: 'Mulish', value: 'Mulish, sans-serif', group: 'Sans-serif' },
  { label: 'Overpass', value: 'Overpass, sans-serif', group: 'Sans-serif' },
  { label: 'Archivo', value: 'Archivo, sans-serif', group: 'Sans-serif' },
  { label: 'Arimo', value: 'Arimo, sans-serif', group: 'Sans-serif' },
  { label: 'Sora', value: 'Sora, sans-serif', group: 'Sans-serif' },
  // Serif - System
  { label: 'Times New Roman', value: 'Times New Roman, serif', group: 'Serif' },
  { label: 'Georgia', value: 'Georgia, serif', group: 'Serif' },
  { label: 'Palatino', value: 'Palatino Linotype, serif', group: 'Serif' },
  { label: 'Book Antiqua', value: 'Book Antiqua, serif', group: 'Serif' },
  // Serif - Google Fonts
  { label: 'Playfair Display', value: 'Playfair Display, serif', group: 'Serif' },
  { label: 'Merriweather', value: 'Merriweather, serif', group: 'Serif' },
  { label: 'Lora', value: 'Lora, serif', group: 'Serif' },
  { label: 'PT Serif', value: 'PT Serif, serif', group: 'Serif' },
  { label: 'Noto Serif', value: 'Noto Serif, serif', group: 'Serif' },
  { label: 'Libre Baskerville', value: 'Libre Baskerville, serif', group: 'Serif' },
  { label: 'Crimson Text', value: 'Crimson Text, serif', group: 'Serif' },
  { label: 'Bitter', value: 'Bitter, serif', group: 'Serif' },
  { label: 'Cormorant Garamond', value: 'Cormorant Garamond, serif', group: 'Serif' },
  { label: 'EB Garamond', value: 'EB Garamond, serif', group: 'Serif' },
  { label: 'Spectral', value: 'Spectral, serif', group: 'Serif' },
  { label: 'Tinos', value: 'Tinos, serif', group: 'Serif' },
  // Monospace - System
  { label: 'Courier New', value: 'Courier New, monospace', group: 'Monospace' },
  { label: 'Consolas', value: 'Consolas, monospace', group: 'Monospace' },
  // Monospace - Google Fonts
  { label: 'Source Code Pro', value: 'Source Code Pro, monospace', group: 'Monospace' },
  { label: 'Fira Code', value: 'Fira Code, monospace', group: 'Monospace' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono, monospace', group: 'Monospace' },
  { label: 'IBM Plex Mono', value: 'IBM Plex Mono, monospace', group: 'Monospace' },
  { label: 'Inconsolata', value: 'Inconsolata, monospace', group: 'Monospace' },
  { label: 'Space Mono', value: 'Space Mono, monospace', group: 'Monospace' },
  { label: 'DM Mono', value: 'DM Mono, monospace', group: 'Monospace' },
  { label: 'Cousine', value: 'Cousine, monospace', group: 'Monospace' },
];

const TOOL_COLORS = {
  highlight: '#FBBF24',
  pen: '#EF4444',
};

interface EditorLayoutProps {
  pdfData: ArrayBuffer;
  pages: PageContent[];
  currentPage: number;
  onPageChange: (page: number) => void;
  onTextChange: (blockId: string, newText: string) => void;
  onBlockFormatChange: (blockId: string, format: Partial<Pick<TextBlock, 'fontSize' | 'isBold' | 'isItalic' | 'fontFamily'>>) => void;
  onEraseBlock: (blockId: string) => void;
  onAddTextBlock: (pageIndex: number, x: number, y: number) => string;
  onBlockResize: (blockId: string, newWidth: number, newHeight: number) => void;
  onReset: () => void;
  highlights: HighlightAnnotation[];
  onHighlightsChange: (h: HighlightAnnotation[]) => void;
  penStrokes: PenStroke[];
  onPenStrokesChange: (s: PenStroke[]) => void;
  isScannedPdf: boolean;
}

export default function EditorLayout({
  pdfData,
  pages,
  currentPage,
  onPageChange,
  onTextChange,
  onBlockFormatChange,
  onEraseBlock,
  onAddTextBlock,
  onBlockResize,
  onReset,
  highlights,
  onHighlightsChange,
  penStrokes,
  onPenStrokesChange,
  isScannedPdf,
}: EditorLayoutProps) {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [activeTool, setActiveTool] = useState<Tool>('select');

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.2;

  const zoomIn = () => setZoom((z) => Math.min(+(z + ZOOM_STEP).toFixed(1), ZOOM_MAX));
  const zoomOut = () => setZoom((z) => Math.max(+(z - ZOOM_STEP).toFixed(1), ZOOM_MIN));
  const zoomPercent = Math.round((zoom / 1.2) * 100);

  const pageContent = pages[currentPage];
  const totalPages = pages.length;

  const goToPage = useCallback((page: number) => {
    const clamped = Math.max(0, Math.min(page, totalPages - 1));
    onPageChange(clamped);
  }, [totalPages, onPageChange]);

  const modifiedCount = pages.reduce(
    (acc, p) => acc + p.textBlocks.filter((b) => isBlockModified(b)).length,
    0
  ) + highlights.length + penStrokes.length;

  const modifiedPages = useMemo(() => {
    const set = new Set<number>();
    pages.forEach((p) => {
      if (p.textBlocks.some((b) => isBlockModified(b))) set.add(p.pageIndex);
    });
    highlights.forEach((h) => set.add(h.pageIndex));
    penStrokes.forEach((s) => set.add(s.pageIndex));
    return set;
  }, [pages, highlights, penStrokes]);

  // Find focused block for formatting bar
  const focusedBlock = useMemo(() => {
    if (!focusedBlockId) return null;
    for (const page of pages) {
      const block = page.textBlocks.find((b) => b.id === focusedBlockId);
      if (block) return block;
    }
    return null;
  }, [focusedBlockId, pages]);

  const handleFontSizeChange = (delta: number) => {
    if (!focusedBlockId || !focusedBlock) return;
    const newSize = Math.max(4, Math.min(72, focusedBlock.fontSize + delta));
    onBlockFormatChange(focusedBlockId, { fontSize: newSize });
  };

  const handleFontSizeInput = (value: string) => {
    if (!focusedBlockId) return;
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 4 && num <= 72) {
      onBlockFormatChange(focusedBlockId, { fontSize: num });
    }
  };

  const toggleBold = () => {
    if (!focusedBlockId || !focusedBlock) return;
    onBlockFormatChange(focusedBlockId, { isBold: !focusedBlock.isBold });
  };

  const toggleItalic = () => {
    if (!focusedBlockId || !focusedBlock) return;
    onBlockFormatChange(focusedBlockId, { isItalic: !focusedBlock.isItalic });
  };

  const handleFontFamilyChange = (fontFamily: string) => {
    if (!focusedBlockId) return;
    onBlockFormatChange(focusedBlockId, { fontFamily });
  };

  // Current page annotations
  const pageHighlights = highlights.filter((h) => h.pageIndex === currentPage);
  const pageStrokes = penStrokes.filter((s) => s.pageIndex === currentPage);

  const tools: { key: Tool; label: string; icon: string }[] = [
    { key: 'select', label: 'Modifier texte', icon: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z' },
    { key: 'addText', label: 'Ajouter texte', icon: 'M12 4.5v15m7.5-7.5h-15' },
    { key: 'eraser', label: 'Gomme', icon: 'M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88' },
    { key: 'highlight', label: 'Surligner', icon: 'M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42' },
    { key: 'pen', label: 'Crayon', icon: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125' },
  ];

  return (
    <div className="flex flex-col h-full">
      {isScannedPdf && (
        <div className="mx-4 mt-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-sm text-amber-700">
            Ce PDF semble etre une image scannee. L'edition de texte n'est pas disponible.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="border-b border-gray-200 bg-white shrink-0">
        {/* Row 1: Tools */}
        <div className="flex items-center justify-between px-4 py-1.5">
          <div className="flex items-center gap-1">
            {totalPages > 1 && (
              <>
                <button
                  onClick={() => setShowThumbnails((v) => !v)}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                    showThumbnails ? 'bg-teal-600/10 text-teal-600' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                  Pages
                </button>
                <div className="h-6 w-px bg-gray-200 mx-1" />
              </>
            )}

            {tools.map((tool) => (
              <button
                key={tool.key}
                onClick={() => setActiveTool(tool.key)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                  activeTool === tool.key
                    ? 'bg-teal-600 text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={tool.icon} />
                </svg>
                {tool.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {modifiedCount > 0 && (
              <span className="text-[11px] text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full font-medium">
                {modifiedCount} modification{modifiedCount > 1 ? 's' : ''}
              </span>
            )}
            {modifiedCount > 0 && (
              <button
                onClick={onReset}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Reinitialiser toutes les modifications"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Formatting bar (visible for select/addText tools) */}
        {(activeTool === 'select' || activeTool === 'addText') && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-t border-gray-100 bg-gray-50/50">
            {/* Font family selector */}
            <select
              value={focusedBlock?.fontFamily ?? ''}
              onChange={(e) => handleFontFamilyChange(e.target.value)}
              disabled={!focusedBlock}
              style={focusedBlock?.fontFamily ? { fontFamily: focusedBlock.fontFamily } : undefined}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:border-teal-600 min-w-[140px] max-w-[180px]"
            >
              {!focusedBlock && <option value="">—</option>}
              {focusedBlock && !FONT_OPTIONS.some((f) => f.value === focusedBlock.fontFamily) && (
                <option value={focusedBlock.fontFamily} style={{ fontFamily: focusedBlock.fontFamily }}>
                  {focusedBlock.fontFamily}
                </option>
              )}
              {['Sans-serif', 'Serif', 'Monospace'].map((group) => (
                <optgroup key={group} label={group}>
                  {FONT_OPTIONS.filter((f) => f.group === group).map((f) => (
                    <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <div className="h-5 w-px bg-gray-200" />

            {/* Font size */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => handleFontSizeChange(-1)}
                disabled={!focusedBlock}
                className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                </svg>
              </button>
              <input
                type="text"
                value={focusedBlock ? Math.round(focusedBlock.fontSize * 10) / 10 : '—'}
                onChange={(e) => handleFontSizeInput(e.target.value)}
                disabled={!focusedBlock}
                className="w-10 text-center text-xs border border-gray-200 rounded px-1 py-0.5 bg-white disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:border-teal-600"
              />
              <button
                onClick={() => handleFontSizeChange(1)}
                disabled={!focusedBlock}
                className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>

            <div className="h-5 w-px bg-gray-200" />

            {/* Bold */}
            <button
              onClick={toggleBold}
              disabled={!focusedBlock}
              className={`p-1.5 rounded-md text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                focusedBlock?.isBold ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-200'
              }`}
              title="Gras"
            >
              <span className="w-4 h-4 flex items-center justify-center text-xs">B</span>
            </button>

            {/* Italic */}
            <button
              onClick={toggleItalic}
              disabled={!focusedBlock}
              className={`p-1.5 rounded-md text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                focusedBlock?.isItalic ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-200'
              }`}
              title="Italique"
            >
              <span className="w-4 h-4 flex items-center justify-center text-xs italic">I</span>
            </button>
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden relative">
        {showThumbnails && totalPages > 1 && (
          <div className="w-[120px] bg-gray-50 border-r border-gray-200 shrink-0 overflow-hidden">
            <PageThumbnails
              pdfData={pdfData}
              totalPages={totalPages}
              currentPage={currentPage}
              onPageChange={goToPage}
              modifiedPages={modifiedPages}
            />
          </div>
        )}

        <div className="flex-1 overflow-auto bg-[#e8e8e8] flex justify-center p-6 pb-20">
          <PdfViewer
            pdfData={pdfData}
            currentPage={currentPage}
            pageContent={pageContent}
            focusedBlockId={focusedBlockId}
            onBlockFocus={setFocusedBlockId}
            onBlockBlur={() => setFocusedBlockId(null)}
            onTextChange={onTextChange}
            onBlockResize={onBlockResize}
            onEraseBlock={onEraseBlock}
            onAddTextBlock={onAddTextBlock}
            activeTool={activeTool}
            scale={zoom}
            highlights={pageHighlights}
            onHighlightAdd={(h) => onHighlightsChange([...highlights, h])}
            penStrokes={pageStrokes}
            onPenStrokeAdd={(s) => onPenStrokesChange([...penStrokes, s])}
            highlightColor={TOOL_COLORS.highlight}
            penColor={TOOL_COLORS.pen}
          />
        </div>

        {/* Floating bottom bar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-gray-900/90 backdrop-blur-sm text-white rounded-full px-4 py-2 shadow-xl">
          <span className="text-xs font-medium text-gray-300 select-none">Page</span>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 0}
            className="p-0.5 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium tabular-nums min-w-[2.5rem] text-center">
            {currentPage + 1}/{totalPages}
          </span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages - 1}
            className="p-0.5 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="h-4 w-px bg-white/20" />
          <button
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            className="p-0.5 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
            </svg>
          </button>
          <span className="text-xs font-medium tabular-nums min-w-[2rem] text-center select-none">
            {zoomPercent}%
          </span>
          <button
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            className="p-0.5 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
