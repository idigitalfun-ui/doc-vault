import React, { useState, useRef, useMemo } from 'react';
import { 
  Lock, 
  Key, 
  FileText, 
  Eye, 
  ArrowLeft, 
  AlertCircle, 
  CheckCircle2, 
  Download,
  Upload,
  Building,
  Check,
  XCircle,
  UploadCloud,
  FileCheck,
  Plus,
  RefreshCw,
  Clock,
  Folder,
  ChevronDown,
  ChevronRight,
  Search,
  Image as ImageIcon,
  BookOpen,
  File
} from 'lucide-react';
import { ShareRecord, DocumentItem, CollectionTab, DocumentStatus, FileType, DocumentFolder } from '../types';
import { DocumentViewer } from './Viewer/DocumentViewer';
import { exportSingleDocument, exportMultipleDocuments, exportAsPdf, exportAsJpg, detectFileType } from '../lib/storage';
import { getFolderColorStyle } from './DocumentList';

interface SharedViewerProps {
  shareRecord: ShareRecord | null;
  documents: DocumentItem[];
  folders?: DocumentFolder[];
  tabs: CollectionTab[];
  onUploadClientFile?: (docId: string, file: File) => void;
  onClientUploadNewDoc?: (collectionId: string, file: File) => void;
  onUpdateStatus?: (docId: string, status: DocumentStatus) => void;
  onBackToApp?: () => void;
}

