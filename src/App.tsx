import { useState, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import UploadZone from './components/UploadZone';
import EditorLayout from './components/EditorLayout';
import DownloadButton from './components/DownloadButton';
import { usePdfParser } from './hooks/usePdfParser';
import { usePdfBuilder } from './hooks/usePdfBuilder';
import type { EditorStep, HighlightAnnotation, PenStroke } from './types/pdf.types';
import { isBlockModified } from './utils/pdfUtils';

export default function App() {
  const [step, setStep] = useState<EditorStep>('upload');
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  const { pages, isLoading, isScannedPdf, parsePdf, updateTextBlock, updateBlockFormat, eraseBlock, addTextBlock, resizeBlock, resetAllText } =
    usePdfParser();
  const [highlights, setHighlights] = useState<HighlightAnnotation[]>([]);
  const [penStrokes, setPenStrokes] = useState<PenStroke[]>([]);
  const { buildPdf, isBuilding } = usePdfBuilder();

  const handleFileSelected = useCallback(
    async (file: File) => {
      setFileName(file.name);
      const buffer = await file.arrayBuffer();
      setPdfData(buffer);

      try {
        await parsePdf(buffer);
        setStep('edit');
        setCurrentPage(0);
      } catch {
        toast.error('Impossible de lire ce fichier PDF.');
      }
    },
    [parsePdf]
  );

  const handleDownload = useCallback(async () => {
    if (!pdfData) return;

    try {
      const modified = await buildPdf(pdfData, pages, highlights, penStrokes);
      const blob = new Blob([modified.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const baseName = fileName.replace(/\.pdf$/i, '');
      const link = document.createElement('a');
      link.href = url;
      link.download = `${baseName}_modifie.pdf`;
      link.click();

      URL.revokeObjectURL(url);
      setStep('download');
      toast.success('PDF telecharge avec succes !');
    } catch {
      toast.error('Erreur lors de la generation du PDF.');
    }
  }, [pdfData, pages, highlights, penStrokes, fileName, buildPdf]);

  const hasModifications = pages.some((p) =>
    p.textBlocks.some(isBlockModified)
  );

  const handleNewFile = () => {
    setStep('upload');
    setPdfData(null);
    setFileName('');
    setCurrentPage(0);
  };

  return (
    <div className="flex flex-col h-screen bg-[#F5F5F5] font-sans">
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'text-sm font-sans',
          duration: 3000,
        }}
      />

      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={handleNewFile} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-800">
              PDF<span className="text-teal-600">Edit</span>
            </span>
          </button>

          {step !== 'upload' && fileName && (
            <>
              <div className="h-5 w-px bg-gray-200" />
              <span className="text-sm text-gray-500 truncate max-w-[200px]" title={fileName}>
                {fileName}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {step !== 'upload' && (
            <button
              onClick={handleNewFile}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nouveau
            </button>
          )}
          {step === 'edit' && (
            <DownloadButton
              onClick={handleDownload}
              isBuilding={isBuilding}
              hasModifications={hasModifications}
            />
          )}
          {step === 'download' && (
            <DownloadButton
              onClick={handleDownload}
              isBuilding={isBuilding}
              hasModifications={true}
            />
          )}
        </div>
      </header>

      {/* Content area */}
      <main className="flex-1 overflow-hidden">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-600/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-teal-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Analyse du PDF en cours</p>
              <p className="text-xs text-gray-400 mt-1">Extraction du texte et des polices...</p>
            </div>
          </div>
        )}

        {!isLoading && step === 'upload' && (
          <UploadZone onFileSelected={handleFileSelected} />
        )}

        {!isLoading && (step === 'edit' || step === 'download') && pdfData && (
          <EditorLayout
            pdfData={pdfData}
            pages={pages}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onTextChange={updateTextBlock}
            onBlockFormatChange={updateBlockFormat}
            onEraseBlock={eraseBlock}
            onAddTextBlock={addTextBlock}
            onBlockResize={resizeBlock}
            onReset={() => { resetAllText(); setHighlights([]); setPenStrokes([]); }}
            highlights={highlights}
            onHighlightsChange={setHighlights}
            penStrokes={penStrokes}
            onPenStrokesChange={setPenStrokes}
            isScannedPdf={isScannedPdf}
          />
        )}
      </main>
    </div>
  );
}
