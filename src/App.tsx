import React, { useState, useEffect, useMemo } from 'react';
import { 
  CollectionTab, 
  DocumentItem, 
  ShareRecord, 
  SolicitorProfile, 
  FileType, 
  DocumentStatus,
  ClientRecord,
  DocumentFolder,
  FolderColor 
} from './types';
import { 
  getClients,
  saveClients,
  getInitialTabs, 
  saveTabs, 
  getInitialDocuments, 
  saveDocuments, 
  getInitialFolders,
  saveFolders,
  getSolicitorProfile, 
  saveSolicitorProfile, 
  getShares, 
  saveShare,
  exportSingleDocument, 
  exportMultipleDocuments,
  exportAsPdf,
  exportAsJpg,
  detectFileType,
  idbGetDocuments,
  initTrial,
  getTrialStatus,
  getPromoCodes
} from './lib/storage';
import { Header } from './components/Header';
import { CollectionTabs } from './components/CollectionTabs';
import { DocumentList } from './components/DocumentList';
import { DocumentViewer } from './components/Viewer/DocumentViewer';
import { ShareModal } from './components/Modals/ShareModal';
import { LockScreenModal } from './components/Modals/LockScreenModal';
import { AuthModal } from './components/Modals/AuthModal';
import { SharedViewer } from './components/SharedViewer';
import { CompanyDashboard } from './components/CompanyDashboard';
import { NewClientModal } from './components/Modals/NewClientModal';
import { UploadDocumentsModal } from './components/Modals/UploadDocumentsModal';
import { PricingModal } from './components/Modals/PricingModal';
import { AuthScreen } from './components/AuthScreen';
import { ChangePinModal } from './components/Modals/ChangePinModal';
import { DiscountKeysModal } from './components/Modals/DiscountKeysModal';
import { ArrowLeft, ShieldAlert, Sparkles, KeyRound } from 'lucide-react';



