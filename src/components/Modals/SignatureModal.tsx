import React, { useRef, useState, useEffect } from 'react';
import { X, Check, RotateCcw, PenTool, Type, Calendar, User, ShieldCheck } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplySignature: (signatureDataUrl: string, signerName: string) => void;
  documentName?: string;
  defaultSignerName?: string;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onApplySignature,
  documentName = 'Document',
  defaultSignerName = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('draw');
  const [inkColor, setInkColor] = useState<'#0b57d0' | '#111827'>('#0b57d0'); // Blue or Black
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [includeDate, setIncludeDate] = useState(true);

  const currentDateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  useEffect(() => {
    if (!isOpen) return;
    setHasDrawn(false);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions based on display size for crisp retina drawing
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Initial clear
    ctx.clearRect(0, 0, rect.width, rect.height);
  }, [isOpen, signatureMode]);

  if (!isOpen) return null;

  // Touch and Mouse Coordinate Helper
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (signatureMode !== 'draw') return;
    e.preventDefault();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || signatureMode !== 'draw') return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  };

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (signatureMode === 'draw') {
      if (!hasDrawn) {
        alert('Please draw your signature first.');
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      onApplySignature(dataUrl, signerName.trim() || 'Signer');
      onClose();
    } else {
      // Type mode: render cursive text onto an offscreen canvas
      if (!signerName.trim()) {
        alert('Please enter your full legal name.');
        return;
      }
      const offscreen = document.createElement('canvas');
      offscreen.width = 600;
      offscreen.height = 200;
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.fillStyle = inkColor;
        ctx.font = 'italic 52px "Brush Script MT", "Caveat", "Segoe Script", cursive';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(signerName.trim(), 300, 90);

        if (includeDate) {
          ctx.font = '14px sans-serif';
          ctx.fillStyle = '#5f6368';
          ctx.fillText(`Digitally signed on ${currentDateStr}`, 300, 150);
        }

        const dataUrl = offscreen.toDataURL('image/png');
        onApplySignature(dataUrl, signerName.trim());
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-[#dadce0] animate-in fade-in zoom-in-95 duration-150 flex flex-col">
        {/* Header */}
        <div className="p-4 bg-[#f8fafd] border-b border-[#dadce0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center">
              <PenTool className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-['Google_Sans',sans-serif] text-sm font-bold text-[#202124]">
                Sign Document
              </h3>
              <p className="text-[11px] text-[#5f6368] truncate max-w-[260px]">
                {documentName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector & Ink Color */}
        <div className="px-5 pt-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center bg-[#f1f3f4] p-0.5 rounded-xl border border-[#dadce0] text-xs">
            <button
              onClick={() => setSignatureMode('draw')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                signatureMode === 'draw'
                  ? 'bg-white text-[#1a73e8] shadow-xs'
                  : 'text-[#5f6368] hover:text-[#202124]'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Draw with Finger</span>
            </button>
            <button
              onClick={() => setSignatureMode('type')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                signatureMode === 'type'
                  ? 'bg-white text-[#1a73e8] shadow-xs'
                  : 'text-[#5f6368] hover:text-[#202124]'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Type Name</span>
            </button>
          </div>

          {/* Color selector */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setInkColor('#0b57d0')}
              className={`w-6 h-6 rounded-full bg-[#0b57d0] transition-transform ${
                inkColor === '#0b57d0' ? 'ring-2 ring-offset-2 ring-[#0b57d0] scale-110' : 'opacity-80'
              }`}
              title="Official Blue Ink"
            />
            <button
              onClick={() => setInkColor('#111827')}
              className={`w-6 h-6 rounded-full bg-[#111827] transition-transform ${
                inkColor === '#111827' ? 'ring-2 ring-offset-2 ring-[#111827] scale-110' : 'opacity-80'
              }`}
              title="Black Ink"
            />
          </div>
        </div>

        {/* Signature Pad Area */}
        <div className="p-5">
          {signatureMode === 'draw' ? (
            <div className="relative border-2 border-dashed border-[#dadce0] rounded-2xl bg-[#fdfdfd] overflow-hidden">
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                style={{ touchAction: 'none' }}
                className="w-full h-44 cursor-crosshair block"
              />
              {!hasDrawn && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-[#9aa0a6] text-xs">
                  <PenTool className="w-5 h-5 mb-1 text-[#bdc1c6]" />
                  <span>Sign here with your finger or mouse</span>
                </div>
              )}
              {/* Clear button inside canvas */}
              {hasDrawn && (
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-white/90 hover:bg-white text-xs font-semibold text-[#5f6368] hover:text-[#d93025] rounded-lg border border-[#dadce0] shadow-xs flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#202124] mb-1">
                  Full Legal Name
                </label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 text-[#5f6368] absolute left-3" />
                  <input
                    type="text"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="e.g. Rana Abdullah Inayat"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-[#dadce0] rounded-xl focus:outline-none focus:border-[#1a73e8]"
                  />
                </div>
              </div>

              {/* Live cursive preview */}
              <div className="h-32 border-2 border-dashed border-[#dadce0] rounded-2xl bg-white flex flex-col items-center justify-center p-3 text-center">
                <p
                  style={{
                    color: inkColor,
                    fontFamily: '"Brush Script MT", "Caveat", "Segoe Script", cursive'
                  }}
                  className="text-3xl italic font-medium"
                >
                  {signerName.trim() || 'Your Signature Preview'}
                </p>
                {includeDate && (
                  <p className="text-[11px] text-[#5f6368] mt-2 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>Digitally signed on {currentDateStr}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Signer Name Input (under draw mode) */}
          {signatureMode === 'draw' && (
            <div className="mt-3 flex items-center gap-3">
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Printed Signer Name (Optional)"
                className="flex-1 px-3 py-1.5 text-xs border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#1a73e8]"
              />
              <span className="text-xs text-[#5f6368] flex items-center gap-1 flex-shrink-0">
                <Calendar className="w-3.5 h-3.5 text-[#1a73e8]" />
                {currentDateStr}
              </span>
            </div>
          )}

          {/* Legal Note */}
          <div className="mt-4 p-2.5 bg-[#e6f4ea] rounded-xl flex items-center gap-2 text-[11px] text-[#137333]">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span>Digital signature will be securely affixed to this document file.</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#f8fafd] border-t border-[#dadce0] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Affix Signature</span>
          </button>
        </div>
      </div>
    </div>
  );
};
