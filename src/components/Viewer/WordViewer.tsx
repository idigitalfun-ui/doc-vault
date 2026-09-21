import React, { useState, useEffect } from 'react';
import mammoth from 'mammoth';
import { 
  FileText, 
  Edit3, 
  Save, 
  Copy, 
  Check, 
  PenTool, 
  RotateCcw, 
  Eye, 
  Download,
  Bold,
  Italic,
  List,
  Type
} from 'lucide-react';

interface WordViewerProps {
  url: string;
  name: string;
  zoom: number;
  isReadOnly?: boolean;
  onSaveContent?: (updatedUrl: string) => void;
  onOpenSignature?: () => void;
}

export const WordViewer: React.FC<WordViewerProps> = ({
  url,
  name,
  zoom,
  isReadOnly = false,
  onSaveContent,
  onOpenSignature
}) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isWordDoc, setIsWordDoc] = useState(false);

  // Helper to convert data URL to ArrayBuffer
  const dataUrlToArrayBuffer = (dataUrl: string): ArrayBuffer => {
    const base64 = dataUrl.split(',')[1] || dataUrl;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  };

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    const loadDoc = async () => {
      const ext = name.split('.').pop()?.toLowerCase() || '';
      const isDocx = ext === 'docx' || ext === 'doc' || url.includes('wordprocessingml') || url.includes('msword');
      setIsWordDoc(isDocx);

      try {
        if (isDocx) {
          let buffer: ArrayBuffer;
          if (url.startsWith('data:')) {
            buffer = dataUrlToArrayBuffer(url);
          } else {
            const res = await fetch(url);
            buffer = await res.arrayBuffer();
          }

          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (!isCancelled) {
            const html = result.value || '<p>Empty Word document</p>';
            setHtmlContent(html);
            // Also extract plain text
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            setRawText(tempDiv.textContent || '');
            setEditBuffer(tempDiv.innerHTML);
            setLoading(false);
          }
        } else {
          // Plain text / txt / csv
          let text = '';
          if (url.startsWith('data:')) {
            const base64 = url.split(',')[1] || '';
            text = decodeURIComponent(escape(atob(base64)));
          } else {
            const res = await fetch(url);
            text = await res.text();
          }
          if (!isCancelled) {
            setRawText(text);
            setHtmlContent(`<pre style="font-family: monospace; white-space: pre-wrap;">${text}</pre>`);
            setEditBuffer(text);
            setLoading(false);
          }
        }
      } catch (err) {
        console.warn('Document parsing error:', err);
        if (!isCancelled) {
          // Fallback to text attempt
          try {
            if (url.startsWith('data:')) {
              const text = atob(url.split(',')[1] || '');
              setRawText(text);
              setHtmlContent(`<pre style="font-family: monospace; white-space: pre-wrap;">${text}</pre>`);
              setEditBuffer(text);
            }
          } catch {}
          setLoading(false);
        }
      }
    };

    loadDoc();

    return () => {
      isCancelled = true;
    };
  }, [url, name]);

  const handleCopy = () => {
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    if (!onSaveContent) return;

    if (isWordDoc) {
      // For edited Word docs, save as formatted HTML file data URL
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(editBuffer)}`;
      setHtmlContent(editBuffer);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = editBuffer;
      setRawText(tempDiv.textContent || '');
      onSaveContent(dataUrl);
    } else {
      // For text files, save as text/plain data URL
      const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(editBuffer)}`;
      setRawText(editBuffer);
      setHtmlContent(`<pre style="font-family: monospace; white-space: pre-wrap;">${editBuffer}</pre>`);
      onSaveContent(dataUrl);
    }
    setIsEditing(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#f0f3f8] overflow-hidden select-text">
      {/* Top Document Toolbar */}
      <div className="bg-white border-b border-[#dadce0] px-4 py-2 flex items-center justify-between gap-3 shadow-2xs z-10 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-[#202124] truncate max-w-[220px] sm:max-w-md">
              {name}
            </h4>
            <span className="text-[10px] text-[#5f6368] font-medium">
              {isWordDoc ? 'Microsoft Word Document' : 'Text File'} • {rawText.split(/\s+/).filter(Boolean).length} words
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isReadOnly && onSaveContent && (
            <button
              onClick={() => {
                if (isEditing) {
                  handleSaveEdit();
                } else {
                  setIsEditing(true);
                }
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-2xs ${
                isEditing
                  ? 'bg-[#137333] hover:bg-[#0f5c29] text-white'
                  : 'bg-[#1a73e8] hover:bg-[#1557b0] text-white'
              }`}
              title={isEditing ? 'Save edits to document' : 'Edit document text'}
            >
              {isEditing ? (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Document</span>
                </>
              )}
            </button>
          )}

          {isEditing && (
            <button
              onClick={() => {
                setEditBuffer(rawText);
                setIsEditing(false);
              }}
              className="px-2.5 py-1.5 text-xs text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}

          {onOpenSignature && (
            <button
              onClick={onOpenSignature}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-[#e8f0fe] hover:bg-[#d2e3fc] text-[#1a73e8] border border-[#1a73e8]/30 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
              title="Affix digital signature to this document"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Add Signature</span>
            </button>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-[#dadce0] hover:bg-[#f1f3f4] text-[#202124] rounded-lg text-xs font-medium transition-colors shadow-2xs"
            title="Copy document text"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#137333]" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Main Document Reader Canvas (Letterhead Paper Layout) */}
      <div className="flex-1 w-full overflow-y-auto overscroll-contain p-4 sm:p-8 flex justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-[#5f6368] gap-2">
            <div className="w-8 h-8 border-3 border-[#1a73e8] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold">Reading Word document...</p>
          </div>
        ) : isEditing ? (
          /* Live Document Editor */
          <div className="bg-white border border-[#dadce0] rounded-2xl shadow-xl w-full max-w-4xl p-6 sm:p-10 flex flex-col min-h-[600px]">
            <div className="mb-3 flex items-center justify-between border-b pb-2 text-xs text-[#5f6368]">
              <span className="font-bold text-[#202124]">Editing Mode</span>
              <span>Type your revisions below then click Save Changes</span>
            </div>
            <textarea
              value={editBuffer}
              onChange={(e) => setEditBuffer(e.target.value)}
              className="w-full flex-1 min-h-[500px] font-sans text-sm leading-relaxed p-4 border border-[#dadce0] rounded-xl focus:outline-none focus:border-[#1a73e8] resize-none"
              placeholder="Edit document content..."
            />
          </div>
        ) : (
          /* Formatted Letterhead View */
          <div 
            style={{
              transform: `scale(${Math.max(zoom, 0.75)})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out'
            }}
            className="bg-white border border-[#dadce0] rounded-xl shadow-xl w-full max-w-4xl p-8 sm:p-14 min-h-[750px] font-sans text-[#202124] text-sm leading-relaxed"
          >
            {/* Rendered HTML */}
            <div 
              className="prose prose-sm max-w-none prose-headings:font-bold prose-headings:text-[#202124] prose-p:my-2 prose-table:border prose-table:border-[#dadce0] prose-th:bg-[#f8fafd] prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-[#dadce0]"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