export function App() {
  // Check if viewing a shared link (?share=...)
  const [shareParam, setShareParam] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('share');
  });

  // Decode embedded document payload from URL hash (#data=...) for cross-device shared links
  const [sharedPayload] = useState<{ share: ShareRecord; docs: DocumentItem[] } | null>(() => {
    try {
      const hash = window.location.hash;
      if (hash.startsWith('#data=')) {
        const encoded = hash.slice(6); // remove '#data='
        const decoded = JSON.parse(decodeURIComponent(atob(encoded)));
        if (decoded && decoded.share && Array.isArray(decoded.docs)) {
          return decoded as { share: ShareRecord; docs: DocumentItem[] };
        }
      }
    } catch (e) {
      console.warn('Failed to decode shared link payload:', e);
    }
    return null;
  });

  // Cloud share state for cross-device links without local storage
  const [cloudShareData, setCloudShareData] = useState<{ share: ShareRecord; docs: DocumentItem[] } | null>(null);
  const [isLoadingCloudShare, setIsLoadingCloudShare] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('share');
    if (!p) return false;
    const local = getShares().find((s) => s.id === p);
    return !local && !window.location.hash.startsWith('#data=');
  });

  useEffect(() => {
    if (!shareParam) return;
    if (sharedPayload) return;
    const local = getShares().find((s) => s.id === shareParam);
    if (local) return;

    fetch(`https://bytebin.lucko.me/${shareParam}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found in cloud store');
        return res.json();
      })
      .then((data) => {
        if (data && data.share) {
          setCloudShareData(data);
          saveShare(data.share);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch cloud share record:', err);
      })
      .finally(() => {
        setIsLoadingCloudShare(false);
      });
  }, [shareParam, sharedPayload]);

  // Main state - null profile by default prompts Create Account / Sign In
  const [user, setUser] = useState<SolicitorProfile | null>(() => getSolicitorProfile());
  const [clients, setClients] = useState<ClientRecord[]>(() => getClients());
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [tabs, setTabs] = useState<CollectionTab[]>(() => getInitialTabs());
  const [documents, setDocuments] = useState<DocumentItem[]>(() => getInitialDocuments());
  const [folders, setFolders] = useState<DocumentFolder[]>(() => getInitialFolders());
  
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  // Mobile navigation pane: toggle between 'list' and 'viewer' on phones
  const [mobilePane, setMobilePane] = useState<'list' | 'viewer'>('list');

  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOption, setSortOption] = useState<'date' | 'name'>('date');

  // Modals
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isNewClientOpen, setIsNewClientOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isPricingOpen, setIsPricingOpen] = useState<boolean>(false);
  const [isChangePinOpen, setIsChangePinOpen] = useState<boolean>(false);
  const [isDiscountKeysOpen, setIsDiscountKeysOpen] = useState<boolean>(false);

  // Start free trial on first launch
  useEffect(() => { initTrial(); }, []);

  // Trial status & Lockout checks (owner rana.abdullah.inayat@gmail.com is exempt)
  const trial = getTrialStatus();
  const isOwner = user?.email?.toLowerCase() === 'rana.abdullah.inayat@gmail.com';
  const [trialUnlocked, setTrialUnlocked] = useState<boolean>(() => {
    return localStorage.getItem('docvault_trial_unlocked') === 'true';
  });
  const [trialUnlockKey, setTrialUnlockKey] = useState('');
  const [trialUnlockError, setTrialUnlockError] = useState('');

  const handleUnlockTrial = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = trialUnlockKey.trim().toUpperCase();
    const masterKey = 'LEGAL-VAULT-2026';
    const promoCodes = getPromoCodes();
    const match = promoCodes.find(c => c.code === cleanKey && c.active && c.discountPct === 100);

    if (cleanKey === masterKey || cleanKey === 'VIP100' || match) {
      localStorage.setItem('docvault_trial_unlocked', 'true');
      setTrialUnlocked(true);
      setTrialUnlockError('');
    } else {
      setTrialUnlockError('Invalid license or VIP key. Please contact rana.abdullah.inayat@gmail.com');
    }
  };

  // Hydrate full documents from IndexedDB on startup (unlimited storage quota)
  useEffect(() => {
    idbGetDocuments().then((idbDocs) => {
      if (idbDocs && idbDocs.length > 0) {
        setDocuments(idbDocs);
      }
    }).catch((err) => console.warn('IndexedDB initial load note:', err));
  }, []);

  // Sync to localStorage
  useEffect(() => {
    saveClients(clients);
  }, [clients]);

  useEffect(() => {
    saveTabs(tabs);
  }, [tabs]);

  useEffect(() => {
    saveDocuments(documents);
  }, [documents]);

  useEffect(() => {
    saveFolders(folders);
  }, [folders]);

  useEffect(() => {
    saveSolicitorProfile(user);
  }, [user]);

  // Handle URL change
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setShareParam(params.get('share'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Selected client object
  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null;
    return clients.find((c) => c.id === selectedClientId) || null;
  }, [clients, selectedClientId]);

  // Filter tabs for the selected client
  const clientTabs = useMemo(() => {
    if (!selectedClientId) return tabs;
    const filtered = tabs.filter((t) => t.clientId === selectedClientId);
    if (filtered.length === 0) return tabs;
    return filtered;
  }, [tabs, selectedClientId]);

  // Sorted tabs
  const sortedTabs = useMemo(() => {
    return [...clientTabs].sort((a, b) => {
      if (sortOption === 'name') {
        return a.name.localeCompare(b.name);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [clientTabs, sortOption]);

  // Current active collection tab
  const activeTab = useMemo(() => {
    return sortedTabs.find((t) => t.id === activeTabId) || sortedTabs[0] || {
      id: 'default',
      clientId: selectedClientId || 'default',
      name: 'All Documents',
      createdAt: new Date().toISOString()
    };
  }, [sortedTabs, activeTabId, selectedClientId]);

  // Folders under the active tab
  const tabFolders = useMemo(() => {
    return folders.filter((f) => f.collectionId === activeTab.id);
  }, [folders, activeTab.id]);

  // Documents under the active tab
  const tabDocuments = useMemo(() => {
    return documents
      .filter((d) => d.collectionId === activeTab.id)
      .filter((d) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return d.name.toLowerCase().includes(q) || d.fileType.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (sortOption === 'name') {
          return a.name.localeCompare(b.name);
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [documents, activeTab.id, searchQuery, sortOption]);

  // Active document strictly bound to the active tab
  const activeDoc = useMemo(() => {
    if (activeDocId) {
      const matchInTab = tabDocuments.find((d) => d.id === activeDocId);
      if (matchInTab) return matchInTab;
    }
    return tabDocuments.find((d) => d.hasFile) || tabDocuments[0] || null;
  }, [activeDocId, tabDocuments]);

  // Selected document objects
  const selectedDocuments = useMemo(() => {
    return documents.filter((d) => selectedDocIds.includes(d.id));
  }, [documents, selectedDocIds]);

  // Document status counts per tab
  const documentCounts = useMemo(() => {
    const counts: Record<string, { total: number; missing: number; approved: number }> = {};
    clientTabs.forEach((tab) => {
      const tabDocs = documents.filter((d) => d.collectionId === tab.id);
      const missing = tabDocs.filter((d) => d.status === 'missing' || d.status === 'disapproved').length;
      const approved = tabDocs.filter((d) => d.status === 'approved').length;
      counts[tab.id] = {
        total: tabDocs.length,
        missing,
        approved
      };
    });
    return counts;
  }, [clientTabs, documents]);

  // Handle client selection (opens Level 2 document workspace)
  const handleSelectClient = (client: ClientRecord) => {
    setSelectedClientId(client.id);
    setMobilePane('list');
    const clientFirstTab = tabs.find((t) => t.clientId === client.id);
    if (clientFirstTab) {
      setActiveTabId(clientFirstTab.id);
      const firstDoc = documents.find((d) => d.collectionId === clientFirstTab.id);
      setActiveDocId(firstDoc ? firstDoc.id : null);
    } else {
      setActiveTabId('');
      setActiveDocId(null);
    }
  };

  // Add new client
  const handleAddClient = (newClient: ClientRecord) => {
    setClients((prev) => [newClient, ...prev]);
    // Also create their first initial case tab
    const initialTab: CollectionTab = {
      id: 'tab_' + Math.random().toString(36).substring(2, 9),
      clientId: newClient.id,
      name: newClient.cameFor || 'Case Application',
      caseNumber: `${newClient.name.substring(0, 2).toUpperCase()}-2026`,
      icon: 'briefcase',
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setTabs((prev) => [...prev, initialTab]);
    handleSelectClient(newClient);
  };

  const handleDeleteClient = (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this client record and associated case documents?')) {
      setClients((prev) => prev.filter((c) => c.id !== clientId));
      setTabs((prev) => prev.filter((t) => t.clientId !== clientId));
      setDocuments((prev) => prev.filter((d) => d.clientId !== clientId));
      if (selectedClientId === clientId) {
        setSelectedClientId(null);
      }
    }
  };

  const handleQuickShareClient = (client: ClientRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    handleSelectClient(client);
    setIsShareOpen(true);
  };

  // Tab operations
  const handleCreateTab = (name: string) => {
    if (!selectedClientId) return;
    const newTab: CollectionTab = {
      id: 'tab_' + Math.random().toString(36).substring(2, 9),
      clientId: selectedClientId,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setSelectedDocIds([]);
  };

  const handleRenameTab = (tabId: string, newName: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, name: newName, updatedAt: new Date().toISOString() } : t))
    );
  };

  const handleDeleteTab = (tabId: string) => {
    if (clientTabs.length <= 1) return;
    if (confirm('Delete this tab and its documents?')) {
      setTabs((prev) => prev.filter((t) => t.id !== tabId));
      setDocuments((prev) => prev.filter((d) => d.collectionId !== tabId));
      const remaining = clientTabs.filter((t) => t.id !== tabId);
      if (remaining.length > 0) {
        setActiveTabId(remaining[0].id);
      }
    }
  };

  // Document uploads
  const handleUploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newItems: DocumentItem[] = [];

    for (const file of fileArray) {
      const fileType = detectFileType(file.name, file.type);
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      newItems.push({
        id: 'doc_' + Math.random().toString(36).substring(2, 9),
        clientId: selectedClientId || undefined,
        collectionId: activeTab.id,
        name: file.name,
        fileType,
        fileSize: file.size,
        url,
        hasFile: true,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    setDocuments((prev) => [...newItems, ...prev]);
    if (newItems.length > 0) {
      setActiveDocId(newItems[0].id);
    }
  };

  const handleSaveMultiPageDoc = (
    title: string,
    pages: { name: string; file: File; url: string; fileType: FileType; fileSize: number }[],
    status: DocumentStatus
  ) => {
    if (pages.length === 0) return;
    const primary = pages[0];
    const formattedPages = pages.map((p, idx) => ({
      id: 'page_' + Math.random().toString(36).substring(2, 9),
      name: p.name || `Page ${idx + 1}`,
      url: p.url,
      fileType: p.fileType,
      fileSize: p.fileSize
    }));

    const totalSize = pages.reduce((acc, curr) => acc + curr.fileSize, 0);

    const newDoc: DocumentItem = {
      id: 'doc_' + Math.random().toString(36).substring(2, 9),
      clientId: selectedClientId || undefined,
      collectionId: activeTab.id,
      name: title.trim() || primary.file.name,
      fileType: primary.fileType,
      fileSize: totalSize,
      url: primary.url,
      hasFile: true,
      status,
      pages: formattedPages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setActiveDocId(newDoc.id);
    setMobilePane('viewer');
  };

  const handleAddPageToDoc = async (docId: string, pageName: string, file: File) => {
    const fileType = detectFileType(file.name, file.type);
    const url = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });

    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id === docId) {
          const existingPages = doc.pages && doc.pages.length > 0 ? doc.pages : [
            {
              id: 'page_orig_' + Math.random().toString(36).substring(2, 9),
              name: 'Front Side',
              url: doc.url,
              fileType: doc.fileType,
              fileSize: doc.fileSize
            }
          ];
          const newPage = {
            id: 'page_' + Math.random().toString(36).substring(2, 9),
            name: pageName,
            url,
            fileType,
            fileSize: file.size
          };
          return {
            ...doc,
            pages: [...existingPages, newPage],
            fileSize: doc.fileSize + file.size,
            updatedAt: new Date().toISOString()
          };
        }
        return doc;
      })
    );
  };

  const handleBatchUpload = async (files: File[], combineIntoOne: boolean, combinedTitle?: string) => {
    if (files.length === 0) return;

    if (combineIntoOne) {
      const pages: { name: string; file: File; url: string; fileType: FileType; fileSize: number }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileType = detectFileType(file.name, file.type);
        const url = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        pages.push({
          name: i === 0 ? 'Front Side' : i === 1 ? 'Back Side' : `Page ${i + 1}`,
          file,
          url,
          fileType,
          fileSize: file.size
        });
      }
      handleSaveMultiPageDoc(combinedTitle || 'Combined Document', pages, 'pending');
    } else {
      handleUploadFiles(files);
    }
  };

  const handleUploadToFileSlot = async (docId: string, file: File) => {
    const fileType = detectFileType(file.name, file.type);
    const url = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });

    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id === docId) {
          return {
            ...doc,
            name: doc.name.endsWith(`.${fileType}`) ? doc.name : `${doc.name} (${file.name})`,
            fileType,
            fileSize: file.size,
            url,
            hasFile: true,
            status: 'pending',
            updatedAt: new Date().toISOString()
          };
        }
        return doc;
      })
    );
    setActiveDocId(docId);
  };

  const handleCreateDocumentSlot = (title: string, fileType: FileType) => {
    const formattedName = title.includes('.') ? title : `${title}.${fileType}`;
    const newSlot: DocumentItem = {
      id: 'doc_req_' + Math.random().toString(36).substring(2, 9),
      clientId: selectedClientId || undefined,
      collectionId: activeTab.id,
      name: formattedName,
      fileType,
      fileSize: 0,
      url: '',
      hasFile: false,
      status: 'missing', // RED
      notes: 'Required document slot created by solicitor. Action required.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setDocuments((prev) => [newSlot, ...prev]);
  };

  const handleUpdateDocumentStatus = (docId: string, status: DocumentStatus, notes?: string) => {
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id === docId) {
          return {
            ...d,
            status,
            notes: notes !== undefined ? notes : d.notes,
            updatedAt: new Date().toISOString()
          };
        }
        return d;
      })
    );
  };

  const handleRenameDocument = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, name: trimmed, updatedAt: new Date().toISOString() } : d))
    );
  };

  const handleRenamePage = (docId: string, pageIndex: number, newPageName: string) => {
    const trimmed = newPageName.trim();
    if (!trimmed) return;
    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id === docId && doc.pages && doc.pages[pageIndex]) {
          const newPages = [...doc.pages];
          newPages[pageIndex] = { ...newPages[pageIndex], name: trimmed };
          return { ...doc, pages: newPages, updatedAt: new Date().toISOString() };
        }
        return doc;
      })
    );
  };

  const handleUpdateDocumentRotation = (id: string, rotation: number, pageIndex?: number) => {
    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id === id) {
          if (pageIndex !== undefined && doc.pages && doc.pages[pageIndex]) {
            const newPages = [...doc.pages];
            newPages[pageIndex] = { ...newPages[pageIndex], rotation };
            return { ...doc, pages: newPages, updatedAt: new Date().toISOString() };
          }
          return { ...doc, rotation, updatedAt: new Date().toISOString() };
        }
        return doc;
      })
    );
  };

  const handleUpdateDocumentContent = (id: string, updatedUrl: string) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, url: updatedUrl, updatedAt: new Date().toISOString() } : doc))
    );
  };

  const handleDeleteDocument = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this document item?')) {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setSelectedDocIds((prev) => prev.filter((dId) => dId !== id));
      if (activeDocId === id) {
        setActiveDocId(null);
      }
    }
  };

  // Folder operations
  const handleCreateFolder = (name: string, parentId?: string, color: FolderColor = 'blue') => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newFolder: DocumentFolder = {
      id: 'folder_' + Math.random().toString(36).substring(2, 9),
      collectionId: activeTab.id,
      parentId: parentId || undefined,
      name: trimmed,
      color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setFolders((prev) => [...prev, newFolder]);
    return newFolder;
  };

  const handleRenameFolder = (folderId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: trimmed, updatedAt: new Date().toISOString() } : f))
    );
  };

  const handleUpdateFolderColor = (folderId: string, color: FolderColor) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, color, updatedAt: new Date().toISOString() } : f))
    );
  };

  const handleDeleteFolder = (folderId: string) => {
    if (confirm('Delete this folder? Documents inside will be kept and moved to the main tab.')) {
      const getDescendantFolderIds = (id: string): string[] => {
        const directChildren = folders.filter((f) => f.parentId === id);
        let allIds = [id];
        for (const child of directChildren) {
          allIds = allIds.concat(getDescendantFolderIds(child.id));
        }
        return allIds;
      };
      const folderIdsToRemove = getDescendantFolderIds(folderId);

      setFolders((prev) => prev.filter((f) => !folderIdsToRemove.includes(f.id)));
      setDocuments((prev) =>
        prev.map((d) => (d.folderId && folderIdsToRemove.includes(d.folderId) ? { ...d, folderId: undefined, updatedAt: new Date().toISOString() } : d))
      );
    }
  };

  const handleMoveDocToFolder = (docId: string, targetFolderId?: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, folderId: targetFolderId, updatedAt: new Date().toISOString() } : d))
    );
  };

  const handleUploadFilesToFolder = async (files: FileList | File[], folderId?: string) => {
    const fileArray = Array.from(files);
    const newItems: DocumentItem[] = [];

    for (const file of fileArray) {
      const fileType = detectFileType(file.name, file.type);
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      newItems.push({
        id: 'doc_' + Math.random().toString(36).substring(2, 9),
        clientId: selectedClientId || undefined,
        collectionId: activeTab.id,
        folderId: folderId || undefined,
        name: file.name,
        fileType,
        fileSize: file.size,
        url,
        hasFile: true,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    setDocuments((prev) => [...newItems, ...prev]);
    if (newItems.length > 0) {
      setActiveDocId(newItems[0].id);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedDocIds.length === tabDocuments.length) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(tabDocuments.map((d) => d.id));
    }
  };

  const handleToggleSelectDoc = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((dId) => dId !== id) : [...prev, id]
    );
  };

  const handleReorderDocument = (sourceDocId: string, targetDocId: string, position: 'before' | 'after') => {
    setDocuments(prev => {
      const result = [...prev];
      const srcIdx = result.findIndex(d => d.id === sourceDocId);
      if (srcIdx < 0) return prev;
      const targetDoc = result.find(d => d.id === targetDocId);
      const [moved] = result.splice(srcIdx, 1);
      if (targetDoc) {
        moved.folderId = targetDoc.folderId;
      }
      const newTgtIdx = result.findIndex(d => d.id === targetDocId);
      if (newTgtIdx < 0) return prev;
      result.splice(position === 'before' ? newTgtIdx : newTgtIdx + 1, 0, moved);
      saveDocuments(result);
      return result;
    });
  };

  // If viewing a shared link (?share=...)
  if (shareParam) {
    if (isLoadingCloudShare) {
      return (
        <div className="min-h-screen bg-[#f8fafd] flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-150">
          <div className="w-12 h-12 border-4 border-[#1a73e8] border-t-transparent rounded-full animate-spin mb-4" />
          <h2 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
            Connecting to Secured Client Portal...
          </h2>
          <p className="text-xs text-[#5f6368] mt-1">
            Loading required case documents from solicitor vault.
          </p>
        </div>
      );
    }

    // Prefer embedded URL payload (works cross-device), then cloud store, then localStorage
    const shareRecord = sharedPayload?.share || cloudShareData?.share || (getShares().find((s) => s.id === shareParam) ?? null);
    const rawDocs = sharedPayload?.docs || cloudShareData?.docs || documents;
    const rawFolders = (sharedPayload as any)?.folders || (cloudShareData as any)?.folders || folders;

    // Merge document content so local file data is never missing or blank
    const sharedDocs = rawDocs.map((sd) => {
      const localMatch = documents.find((d) => d.id === sd.id || d.name === sd.name);
      if (localMatch && localMatch.url) {
        return {
          ...sd,
          url: localMatch.url,
          pages: (localMatch.pages && localMatch.pages.length > 0) ? localMatch.pages : sd.pages
        };
      }
      return sd;
    });

    return (
      <SharedViewer
        shareRecord={shareRecord}
        documents={sharedDocs}
        folders={rawFolders}
        tabs={tabs}
        onUploadClientFile={handleUploadToFileSlot}
        onClientUploadNewDoc={async (collectionId, file) => {
          const fileType = detectFileType(file.name, file.type);
          const url = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          const newItem: DocumentItem = {
            id: 'doc_client_' + Math.random().toString(36).substring(2, 9),
            name: file.name,
            collectionId,
            fileType,
            fileSize: file.size,
            url,
            hasFile: true,
            status: 'pending',
            uploadedBy: 'client',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          setDocuments((prev) => [newItem, ...prev]);
        }}
        onUpdateStatus={handleUpdateDocumentStatus}
        onBackToApp={() => {
          window.history.pushState({}, '', window.location.pathname);
          setShareParam(null);
        }}
      />
    );
  }

  // If not logged in, show the Create Your Account or Sign In screen
  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={(profile) => {
          setUser(profile);
          saveSolicitorProfile(profile);
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen bg-white flex flex-col selection:bg-[#c2e7ff] selection:text-[#001d35] overflow-hidden">
      {/* Top Header */}
      <Header
        user={user}
        selectedClient={selectedClient}
        onBackToClients={() => {
          setSelectedClientId(null);
          setMobilePane('list');
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onLockSession={() => setIsLocked(true)}
        onOpenShare={() => setIsShareOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenPricing={() => setIsPricingOpen(true)}
        onSignOut={() => {
          if (confirm('Are you sure you want to sign out?')) {
            saveSolicitorProfile(null);
            setUser(null);
          }
        }}
        onChangePinClick={() => setIsChangePinOpen(true)}
        onOpenDiscountKeys={() => setIsDiscountKeysOpen(true)}
        selectedCount={selectedDocIds.length}
        activeDocument={activeDoc}
        onExportSelected={() => exportMultipleDocuments(selectedDocuments, `${activeTab.name}_Selected.zip`, folders)}
        onExportCurrent={() => activeDoc && exportSingleDocument(activeDoc)}
        onExportCurrentAsPdf={() => activeDoc && exportAsPdf(activeDoc)}
        onExportCurrentAsJpg={() => activeDoc && exportAsJpg(activeDoc)}
        onExportAll={() => exportMultipleDocuments(tabDocuments, `${activeTab.name}_Complete.zip`, folders)}
      />

      {/* LEVEL 1: Main Company Page & Clients Directory */}
      {!selectedClient ? (
        <CompanyDashboard
          solicitor={user}
          clients={clients}
          tabs={tabs}
          documents={documents}
          onSelectClient={handleSelectClient}
          onOpenNewClientModal={() => setIsNewClientOpen(true)}
          onDeleteClient={handleDeleteClient}
          onQuickShareClient={handleQuickShareClient}
          onEditCompanyProfile={() => setIsAuthOpen(true)}
        />
      ) : (
        /* LEVEL 2: Client's Case Tabs & Document Vault */
        <>
          {/* Collection Tabs Bar */}
          <CollectionTabs
            tabs={sortedTabs}
            activeTabId={activeTab.id}
            onSelectTab={(id) => {
              setActiveTabId(id);
              setSelectedDocIds([]);
              const firstInTab = documents.find((d) => d.collectionId === id && d.hasFile) || documents.find((d) => d.collectionId === id);
              setActiveDocId(firstInTab ? firstInTab.id : null);
            }}
            onCreateTab={handleCreateTab}
            onRenameTab={handleRenameTab}
            onDeleteTab={handleDeleteTab}
            onShareTab={(tabId) => {
              setActiveTabId(tabId);
              setIsShareOpen(true);
            }}
            documentCounts={documentCounts}
            sortOption={sortOption}
            onToggleSort={() => setSortOption((prev) => (prev === 'date' ? 'name' : 'date'))}
          />

          {/* Document Workspace */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 relative">
            {/* Left Documents List */}
            <div className={`${mobilePane === 'viewer' ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-col border-r border-[#dadce0] bg-white h-full overflow-hidden flex-shrink-0`}>
              <DocumentList
                documents={tabDocuments}
                folders={tabFolders}
                activeDocumentId={activeDocId}
                onSelectDocument={(doc) => {
                  setActiveDocId(doc.id);
                  setMobilePane('viewer');
                }}
                selectedDocIds={selectedDocIds}
                onToggleSelectDoc={handleToggleSelectDoc}
                onToggleSelectAll={handleToggleSelectAll}
                onUploadFiles={handleUploadFiles}
                onUploadToFileSlot={handleUploadToFileSlot}
                onCreateDocumentSlot={handleCreateDocumentSlot}
                onUpdateDocumentStatus={handleUpdateDocumentStatus}
                onDeleteDocument={handleDeleteDocument}
                onShareDocument={(doc, e) => {
                  e.stopPropagation();
                  setActiveDocId(doc.id);
                  setIsShareOpen(true);
                }}
                onExportDocument={(doc, e) => {
                  e.stopPropagation();
                  exportSingleDocument(doc);
                }}
                onOpenUploadModal={() => setIsUploadModalOpen(true)}
                onAddPageToDoc={handleAddPageToDoc}
                onRenameDocument={handleRenameDocument}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onUpdateFolderColor={handleUpdateFolderColor}
                onDeleteFolder={handleDeleteFolder}
                onMoveDocToFolder={handleMoveDocToFolder}
                onUploadFilesToFolder={handleUploadFilesToFolder}
                onReorderDocument={handleReorderDocument}
                tabTitle={activeTab.name}
              />
            </div>

            {/* Master Document Viewer */}
            <div className={`${mobilePane === 'list' ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#f8fafd] h-full overflow-hidden min-h-0`}>
              {/* Mobile Back Button to return to Document List */}
              <div className="md:hidden bg-white border-b border-[#dadce0] px-3 py-2 flex items-center justify-between z-30 shadow-xs flex-shrink-0">
                <button
                  onClick={() => setMobilePane('list')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#e8f0fe] hover:bg-[#d2e3fc] text-[#1a73e8] rounded-xl text-xs font-bold transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Case Files</span>
                </button>
                <span className="text-xs font-semibold text-[#5f6368] truncate max-w-[170px]">
                  {activeDoc?.name || 'Document'}
                </span>
              </div>

              <DocumentViewer
                document={activeDoc}
                onExport={exportSingleDocument}
                onExportAsPdf={exportAsPdf}
                onExportAsJpg={exportAsJpg}
                onShare={() => setIsShareOpen(true)}
                onUpdateStatus={handleUpdateDocumentStatus}
                onAddPageToDoc={handleAddPageToDoc}
                onRenameDocument={handleRenameDocument}
                onRenamePage={handleRenamePage}
                onUpdateDocumentRotation={handleUpdateDocumentRotation}
                onUpdateDocumentContent={handleUpdateDocumentContent}
                isReadOnly={false}
              />
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        currentDocument={activeDoc}
        selectedDocuments={selectedDocuments}
        allTabDocuments={tabDocuments}
        allTabFolders={tabFolders}
        currentTab={activeTab}
        onSaveShare={(share) => saveShare(share)}
        user={user}
      />

      <LockScreenModal
        isLocked={isLocked}
        onUnlock={() => setIsLocked(false)}
        userEmail={user.email}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={user}
        onSaveUser={setUser}
      />

      <NewClientModal
        isOpen={isNewClientOpen}
        onClose={() => setIsNewClientOpen(false)}
        onAddClient={handleAddClient}
      />

      <UploadDocumentsModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSaveMultiPageDoc={handleSaveMultiPageDoc}
        onBatchUploadFiles={handleBatchUpload}
      />

      <PricingModal
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
      />

      <ChangePinModal
        isOpen={isChangePinOpen}
        onClose={() => setIsChangePinOpen(false)}
      />

      <DiscountKeysModal
        isOpen={isDiscountKeysOpen}
        onClose={() => setIsDiscountKeysOpen(false)}
      />

      {/* FOOLPROOF 30-DAY TRIAL EXPIRED LOCKOUT OVERLAY */}
      {trial.isExpired && !isOwner && !trialUnlocked && (
        <div className="fixed inset-0 z-50 bg-[#202124]/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="bg-white border border-[#dadce0] rounded-3xl shadow-2xl max-w-md w-full p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#fce8e6] text-[#d93025] flex items-center justify-center mb-4 ring-4 ring-red-50">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <h2 className="font-['Google_Sans',sans-serif] text-xl font-bold text-[#202124]">
              30-Day Free Trial Ended
            </h2>
            <p className="text-xs text-[#5f6368] mt-2 leading-relaxed">
              Your 30-day evaluation period for DocVault has concluded. All client case files and documents remain completely safe and encrypted in your local vault.
            </p>

            <div className="w-full mt-6 space-y-3">
              <button
                type="button"
                onClick={() => setIsPricingOpen(true)}
                className="w-full py-3 px-4 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-semibold text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Choose a Subscription Plan (PayPal)</span>
              </button>

              <form onSubmit={handleUnlockTrial} className="mt-4 pt-4 border-t border-[#f1f3f4] space-y-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#5f6368] text-left">
                  Have a VIP or License Key?
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={trialUnlockKey}
                    onChange={(e) => {
                      setTrialUnlockKey(e.target.value.toUpperCase());
                      setTrialUnlockError('');
                    }}
                    placeholder="e.g. VIP100 or License Key"
                    className="flex-1 px-3 py-2 text-xs font-mono uppercase font-bold border border-[#dadce0] rounded-xl focus:outline-none focus:border-[#1a73e8]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#202124] hover:bg-black text-white text-xs font-semibold rounded-xl transition-colors"
                  >
                    Unlock
                  </button>
                </div>
                {trialUnlockError && (
                  <p className="text-xs text-[#d93025] text-left">{trialUnlockError}</p>
                )}
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-[#f1f3f4] text-xs text-[#5f6368]">
              Contact administrator:{' '}
              <a href="mailto:rana.abdullah.inayat@gmail.com" className="text-[#1a73e8] font-medium hover:underline">
                rana.abdullah.inayat@gmail.com
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default App;
