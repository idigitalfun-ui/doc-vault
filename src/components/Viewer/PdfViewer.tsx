import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Layers, Sparkles, AlertCircle, RefreshCw, Download, ChevronLeft, ChevronRight } from 'lucide-react';

// Configure PDF.js worker
if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

interface PdfPageCanvasProps {
  pdfDoc: any;
  pageNum: number;
  zoom: number;
  rotation: number;
  isMobile: boolean;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({ pdfDoc, pageNum, zoom, rotation, isMobile }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let renderTask: any = null;
    let isCancelled = false;

    const render = async () => {
      try {
        setRendering(true);
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        // Balanced scale: crisp rendering without mobile GPU crash
        const scale = isMobile ? Math.min(zoom * 1.1, 1.6) : Math.min(zoom * 1.35, 2.0);
        const viewport = page.getViewport({ scale, rotation });
        const canvas = canvasRef.current;
        if (!canvas || isCancelled) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        setDimensions({ width: viewport.width, height: viewport.height });

        renderTask = page.render({
          canvasContext: context,
          viewport: viewport
        });

        await renderTask.promise;
        if (!isCancelled) {
          setRendering(false);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`Error rendering PDF page ${pageNum}:`, err);
        }
      }
    };

    render();

    return () => {
      isCancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNum, zoom, rotation, isMobile]);

  return (
    <div className="flex flex-col items-center mb-6 last:mb-2 w-full max-w-3xl">
      <div className="text-[11px] font-semibold text-[#5f6368] mb-1.5 bg-white/90 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-[#dadce0] shadow-xs">
        Page {pageNum} of {pdfDoc.numPages}
      </div>
      <div
        className="relative shadow-xl rounded-md bg-white border border-[#dadce0] overflow-hidden flex items-center justify-center transition-all duration-150"
        style={{
          minWidth: dimensions ? `${Math.min(dimensions.width, 280)}px` : '280px',
          minHeight: dimensions ? `${Math.min(dimensions.height, 380)}px` : '380px'
        }}
      >
        {rendering && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 backdrop-blur-xs z-10 text-[#5f6368] text-xs">
            <div className="w-6 h-6 border-2 border-[#1a73e8] border-t-transparent rounded-full animate-spin mb-1.5" />
            <span>Loading Page {pageNum}...</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="block max-w-full h-auto"
        />
      </div>
    </div>
  );
};

interface PdfViewerProps {
  url: string;
  name: string;
  zoom: number;
  rotation: number;
  currentPage: number;
  onTotalPagesChange: (total: number) => void;
  panOffset: { x: number; y: number };
  onPanChange: (offset: { x: number; y: number }) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  url,
  name,
  zoom,
  rotation,
  currentPage,
  onTotalPagesChange,
  panOffset,
  onPanChange
}) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const singleCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState<'continuous' | 'single'>(isMobile ? 'single' : 'continuous');
  const [activeSinglePage, setActiveSinglePage] = useState<number>(currentPage || 1);
  const [maxPagesToShow, setMaxPagesToShow] = useState<number>(8); // Initial batch for performance

  // Helper to convert base64 data URI to Uint8Array
  const dataUriToUint8Array = (dataUri: string): Uint8Array => {
    const base64 = dataUri.split(',')[1] || dataUri;
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  };

  // Load PDF Document via PDF.js with immediate cleanup on URL change
  useEffect(() => {
    let isCancelled = false;
    setPdfDoc(null);
    setLoading(true);
    setRenderError(null);
    setActiveSinglePage(1);

    if (!url) {
      setRenderError('Document file is missing or still synchronizing.');
      setLoading(false);
      return;
    }

    const loadPdf = async () => {
      try {
        let source: any = url;
        if (url.startsWith('data:application/pdf') || url.startsWith('data:;base64,')) {
          source = { data: dataUriToUint8Array(url) };
        }

        const loadingTask = pdfjsLib.getDocument(source);
        const doc = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDoc(doc);
          onTotalPagesChange(doc.numPages);
          setLoading(false);
        }
      } catch (err: any) {
        console.warn('PDF.js render note:', err);
        if (!isCancelled) {
          setRenderError('Unable to render PDF stream. Click download or retry.');
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [url]);

  // Render single page onto canvas (when in 'single' mode)
  useEffect(() => {
    if (!pdfDoc || !singleCanvasRef.current || viewMode !== 'single') return;

    let renderTask: any = null;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(activeSinglePage);
        const scale = isMobile ? Math.min(zoom * 1.1, 1.5) : zoom * 1.4;
        const viewport = page.getViewport({ scale, rotation });
        const canvas = singleCanvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err);
        }
      }
    };

    renderPage();

    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, activeSinglePage, zoom, rotation, viewMode, isMobile]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewMode !== 'single') return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - panOffset.x,
      y: e.clientY - panOffset.y
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || viewMode !== 'single') return;
    onPanChange({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDownload = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'document.pdf';
    a.click();
  };

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden bg-[#f0f3f8]">
      {/* PDF View Mode Switcher Badge */}
      <div className="absolute top-3 right-4 z-20 flex items-center gap-1 bg-white/95 backdrop-blur-xs border border-[#dadce0] rounded-xl p-1 shadow-sm text-xs select-none">
        <button
          onClick={() => setViewMode('continuous')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            viewMode === 'continuous'
              ? 'bg-[#1a73e8] text-white shadow-xs font-semibold'
              : 'text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4]'
          }`}
          title="Continuous vertical scroll through all pages"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Continuous Scroll</span>
          <span className="sm:hidden">Scroll</span>
        </button>

        <button
          onClick={() => setViewMode('single')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            viewMode === 'single'
              ? 'bg-[#1a73e8] text-white shadow-xs font-semibold'
              : 'text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4]'
          }`}
          title="Single page interactive canvas (Fastest on phone)"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Single Page</span>
          <span className="sm:hidden">Single</span>
        </button>
      </div>

      {/* Main Container */}
      {loading && (
        <div className="w-full flex-1 flex flex-col items-center justify-center gap-2 text-[#5f6368]">
          <div className="w-8 h-8 border-3 border-[#1a73e8] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium">Opening PDF...</p>
        </div>
      )}

      {/* Error state (Never native browser fallback) */}
      {!loading && renderError && (
        <div className="w-full flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white border border-[#dadce0] rounded-3xl p-8 max-w-md shadow-md">
            <div className="w-12 h-12 rounded-2xl bg-[#fce8e6] text-[#d93025] flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-[#202124] mb-1">{name}</h3>
            <p className="text-xs text-[#5f6368] mb-4">{renderError}</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  setLoading(true);
                  setRenderError(null);
                  setViewMode('single');
                }}
                className="px-4 py-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              {url && (
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-white border border-[#dadce0] hover:bg-[#f1f3f4] text-[#202124] rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[#1a73e8]" />
                  <span>Download</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mode 1: Continuous Scroll View (Optimized Page Batching) */}
      {!loading && !renderError && viewMode === 'continuous' && pdfDoc && (
        <div
          ref={containerRef}
          className="w-full flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col items-center"
        >
          {Array.from({ length: Math.min(pdfDoc.numPages, maxPagesToShow) }, (_, i) => i + 1).map((pageNum) => (
            <PdfPageCanvas
              key={`${url}_page_${pageNum}`}
              pdfDoc={pdfDoc}
              pageNum={pageNum}
              zoom={zoom}
              rotation={rotation}
              isMobile={isMobile}
            />
          ))}

          {pdfDoc.numPages > maxPagesToShow && (
            <button
              onClick={() => setMaxPagesToShow((prev) => prev + 10)}
              className="my-4 px-5 py-2.5 bg-white border border-[#dadce0] hover:border-[#1a73e8] text-[#1a73e8] rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            >
              <span>Load Next Pages ({pdfDoc.numPages - maxPagesToShow} remaining)...</span>
            </button>
          )}
        </div>
      )}

      {/* Mode 2: Fast Single Page View with Page Switcher */}
      {!loading && !renderError && viewMode === 'single' && pdfDoc && (
        <div className="w-full flex-1 flex flex-col relative overflow-hidden">
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`w-full flex-1 flex items-center justify-center overflow-auto p-4 relative ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <div
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
              }}
              className="flex justify-center"
            >
              <canvas
                ref={singleCanvasRef}
                className="shadow-2xl rounded-sm bg-white border border-[#dadce0] max-w-none"
                style={{
                  maxHeight: zoom <= 1 ? '78vh' : 'none'
                }}
              />
            </div>
          </div>

          {/* Bottom Page Navigation Controls */}
          {pdfDoc.numPages > 1 && (
            <div className="bg-white/95 backdrop-blur-xs border-t border-[#dadce0] py-2 px-4 flex items-center justify-center gap-3 z-10 select-none shadow-xs">
              <button
                disabled={activeSinglePage <= 1}
                onClick={() => setActiveSinglePage((p) => Math.max(1, p - 1))}
                className="p-1 rounded-lg border border-[#dadce0] hover:bg-[#f1f3f4] disabled:opacity-30 transition-colors"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4 text-[#202124]" />
              </button>

              <span className="text-xs font-bold text-[#202124]">
                Page {activeSinglePage} of {pdfDoc.numPages}
              </span>

              <button
                disabled={activeSinglePage >= pdfDoc.numPages}
                onClick={() => setActiveSinglePage((p) => Math.min(pdfDoc.numPages, p + 1))}
                className="p-1 rounded-lg border border-[#dadce0] hover:bg-[#f1f3f4] disabled:opacity-30 transition-colors"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4 text-[#202124]" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