export const SharedViewer: React.FC<SharedViewerProps> = ({
  shareRecord,
  documents,
  folders = [],
  tabs,
  onUploadClientFile,
  onClientUploadNewDoc,
  onUpdateStatus,
  onBackToApp
}) => {
  const [enteredCode, setEnteredCode] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<DocumentItem | null>(null);
  const [activeViewMode, setActiveViewMode] = useState<'upload_portal' | 'viewer'>('upload_portal');

  const slotUploadRef = useRef<HTMLInputElement>(null);
  const additionalUploadRef = useRef<HTMLInputElement>(null);
  const [targetSlotId, setTargetSlotId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  if (!shareRecord) {
    return (
      <div className="min-h-screen bg-[#f8fafd] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-white border border-[#dadce0] shadow-sm flex items-center justify-center mb-4 text-[#d93025]">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="font-['Google_Sans',sans-serif] text-xl font-bold text-[#202124]">
          Shared Link Not Found
        </h2>
        <p className="text-sm text-[#5f6368] mt-1 max-w-sm">
          This document link may have expired or was removed by the solicitor.
        </p>
        {onBackToApp && (
          <button
            onClick={onBackToApp}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-[#1a73e8] text-white rounded-lg text-sm font-medium hover:bg-[#1557b0] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go to DocVault Home</span>
          </button>
        )}
      </div>
    );
  }

  // Filter allowed documents with safe fallback for self-contained cross-device payload
  const allowedDocuments: DocumentItem[] = React.useMemo(() => {
    let filtered: DocumentItem[] = [];
    if (shareRecord.scope === 'collection') {
      const targetTabId = shareRecord.targetIds[0];
      filtered = documents.filter((d) => d.collectionId === targetTabId);
    } else {
      filtered = documents.filter((d) => shareRecord.targetIds.includes(d.id));
    }
    return filtered.length > 0 ? filtered : documents;
  }, [shareRecord, documents]);

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return allowedDocuments;
    const q = searchQuery.toLowerCase();
    return allowedDocuments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.fileType.toLowerCase().includes(q) ||
        (d.notes && d.notes.toLowerCase().includes(q))
    );
  }, [allowedDocuments, searchQuery]);

  const relevantFolders = useMemo(() => {
    if (!folders || folders.length === 0) return [];
    if (shareRecord && shareRecord.scope === 'collection') {
      const tabId = shareRecord.targetIds[0];
      return folders.filter((f) => f.collectionId === tabId || !f.collectionId);
    }
    const activeFolderIds = new Set(allowedDocuments.map((d) => d.folderId).filter(Boolean));
    return folders.filter((f) => activeFolderIds.has(f.id));
  }, [folders, shareRecord, allowedDocuments]);

  const getDocIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf': return <FileText className="w-3.5 h-3.5 text-[#d93025]" />;
      case 'png': case 'jpg': case 'jpeg': return <ImageIcon className="w-3.5 h-3.5 text-[#1a73e8]" />;
      case 'epub': return <BookOpen className="w-3.5 h-3.5 text-[#9334e6]" />;
      default: return <File className="w-3.5 h-3.5 text-[#5f6368]" />;
    }
  };

  const renderDocCard = (doc: DocumentItem, indent = 0) => {
    const isActive = activeDoc?.id === doc.id;
    let cardStyle = '';
    let badge = null;
    if (doc.status === 'missing' || doc.status === 'disapproved') {
      cardStyle = 'bg-[#fce8e6]/80 border-l-4 border-l-[#ea4335] text-[#d93025]';
      badge = <span className="text-[9px] font-bold uppercase bg-[#d93025] text-white px-1.5 py-0.5 rounded">Missing</span>;
    } else if (doc.status === 'approved') {
      cardStyle = 'bg-[#e6f4ea]/80 border-l-4 border-l-[#34a853] text-[#137333]';
      badge = <span className="text-[9px] font-bold uppercase bg-[#137333] text-white px-1.5 py-0.5 rounded">Approved</span>;
    } else {
      cardStyle = isActive
        ? 'bg-[#e8f0fe] border-l-4 border-l-[#1a73e8]'
        : 'bg-white hover:bg-[#f8fafd] border-l-4 border-l-transparent';
      badge = <span className="text-[9px] font-medium bg-[#f1f3f4] text-[#5f6368] px-1.5 py-0.5 rounded">Uploaded</span>;
    }
    return (
      <div
        key={doc.id}
        onClick={() => { if (doc.hasFile) setActiveDoc(doc); }}
        style={{ paddingLeft: `${indent * 12 + 12}px` }}
        className={`py-2 pr-3 text-left transition-all cursor-pointer border-b border-[#f1f3f4] ${cardStyle}`}
      >
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {getDocIcon(doc.fileType)}
            <p className="text-xs font-semibold truncate leading-tight text-[#202124]" title={doc.name}>{doc.name}</p>
          </div>
          {badge}
        </div>
        {!doc.hasFile && (
          <button
            onClick={(e) => { e.stopPropagation(); setTargetSlotId(doc.id); slotUploadRef.current?.click(); }}
            className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 bg-[#d93025] text-white text-[10px] font-bold rounded"
          >
            <Upload className="w-2.5 h-2.5" />
            <span>Upload Now</span>
          </button>
        )}
      </div>
    );
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredCode.trim().toLowerCase() === shareRecord.passcode.trim().toLowerCase()) {
      setIsUnlocked(true);
      setError(null);
      // Set initial view mode according to shareType
      if (shareRecord.shareType === 'viewer') {
        setActiveViewMode('viewer');
      } else {
        setActiveViewMode('upload_portal');
      }
      const firstWithFile = allowedDocuments.find(d => d.hasFile) || allowedDocuments[0] || null;
      setActiveDoc(firstWithFile);
    } else {
      setError('Invalid 4-digit PIN. Please check with your solicitor.');
    }
  };

  const handleSlotFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && targetSlotId && onUploadClientFile) {
      onUploadClientFile(targetSlotId, e.target.files[0]);
      setTargetSlotId(null);
      if (slotUploadRef.current) {
        slotUploadRef.current.value = '';
      }
    }
  };

  const handleAdditionalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onClientUploadNewDoc) {
      const targetCollectionId = shareRecord.scope === 'collection' ? shareRecord.targetIds[0] : (allowedDocuments[0]?.collectionId || 'tab-app-2024');
      onClientUploadNewDoc(targetCollectionId, e.target.files[0]);
      if (additionalUploadRef.current) {
        additionalUploadRef.current.value = '';
      }
    }
  };

  // 4-Digit Privacy PIN Lock Screen
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#f8fafd] flex flex-col items-center justify-center p-4 select-none">
        <div className="bg-white border border-[#dadce0] rounded-3xl shadow-xl max-w-md w-full p-8 text-center animate-in fade-in zoom-in-95 duration-150">
          {shareRecord.companyLogo ? (
            <img 
              src={shareRecord.companyLogo} 
              alt={shareRecord.companyName} 
              className="w-16 h-16 rounded-2xl mx-auto mb-3 object-cover border border-[#dadce0] shadow-sm"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center mx-auto mb-3 ring-4 ring-blue-50">
              <Lock className="w-8 h-8" />
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e8f0fe] text-[#1a73e8] text-xs font-bold mb-2">
            {shareRecord.shareType === 'uploader' ? (
              <>
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Document Uploader Portal</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Document Viewer Portal</span>
              </>
            )}
          </div>

          <h2 className="font-['Google_Sans',sans-serif] text-xl font-bold text-[#202124]">
            {shareRecord.title}
          </h2>
          <p className="text-xs text-[#5f6368] mt-1 mb-6">
            Enter the <strong>4-digit Privacy PIN</strong> provided by your solicitor to access your portal.
          </p>

          <form onSubmit={handleUnlock} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-[#202124] mb-1.5">
                4-Digit Privacy PIN
              </label>
              <div className="relative flex items-center">
                <Key className="w-4 h-4 text-[#5f6368] absolute left-3.5" />
                <input
                  type="password"
                  maxLength={6}
                  value={enteredCode}
                  onChange={(e) => setEnteredCode(e.target.value)}
                  placeholder="••••"
                  autoFocus
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-[#f8fafd] border border-[#dadce0] focus:bg-white focus:border-[#1a73e8] rounded-xl text-lg font-mono tracking-widest outline-none text-center font-bold text-[#1a73e8]"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs font-medium text-[#d93025] flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-xl font-medium text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <span>Unlock Portal</span>
              <Check className="w-4 h-4" />
            </button>
          </form>

          {onBackToApp && (
            <div className="mt-6 pt-4 border-t border-[#f1f3f4]">
              <button
                onClick={onBackToApp}
                className="text-xs text-[#5f6368] hover:text-[#202124] flex items-center justify-center gap-1.5 mx-auto transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Workspace</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const missingDocsCount = allowedDocuments.filter(d => d.status === 'missing' || d.status === 'disapproved').length;
  const approvedDocsCount = allowedDocuments.filter(d => d.status === 'approved').length;
  const totalDocsCount = allowedDocuments.length;
  const uploadedCount = allowedDocuments.filter(d => d.hasFile).length;
  const progressPercent = totalDocsCount > 0 ? Math.round((uploadedCount / totalDocsCount) * 100) : 100;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden select-none">
      {/* Hidden file inputs */}
      <input
        ref={slotUploadRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.epub,.txt"
        onChange={handleSlotFileChange}
        className="hidden"
      />
      <input
        ref={additionalUploadRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.epub,.txt"
        onChange={handleAdditionalFileChange}
        className="hidden"
      />

      {/* Header with Solicitor Firm Details */}
      <header className="bg-white border-b border-[#dadce0] px-3 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 z-30 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {shareRecord.companyLogo ? (
            <img src={shareRecord.companyLogo} alt="" className="w-9 h-9 rounded-xl object-cover border shadow-xs flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-[#1a73e8] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              <Building className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-['Google_Sans',sans-serif] font-bold text-sm sm:text-base text-[#202124] truncate max-w-[180px] sm:max-w-none">
                {shareRecord.companyName || 'Solicitor Client Portal'}
              </span>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
                shareRecord.shareType === 'uploader'
                  ? 'bg-[#e8f0fe] text-[#1a73e8] border border-[#c2e7ff]'
                  : 'bg-[#fef7e0] text-[#b06000] border border-[#fce8b2]'
              }`}>
                {shareRecord.shareType === 'uploader' ? 'Uploader' : 'Viewer'}
              </span>
            </div>
            <p className="text-[11px] text-[#5f6368] truncate max-w-[220px] sm:max-w-xs">
              {shareRecord.title} • {totalDocsCount} documents
            </p>
          </div>
        </div>

        {/* View Switcher & Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode switch pills */}
          <div className="flex items-center bg-[#f1f3f4] p-0.5 rounded-xl border border-[#dadce0] text-xs font-medium">
            <button
              onClick={() => setActiveViewMode('upload_portal')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                activeViewMode === 'upload_portal'
                  ? 'bg-white text-[#1a73e8] font-bold shadow-xs'
                  : 'text-[#5f6368] hover:text-[#202124]'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span className="hidden xs:inline sm:inline">Upload Portal</span>
              {missingDocsCount > 0 && (
                <span className="bg-[#d93025] text-white text-[10px] px-1.5 rounded-full font-bold">
                  {missingDocsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveViewMode('viewer')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                activeViewMode === 'viewer'
                  ? 'bg-white text-[#1a73e8] font-bold shadow-xs'
                  : 'text-[#5f6368] hover:text-[#202124]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden xs:inline sm:inline">Viewer</span>
            </button>
          </div>

          {allowedDocuments.filter(d => d.hasFile).length > 1 && (
            <button
              onClick={() => exportMultipleDocuments(allowedDocuments, `${shareRecord.title}.zip`)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-lg transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ZIP</span>
            </button>
          )}

          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-lg transition-colors border border-[#dadce0]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Main Workspace</span>
            </button>
          )}
        </div>
      </header>


      {/* Main Content Area */}
      {activeViewMode === 'upload_portal' ? (
        /* DOCUMENT UPLOADER MODE */
        <div className="flex-1 bg-[#f8fafd] overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Solicitor Instruction Card */}
            <div className="bg-white border border-[#dadce0] rounded-3xl p-6 shadow-xs">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-['Google_Sans',sans-serif] text-lg font-bold text-[#202124]">
                    Document Submission Checklist
                  </h3>
                  <p className="text-xs text-[#5f6368] mt-1">
                    Please upload the required documents below for your solicitor to review and certify.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-[#1a73e8]">{progressPercent}% Completed</span>
                  <div className="w-28 h-2 bg-[#e8eaed] rounded-full mt-1.5 overflow-hidden">
                    <div 
                      className="h-full bg-[#1a73e8] transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Status tally chips */}
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#f1f3f4] text-xs">
                {missingDocsCount > 0 ? (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fce8e6] text-[#d93025] font-bold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{missingDocsCount} Documents Pending / Action Required (Red)</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e6f4ea] text-[#137333] font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>All Requested Documents Uploaded!</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e6f4ea] text-[#137333] font-medium">
                  <span>{approvedDocsCount} Approved (Green)</span>
                </span>
              </div>
            </div>

            {/* Checklist of Document Slots */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#5f6368] uppercase tracking-wider px-1">
                Required Documents
              </h4>

              {allowedDocuments.map((doc) => {
                const isMissing = doc.status === 'missing';
                const isDisapproved = doc.status === 'disapproved';
                const isApproved = doc.status === 'approved';

                return (
                  <div
                    key={doc.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isMissing || isDisapproved
                        ? 'bg-[#fce8e6]/80 border-[#ea4335] shadow-xs'
                        : isApproved
                        ? 'bg-[#e6f4ea]/80 border-[#34a853]'
                        : 'bg-white border-[#dadce0]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Document Info */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isMissing || isDisapproved
                            ? 'bg-[#d93025] text-white'
                            : isApproved
                            ? 'bg-[#137333] text-white'
                            : 'bg-[#1a73e8] text-white'
                        }`}>
                          {isMissing ? (
                            <UploadCloud className="w-5 h-5 animate-pulse" />
                          ) : isDisapproved ? (
                            <XCircle className="w-5 h-5" />
                          ) : isApproved ? (
                            <Check className="w-5 h-5 stroke-[2.5]" />
                          ) : (
                            <FileCheck className="w-5 h-5" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h5 className="font-bold text-sm text-[#202124] truncate">
                              {doc.name}
                            </h5>
                            {isMissing && (
                              <span className="text-[10px] font-bold bg-[#d93025] text-white px-2 py-0.5 rounded-full uppercase">
                                Action Needed
                              </span>
                            )}
                            {isDisapproved && (
                              <span className="text-[10px] font-bold bg-[#d93025] text-white px-2 py-0.5 rounded-full uppercase">
                                Re-upload Needed
                              </span>
                            )}
                            {isApproved && (
                              <span className="text-[10px] font-bold bg-[#137333] text-white px-2 py-0.5 rounded-full uppercase">
                                Approved
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-[#5f6368] mt-0.5">
                            {doc.description || `Expected format: ${doc.fileType.toUpperCase()}`}
                          </p>

                          {doc.notes && (
                            <div className="mt-2 p-2 bg-white/80 rounded-lg text-xs text-[#d93025] font-medium border border-[#ea4335]/30">
                              <strong>Solicitor Note:</strong> {doc.notes}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Upload / View Action */}
                      <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                        {(!doc.hasFile || isDisapproved) ? (
                          <button
                            onClick={() => {
                              setTargetSlotId(doc.id);
                              slotUploadRef.current?.click();
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-[#d93025] hover:bg-[#b31412] text-white font-bold text-xs rounded-xl shadow-sm transition-all"
                          >
                            <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>{isDisapproved ? 'Re-upload File' : 'Upload File Now'}</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setActiveDoc(doc);
                                setActiveViewMode('viewer');
                              }}
                              className="px-3 py-1.5 bg-white border border-[#dadce0] hover:bg-[#f8fafd] text-[#202124] text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#1a73e8]" />
                              <span>View Document</span>
                            </button>

                            <button
                              onClick={() => {
                                setTargetSlotId(doc.id);
                                slotUploadRef.current?.click();
                              }}
                              className="p-1.5 text-[#5f6368] hover:text-[#202124] hover:bg-white rounded-lg transition-colors"
                              title="Replace with new file version"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Upload Extra Document Box */}
            <div className="pt-2">
              <button
                onClick={() => additionalUploadRef.current?.click()}
                className="w-full py-4 border-2 border-dashed border-[#dadce0] hover:border-[#1a73e8] rounded-2xl bg-white hover:bg-[#f8fafd] text-[#5f6368] hover:text-[#1a73e8] transition-all flex flex-col items-center justify-center gap-1"
              >
                <Plus className="w-5 h-5 text-[#1a73e8]" />
                <span className="text-xs font-bold text-[#202124]">+ Upload Additional Supporting Document</span>
                <span className="text-[11px] text-[#5f6368]">Supports PDF, PNG, JPG, EPUB</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* DOCUMENT VIEWER MODE */
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 relative">
          {/* Left sidebar: folder tree + search */}
          <aside className="hidden md:flex w-80 bg-white border-r border-[#dadce0] flex-col h-full overflow-y-auto flex-shrink-0">
            {/* Search header */}
            <div className="p-3 bg-[#f8fafd] border-b border-[#dadce0] flex flex-col gap-2 sticky top-0 z-10 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-[#5f6368] uppercase tracking-wider">
                <span>Documents ({filteredDocuments.length})</span>
                {relevantFolders.length > 0 && (
                  <span className="text-[10px] font-semibold text-[#1a73e8] bg-[#e8f0fe] px-2 py-0.5 rounded-full">
                    {relevantFolders.length} Folders
                  </span>
                )}
              </div>
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-[#5f6368] absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter documents..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-[#dadce0] rounded-lg bg-white focus:outline-none focus:border-[#1a73e8] transition-colors"
                />
              </div>
            </div>

            {/* Folder tree / flat list */}
            <div className="flex-1 overflow-y-auto">
              {relevantFolders.length > 0 ? (
                <>
                  {relevantFolders.map((folder) => {
                    const isCollapsed = !!collapsedFolders[folder.id];
                    const colorStyle = getFolderColorStyle(folder.color);
                    const folderDocs = filteredDocuments.filter((d) => d.folderId === folder.id);
                    return (
                      <div key={folder.id} className="border-b border-[#dadce0]">
                        <div
                          onClick={() => toggleFolderCollapse(folder.id)}
                          className="flex items-center justify-between gap-1.5 py-2 px-3 bg-[#f8fafd] hover:bg-[#f1f3f4] cursor-pointer transition-colors select-none"
                        >
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {isCollapsed
                              ? <ChevronRight className="w-3.5 h-3.5 text-[#5f6368] flex-shrink-0" />
                              : <ChevronDown className="w-3.5 h-3.5 text-[#5f6368] flex-shrink-0" />}
                            <div
                              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: colorStyle.bg, color: colorStyle.text }}
                            >
                              <Folder className="w-3 h-3 fill-current" />
                            </div>
                            <span className="text-xs font-bold text-[#202124] truncate">{folder.name}</span>
                          </div>
                          <span className="text-[10px] font-semibold text-[#5f6368] bg-white px-1.5 py-0.5 rounded border border-[#dadce0] flex-shrink-0">
                            {folderDocs.length}
                          </span>
                        </div>
                        {!isCollapsed && (
                          <div>
                            {folderDocs.length === 0
                              ? <div className="px-3 py-2 text-[11px] text-[#5f6368] italic">Empty folder</div>
                              : folderDocs.map((doc) => renderDocCard(doc, 1))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Root-level docs (no folder) */}
                  {(() => {
                    const rootDocs = filteredDocuments.filter(
                      (d) => !d.folderId || !relevantFolders.some((f) => f.id === d.folderId)
                    );
                    if (rootDocs.length === 0) return null;
                    return (
                      <div>
                        <div className="px-3 py-1.5 bg-[#f8fafd] border-b border-[#dadce0] text-[10px] font-bold uppercase tracking-wider text-[#5f6368]">
                          Case Files ({rootDocs.length})
                        </div>
                        {rootDocs.map((doc) => renderDocCard(doc, 0))}
                      </div>
                    );
                  })()}
                </>
              ) : (
                filteredDocuments.map((doc) => renderDocCard(doc, 0))
              )}
            </div>
          </aside>

          {/* Master Viewer Canvas */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Mobile Top Bar to return to checklist */}
            <div className="md:hidden bg-white border-b border-[#dadce0] px-3 py-2 flex items-center justify-between z-30 shadow-xs flex-shrink-0">
              <button
                onClick={() => setActiveViewMode('upload_portal')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#e8f0fe] hover:bg-[#d2e3fc] text-[#1a73e8] rounded-xl text-xs font-bold transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Checklist</span>
              </button>
              <span className="text-xs font-semibold text-[#5f6368] truncate max-w-[170px]">
                {activeDoc?.name || 'Document'}
              </span>
            </div>

            <DocumentViewer
              document={activeDoc}
              onExport={(doc) => exportSingleDocument(doc)}
              onExportAsPdf={(doc) => exportAsPdf(doc)}
              onExportAsJpg={(doc) => exportAsJpg(doc)}
              onShare={() => {}}
              onUpdateStatus={onUpdateStatus}
              isReadOnly={false}
            />
          </div>
        </div>
      )}
    </div>
  );
};
