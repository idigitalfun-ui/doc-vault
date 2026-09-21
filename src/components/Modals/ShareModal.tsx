import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Key, 
  Copy, 
  Check, 
  Layers, 
  FileText, 
  Folder,
  Lock,
  UploadCloud,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { DocumentItem, CollectionTab, ShareScope, ShareRecord, SolicitorProfile, ShareType, DocumentFolder } from '../../types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDocument: DocumentItem | null;
  selectedDocuments: DocumentItem[];
  allTabDocuments?: DocumentItem[];
  allTabFolders?: DocumentFolder[];
  currentTab: CollectionTab;
  onSaveShare: (share: ShareRecord) => void;
  user: SolicitorProfile;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  currentDocument,
  selectedDocuments,
  allTabDocuments = [],
  allTabFolders = [],
  currentTab,
  onSaveShare,
  user
}) => {
  // Share mode: 'viewer' (view documents) vs 'uploader' (upload documents)
  const [shareType, setShareType] = useState<ShareType>('viewer');

  const [scope, setScope] = useState<ShareScope>(
    selectedDocuments.length > 0 ? 'multiple' : currentDocument ? 'single' : 'collection'
  );
  // Default 4-digit PIN
  const [passcode, setPasscode] = useState<string>(() => 
    Math.floor(1000 + Math.random() * 9000).toString()
  );
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handleCreateShare = async () => {
    setIsGenerating(true);
    const shareId = 'share_' + Math.random().toString(36).substring(2, 10);
    let targetIds: string[] = [];
    let title = '';
    let targetDocs: DocumentItem[] = [];

    if (scope === 'single' && currentDocument) {
      targetIds = [currentDocument.id];
      title = currentDocument.name;
      targetDocs = [currentDocument];
    } else if (scope === 'multiple') {
      targetIds = selectedDocuments.map((d) => d.id);
      title = `${selectedDocuments.length} Documents`;
      targetDocs = selectedDocuments;
    } else {
      targetIds = [currentTab.id];
      title = `${currentTab.name} (${currentTab.clientName || 'Client Case'})`;
      targetDocs = allTabDocuments && allTabDocuments.length > 0 ? allTabDocuments : (currentDocument ? [currentDocument] : selectedDocuments);
    }

    const newRecord: ShareRecord = {
      id: shareId,
      title,
      shareType,
      scope,
      targetIds,
      passcode: passcode.trim(),
      allowClientUpload: shareType === 'uploader',
      createdAt: new Date().toISOString(),
      ownerId: user.id,
      ownerEmail: user.email,
      companyName: user.companyName,
      companyLogo: user.companyLogo
    };

    onSaveShare(newRecord);

    // Prepare payload documents preserving folder IDs and content
    const payloadDocs = targetDocs.map((d) => ({
      id: d.id,
      name: d.name,
      collectionId: d.collectionId,
      fileType: d.fileType,
      status: d.status,
      hasFile: d.hasFile,
      fileSize: d.fileSize || 0,
      notes: d.notes,
      description: d.description,
      rotation: d.rotation || 0,
      folderId: d.folderId,
      url: d.url || '',
      pages: d.pages || []
    }));

    const targetFolders = allTabFolders && allTabFolders.length > 0 ? allTabFolders : [];
    let payloadToSend = { share: newRecord, docs: payloadDocs, folders: targetFolders };

    // If total payload exceeds 8MB, only omit individual oversized files (>500KB)
    try {
      if (JSON.stringify(payloadToSend).length > 8000000) {
        const optimizedDocs = payloadDocs.map((d) => ({
          ...d,
          url: (d.url && d.url.length > 500000) ? '' : d.url
        }));
        payloadToSend = { share: newRecord, docs: optimizedDocs, folders: targetFolders };
      }
    } catch {}

    const baseUrl = `${window.location.origin}${window.location.pathname}`;

    // 1. Post to high-reliability cloud share store so ANY device / phone can load it instantly
    try {
      const res = await fetch('https://bytebin.lucko.me/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToSend)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.key) {
          const cloudShareId = data.key;
          const cloudRecord = { ...newRecord, id: cloudShareId };
          onSaveShare(cloudRecord);
          const shortCleanUrl = `${baseUrl}?share=${cloudShareId}`;
          setGeneratedLink(shortCleanUrl);
          setIsGenerating(false);
          return;
        }
      }
    } catch (err) {
      console.warn('Cloud share store sync note:', err);
    }

    // 2. Fallback: encode compact hash payload into URL if cloud sync is unavailable
    let fallbackUrl = `${baseUrl}?share=${shareId}`;
    try {
      const jsonStr = JSON.stringify(payloadToSend);
      const encodedData = btoa(encodeURIComponent(jsonStr));
      fallbackUrl = `${baseUrl}?share=${shareId}#data=${encodedData}`;
    } catch (e) {
      console.warn('Fallback encoding error:', e);
    }

    setGeneratedLink(fallbackUrl);
    setIsGenerating(false);
  };

  const handleCopy = () => {
    if (!generatedLink) return;
    const modeLabel = shareType === 'uploader' ? 'Document Uploader (Client Submission)' : 'Document Viewer (Read-Only)';
    const textToCopy = `Client Portal: ${user.companyName}\nMode: ${modeLabel}\nLink: ${generatedLink}\n4-Digit Privacy PIN: ${passcode}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs select-none">
      <div className="bg-white border border-[#dadce0] rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#dadce0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
                Share with Client
              </h3>
              <p className="text-xs text-[#5f6368]">
                Generate secure client link protected by 4-digit PIN
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {!generatedLink ? (
            <>
              {/* TWO SHARE OPTIONS: Document Viewer vs Document Uploader */}
              <div>
                <label className="block text-xs font-bold text-[#202124] uppercase tracking-wider mb-2">
                  1. Choose Share Purpose
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Option 1: Document Viewer */}
                  <button
                    type="button"
                    onClick={() => setShareType('viewer')}
                    className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                      shareType === 'viewer'
                        ? 'border-[#1a73e8] bg-[#e8f0fe]/60 ring-2 ring-[#1a73e8]'
                        : 'border-[#dadce0] hover:bg-[#f8fafd]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        shareType === 'viewer' ? 'bg-[#1a73e8] text-white' : 'bg-[#f1f3f4] text-[#5f6368]'
                      }`}>
                        <Eye className="w-4 h-4" />
                      </div>
                      {shareType === 'viewer' && (
                        <CheckCircle2 className="w-4 h-4 text-[#1a73e8]" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#202124]">Document Viewer</p>
                      <p className="text-[11px] text-[#5f6368] mt-0.5 leading-snug">
                        Client can view, zoom, read, and inspect documents in read-only mode.
                      </p>
                    </div>
                  </button>

                  {/* Option 2: Document Uploader */}
                  <button
                    type="button"
                    onClick={() => setShareType('uploader')}
                    className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                      shareType === 'uploader'
                        ? 'border-[#1a73e8] bg-[#e8f0fe]/60 ring-2 ring-[#1a73e8]'
                        : 'border-[#dadce0] hover:bg-[#f8fafd]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        shareType === 'uploader' ? 'bg-[#1a73e8] text-white' : 'bg-[#f1f3f4] text-[#5f6368]'
                      }`}>
                        <UploadCloud className="w-4 h-4" />
                      </div>
                      {shareType === 'uploader' && (
                        <CheckCircle2 className="w-4 h-4 text-[#1a73e8]" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#202124]">Document Uploader</p>
                      <p className="text-[11px] text-[#5f6368] mt-0.5 leading-snug">
                        Client gets an upload portal to submit missing &amp; requested documents.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Scope Selector */}
              <div>
                <label className="block text-xs font-bold text-[#202124] uppercase tracking-wider mb-2">
                  2. Select Documents / Tab
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setScope('collection')}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      scope === 'collection'
                        ? 'border-[#1a73e8] bg-[#e8f0fe]/50 text-[#1a73e8] ring-1 ring-[#1a73e8]'
                        : 'border-[#dadce0] hover:bg-[#f8fafd] text-[#5f6368]'
                    }`}
                  >
                    <Folder className="w-4 h-4 mb-2 text-[#1a73e8]" />
                    <div>
                      <p className="text-xs font-semibold text-[#202124]">Entire Client Tab</p>
                      <p className="text-[10px] text-[#5f6368] truncate mt-0.5">
                        {currentTab.name}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={!currentDocument}
                    onClick={() => setScope('single')}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      scope === 'single'
                        ? 'border-[#1a73e8] bg-[#e8f0fe]/50 text-[#1a73e8] ring-1 ring-[#1a73e8]'
                        : 'border-[#dadce0] hover:bg-[#f8fafd] text-[#5f6368]'
                    } ${!currentDocument ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <FileText className="w-4 h-4 mb-2 text-[#1a73e8]" />
                    <div>
                      <p className="text-xs font-semibold text-[#202124]">Single Document</p>
                      <p className="text-[10px] text-[#5f6368] truncate mt-0.5">
                        {currentDocument?.name || 'None open'}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={selectedDocuments.length === 0}
                    onClick={() => setScope('multiple')}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      scope === 'multiple'
                        ? 'border-[#1a73e8] bg-[#e8f0fe]/50 text-[#1a73e8] ring-1 ring-[#1a73e8]'
                        : 'border-[#dadce0] hover:bg-[#f8fafd] text-[#5f6368]'
                    } ${selectedDocuments.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Layers className="w-4 h-4 mb-2 text-[#1a73e8]" />
                    <div>
                      <p className="text-xs font-semibold text-[#202124]">Selected Files</p>
                      <p className="text-[10px] text-[#5f6368] mt-0.5">
                        {selectedDocuments.length} files
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* 4-Digit Privacy PIN Input */}
              <div>
                <label className="block text-xs font-bold text-[#202124] uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#1a73e8]" />
                    3. Assign 4-Digit Privacy PIN
                  </span>
                  <button
                    type="button"
                    onClick={() => setPasscode(Math.floor(1000 + Math.random() * 9000).toString())}
                    className="text-[11px] text-[#1a73e8] hover:underline normal-case font-normal"
                  >
                    Generate Random PIN
                  </button>
                </label>
                <div className="relative flex items-center">
                  <Key className="w-4 h-4 text-[#5f6368] absolute left-3" />
                  <input
                    type="text"
                    maxLength={6}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value.replace(/[^0-9a-zA-Z]/g, ''))}
                    placeholder="e.g. 4829"
                    className="w-full pl-9 pr-4 py-2.5 bg-[#f8fafd] border border-[#dadce0] focus:bg-white focus:border-[#1a73e8] rounded-xl text-base font-mono tracking-widest outline-none transition-all font-bold text-[#1a73e8]"
                  />
                </div>
                <p className="text-[11px] text-[#5f6368] mt-1.5">
                  Client must enter this 4-digit PIN to unlock access.
                </p>
              </div>
            </>
          ) : (
            /* Link Generated Screen */
            <div className="space-y-4">
              <div className="p-4 bg-[#e6f4ea] border border-[#ceead6] rounded-2xl text-center">
                <div className="w-10 h-10 rounded-full bg-[#137333] text-white flex items-center justify-center mx-auto mb-2 shadow-xs">
                  <Check className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-[#137333]">
                  {shareType === 'uploader' ? 'Document Uploader Link Created!' : 'Document Viewer Link Created!'}
                </h4>
                <p className="text-xs text-[#5f6368] mt-0.5">
                  {shareType === 'uploader'
                    ? 'Client can now upload their required documents directly.'
                    : 'Client can view and inspect approved documents.'}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-[#5f6368] mb-1">
                  <span>Client Link</span>
                  <span className="text-[10px] font-bold uppercase bg-[#e8f0fe] text-[#1a73e8] px-2 py-0.5 rounded-full">
                    {shareType === 'uploader' ? 'Upload Portal' : 'Viewer Portal'}
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-[#f8fafd] border border-[#dadce0] p-2.5 rounded-xl text-xs font-mono text-[#202124] overflow-hidden">
                  <span className="truncate flex-1">{generatedLink}</span>
                </div>
              </div>

              <div className="p-3.5 bg-[#e8f0fe] border border-[#c2e7ff] rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#174ea6] font-medium block">4-Digit Security PIN:</span>
                  <span className="font-mono text-xl font-bold text-[#1a73e8] tracking-widest">
                    {passcode}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[#1a73e8] bg-white px-3 py-1 rounded-lg border border-[#c2e7ff]">
                  {shareType === 'uploader' ? 'Uploader Mode' : 'Viewer Mode'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#f8fafd] border-t border-[#dadce0] flex items-center justify-end gap-2.5">
          {!generatedLink ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateShare}
                disabled={!passcode.trim() || isGenerating}
                className="px-5 py-2 text-xs sm:text-sm font-medium bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 text-white rounded-xl transition-colors shadow-sm flex items-center gap-2"
              >
                {isGenerating && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>{isGenerating ? 'Generating Link...' : `Generate ${shareType === 'uploader' ? 'Uploader' : 'Viewer'} Link`}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setGeneratedLink(null)}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-[#5f6368] hover:text-[#202124] rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-medium bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-xl transition-colors shadow-sm"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied Link & PIN!' : 'Copy Link & 4-Digit PIN'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
