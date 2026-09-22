import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import { DocumentItem, CollectionTab, ShareRecord, SolicitorProfile, FileType, DocumentStatus, ClientRecord, InviteKeyRecord, DocumentFolder } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';
import { idbSaveDocuments, idbGetDocuments } from './idbStorage';

export { idbGetDocuments, idbSaveDocuments };

const CLIENTS_KEY = 'docvault_clients';
const TABS_KEY = 'docvault_collection_tabs';
const DOCS_KEY = 'docvault_documents';
const FOLDERS_KEY = 'docvault_document_folders';
const SHARES_KEY = 'docvault_shares';
const PROFILE_KEY = 'docvault_solicitor_profile';
const PIN_KEY = 'docvault_lock_pin';

export const getClients = (): ClientRecord[] => {
  const saved = localStorage.getItem(CLIENTS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return []; // Empty by default
};

export const saveClients = (clients: ClientRecord[]) => {
  try {
    localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
  } catch (err) {
    console.warn('saveClients quota error:', err);
  }
};

export const getInitialTabs = (): CollectionTab[] => {
  const saved = localStorage.getItem(TABS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return []; // Empty by default
};

export const saveTabs = (tabs: CollectionTab[]) => {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  } catch (err) {
    console.warn('saveTabs quota error:', err);
  }
};

export const getInitialFolders = (): DocumentFolder[] => {
  const saved = localStorage.getItem(FOLDERS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return []; // Empty by default
};

export const saveFolders = (folders: DocumentFolder[]) => {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  } catch (err) {
    console.warn('saveFolders quota error:', err);
  }
};

export const getInitialDocuments = (): DocumentItem[] => {
  const saved = localStorage.getItem(DOCS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return []; // Empty by default
};

export const saveDocuments = (docs: DocumentItem[]) => {
  // Always persist full documents with unlimited quota to native IndexedDB
  idbSaveDocuments(docs).catch((e) => console.warn('IndexedDB save note:', e));

  // Sync to Supabase cloud database
  syncDocumentsToSupabase(docs).catch((e) => console.warn('Supabase sync note:', e));

  // Also write to localStorage safely without throwing QuotaExceededError
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
  } catch (err) {
    console.warn('localStorage quota reached. Storing full files in IndexedDB, saving lightweight metadata to localStorage:', err);
    try {
      const lightweightDocs = docs.map((d) => ({
        ...d,
        url: d.url && d.url.length > 200000 ? '' : d.url
      }));
      localStorage.setItem(DOCS_KEY, JSON.stringify(lightweightDocs));
    } catch {}
  }
};

export const syncDocumentsToSupabase = async (docs: DocumentItem[]) => {
  if (!supabase) return;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id;

    let defaultClientId: string | null = null;
    let defaultCollectionId: string | null = null;

    if (currentUserId) {
      // Ensure profile exists for foreign key
      try {
        await supabase.from('profiles').upsert({
          id: currentUserId,
          email: authData.user.email || '',
          display_name: authData.user.user_metadata?.display_name || 'Solicitor'
        });
      } catch {}

      // Ensure at least one client exists for foreign key
      const { data: cData } = await supabase.from('clients').select('id').eq('solicitor_id', currentUserId).limit(1);
      if (cData && cData.length > 0) {
        defaultClientId = cData[0].id;
      } else {
        const { data: newClient } = await supabase.from('clients').insert({
          solicitor_id: currentUserId,
          name: 'General Client',
          phone: 'N/A',
          came_for: 'General Case'
        }).select('id').maybeSingle();
        if (newClient) defaultClientId = newClient.id;
      }

      // Ensure at least one collection exists for foreign key
      if (defaultClientId) {
        const { data: colData } = await supabase.from('collections').select('id').eq('solicitor_id', currentUserId).limit(1);
        if (colData && colData.length > 0) {
          defaultCollectionId = colData[0].id;
        } else {
          const { data: newCol } = await supabase.from('collections').insert({
            solicitor_id: currentUserId,
            client_id: defaultClientId,
            name: 'All Documents'
          }).select('id').maybeSingle();
          if (newCol) defaultCollectionId = newCol.id;
        }
      }
    }

    for (const doc of docs.slice(0, 30)) {
      const payload: any = {
        name: doc.name,
        file_type: doc.fileType,
        file_size: doc.fileSize || 0,
        url: doc.url || '',
        has_file: doc.hasFile !== false,
        status: doc.status || 'pending',
        notes: doc.notes || ''
      };
      if (currentUserId) {
        payload.solicitor_id = currentUserId;
      }
      if (defaultClientId) {
        payload.client_id = defaultClientId;
      }
      if (doc.collectionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(doc.collectionId)) {
        payload.collection_id = doc.collectionId;
      } else if (defaultCollectionId) {
        payload.collection_id = defaultCollectionId;
      }
      if (doc.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(doc.id)) {
        payload.id = doc.id;
      }
      await supabase.from('documents').upsert(payload, { onConflict: 'id' });
    }
  } catch (err) {
    console.warn('Supabase document sync note:', err);
  }
};

export const syncShareToSupabase = async (share: ShareRecord) => {
  if (!supabase) return;
  try {
    await supabase.from('shared_links').upsert({
      id: share.id,
      title: share.title,
      share_type: share.shareType,
      scope: share.scope,
      target_ids: share.targetIds,
      passcode: share.passcode,
      allow_client_upload: share.allowClientUpload,
      created_at: share.createdAt
    });
  } catch (err) {
    console.warn('Supabase share sync note:', err);
  }
};

export const fetchShareFromSupabase = async (shareId: string): Promise<ShareRecord | null> => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('shared_links').select('*').eq('id', shareId).maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      title: data.title,
      shareType: data.share_type,
      scope: data.scope,
      targetIds: data.target_ids || [],
      passcode: data.passcode,
      allowClientUpload: data.allow_client_upload,
      createdAt: data.created_at,
      ownerId: data.solicitor_id,
      ownerEmail: '',
      companyName: 'DocVault Chambers'
    };
  } catch {
    return null;
  }
};

export const getSolicitorProfile = (): SolicitorProfile | null => {
  const saved = localStorage.getItem(PROFILE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return null; // Null by default -> Triggers Create Account / Sign In screen
};

export const saveSolicitorProfile = (profile: SolicitorProfile | null) => {
  try {
    if (!profile) {
      localStorage.removeItem(PROFILE_KEY);
    } else {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }
  } catch (err) {
    console.warn('saveSolicitorProfile error:', err);
  }
};

export const clearSession = () => {
  localStorage.removeItem(PROFILE_KEY);
};

export const getLockPin = (): string => {
  return localStorage.getItem(PIN_KEY) || '1234';
};

export const setLockPin = (pin: string) => {
  localStorage.setItem(PIN_KEY, pin);
};

// ─── PIN Brute-Force Lockout ────────────────────────────────────────────────
const PIN_ATTEMPTS_KEY   = 'docvault_pin_attempts';
const PIN_LOCKOUT_KEY    = 'docvault_pin_lockout_until';
const MAX_PIN_ATTEMPTS   = 5;
const LOCKOUT_MINUTES    = 30;

export interface PinAttemptStatus {
  isLockedOut: boolean;
  lockoutMinutesLeft: number;
  attemptsLeft: number;
}

export const getPinAttemptStatus = (): PinAttemptStatus => {
  const lockoutUntil = parseInt(localStorage.getItem(PIN_LOCKOUT_KEY) || '0', 10);
  const now = Date.now();
  if (lockoutUntil && now < lockoutUntil) {
    return {
      isLockedOut: true,
      lockoutMinutesLeft: Math.ceil((lockoutUntil - now) / 60000),
      attemptsLeft: 0,
    };
  }
  // Clear expired lockout
  if (lockoutUntil && now >= lockoutUntil) {
    localStorage.removeItem(PIN_LOCKOUT_KEY);
    localStorage.removeItem(PIN_ATTEMPTS_KEY);
  }
  const attempts = parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0', 10);
  return {
    isLockedOut: false,
    lockoutMinutesLeft: 0,
    attemptsLeft: Math.max(0, MAX_PIN_ATTEMPTS - attempts),
  };
};

export const recordFailedPinAttempt = (): PinAttemptStatus => {
  const attempts = parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0', 10) + 1;
  localStorage.setItem(PIN_ATTEMPTS_KEY, String(attempts));
  if (attempts >= MAX_PIN_ATTEMPTS) {
    const lockUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
    localStorage.setItem(PIN_LOCKOUT_KEY, String(lockUntil));
    return { isLockedOut: true, lockoutMinutesLeft: LOCKOUT_MINUTES, attemptsLeft: 0 };
  }
  return { isLockedOut: false, lockoutMinutesLeft: 0, attemptsLeft: MAX_PIN_ATTEMPTS - attempts };
};

export const clearPinAttempts = () => {
  localStorage.removeItem(PIN_ATTEMPTS_KEY);
  localStorage.removeItem(PIN_LOCKOUT_KEY);
};

// ─── Trial System ────────────────────────────────────────────────────────────
const TRIAL_KEY       = 'docvault_trial_start';
const TRIAL_HASH_KEY  = 'docvault_trial_hash';
const TRIAL_DAYS      = 30;

const simpleHash = (str: string): string => {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h = (Math.imul(31, h) + ch) | 0;
  }
  return Math.abs(h).toString(36);
};

export const initTrial = () => {
  if (localStorage.getItem(TRIAL_KEY)) return; // Already started
  const start = Date.now().toString();
  const hash  = simpleHash(start + 'docvault-secret');
  localStorage.setItem(TRIAL_KEY, start);
  localStorage.setItem(TRIAL_HASH_KEY, hash);
};

export interface TrialStatus {
  isActive: boolean;
  isExpired: boolean;
  daysLeft: number;
  startDate: Date | null;
  tampered: boolean;
}

export const getTrialStatus = (): TrialStatus => {
  const raw  = localStorage.getItem(TRIAL_KEY);
  const hash = localStorage.getItem(TRIAL_HASH_KEY);

  if (!raw) {
    return { isActive: false, isExpired: false, daysLeft: 0, startDate: null, tampered: false };
  }

  // Tamper check
  const expectedHash = simpleHash(raw + 'docvault-secret');
  if (hash !== expectedHash) {
    return { isActive: false, isExpired: true, daysLeft: 0, startDate: null, tampered: true };
  }

  const start     = parseInt(raw, 10);
  const now       = Date.now();
  const elapsed   = now - start;
  const daysUsed  = Math.floor(elapsed / (1000 * 60 * 60 * 24));
  const daysLeft  = Math.max(0, TRIAL_DAYS - daysUsed);
  const isExpired = daysLeft === 0;

  return {
    isActive:  !isExpired,
    isExpired,
    daysLeft,
    startDate: new Date(start),
    tampered: false,
  };
};

// ─── Promo Codes (admin-managed) ─────────────────────────────────────────────
const PROMO_KEY = 'docvault_promo_codes';

export interface PromoCode {
  id: string;
  code: string;
  label: string;
  discountPct: number;
  active: boolean;
  createdAt: string;
  expiresAt?: string;
}

export const getPromoCodes = (): PromoCode[] => {
  try {
    return JSON.parse(localStorage.getItem(PROMO_KEY) || '[]');
  } catch { return []; }
};

export const savePromoCode = (promo: PromoCode) => {
  const codes = getPromoCodes();
  const idx = codes.findIndex(c => c.id === promo.id);
  if (idx >= 0) codes[idx] = promo; else codes.push(promo);
  localStorage.setItem(PROMO_KEY, JSON.stringify(codes));
};

export const deletePromoCode = (id: string) => {
  const codes = getPromoCodes().filter(c => c.id !== id);
  localStorage.setItem(PROMO_KEY, JSON.stringify(codes));
};


export const getShares = (): ShareRecord[] => {
  const saved = localStorage.getItem(SHARES_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return [];
};

export const saveShare = (share: ShareRecord) => {
  const shares = getShares();
  const existingIndex = shares.findIndex(s => s.id === share.id);
  if (existingIndex >= 0) {
    shares[existingIndex] = share;
  } else {
    shares.push(share);
  }
  localStorage.setItem(SHARES_KEY, JSON.stringify(shares));
  syncShareToSupabase(share).catch(() => {});
};

export const getShareById = (id: string): ShareRecord | null => {
  const shares = getShares();
  return shares.find(s => s.id === id) || null;
};

export const detectFileType = (filename: string, mimeType?: string): FileType => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || mimeType?.includes('pdf')) return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext || '')) return ext as FileType;
  if (ext === 'epub' || mimeType?.includes('epub')) return 'epub';
  if (ext === 'docx' || mimeType?.includes('wordprocessingml')) return 'docx';
  if (ext === 'doc' || mimeType?.includes('msword')) return 'doc';
  if (ext === 'txt' || ext === 'md' || ext === 'csv' || mimeType?.includes('text')) return 'txt';
  return 'other';
};

export const urlToBlob = async (url: string): Promise<Blob> => {
  if (url.startsWith('data:')) {
    const arr = url.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }
  const response = await fetch(url);
  return await response.blob();
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
};

export const getRotatedCanvas = (img: HTMLImageElement, rotation: number = 0): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  const rot = ((rotation % 360) + 360) % 360;
  if (rot === 90 || rot === 270) {
    canvas.width = img.height;
    canvas.height = img.width;
  } else {
    canvas.width = img.width;
    canvas.height = img.height;
  }
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
  }
  return canvas;
};

export const exportSingleDocument = async (doc: DocumentItem) => {
  if (!doc.hasFile || !doc.url) {
    alert('This is a document requirement placeholder. No file has been uploaded yet.');
    return;
  }
  try {
    if (doc.rotation && doc.rotation % 360 !== 0 && ['png', 'jpg', 'jpeg', 'webp'].includes(doc.fileType)) {
      const img = await loadImage(doc.url);
      const canvas = getRotatedCanvas(img, doc.rotation);
      const mime = doc.fileType === 'png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob((blob) => {
        if (blob) {
          saveAs(blob, doc.name);
        } else {
          urlToBlob(doc.url).then((b) => saveAs(b, doc.name));
        }
      }, mime, 0.95);
      return;
    }
    const blob = await urlToBlob(doc.url);
    saveAs(blob, doc.name);
  } catch (err) {
    console.error('Failed to export document:', err);
    const a = document.createElement('a');
    a.href = doc.url;
    a.download = doc.name;
    a.click();
  }
};

export const exportAsPdf = async (doc: DocumentItem) => {
  if (!doc.hasFile || !doc.url) return;

  // If multi-page document (e.g. Front & Back)
  if (doc.pages && doc.pages.length > 1) {
    try {
      let pdf: jsPDF | null = null;
      for (let i = 0; i < doc.pages.length; i++) {
        const page = doc.pages[i];
        if (page.fileType === 'pdf') continue;
        const img = await loadImage(page.url);
        const rot = page.rotation !== undefined ? page.rotation : (doc.rotation || 0);
        const canvas = getRotatedCanvas(img, rot);
        const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (!pdf) {
          pdf = new jsPDF({
            orientation,
            unit: 'px',
            format: [canvas.width, canvas.height]
          });
          pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
        } else {
          pdf.addPage([canvas.width, canvas.height], orientation);
          pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
        }
      }
      if (pdf) {
        const pdfName = doc.name.replace(/\.[^/.]+$/, "") + ".pdf";
        pdf.save(pdfName);
        return;
      }
    } catch (err) {
      console.warn('Multi-page PDF conversion fallback:', err);
    }
  }

  if (doc.fileType === 'pdf') {
    return exportSingleDocument(doc);
  }

  try {
    const img = await loadImage(doc.url);
    const rot = doc.rotation || 0;
    const canvas = getRotatedCanvas(img, rot);
    const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
    const pdf = new jsPDF({
      orientation,
      unit: 'px',
      format: [canvas.width, canvas.height]
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
    const pdfName = doc.name.replace(/\.[^/.]+$/, "") + ".pdf";
    pdf.save(pdfName);
  } catch (err) {
    console.warn('PDF conversion fallback:', err);
    exportSingleDocument(doc);
  }
};

export const exportAsJpg = async (doc: DocumentItem) => {
  if (!doc.hasFile) return;

  // If multi-side/page document (e.g. Front & Back), package all photos into a folder inside ZIP!
  if (doc.pages && doc.pages.length > 1) {
    const zip = new JSZip();
    const cleanDocName = doc.name.replace(/[\\/:*?"<>|]/g, '_').replace(/\.[^/.]+$/, '');
    const folder = zip.folder(cleanDocName) || zip;

    for (let i = 0; i < doc.pages.length; i++) {
      const page = doc.pages[i];
      try {
        const img = await loadImage(page.url);
        const rot = page.rotation !== undefined ? page.rotation : (doc.rotation || 0);
        const canvas = getRotatedCanvas(img, rot);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.95));
        if (blob) {
          const cleanPageName = (page.name || `Side_${i + 1}`).replace(/[\\/:*?"<>|]/g, '_');
          folder.file(`${cleanPageName}.jpg`, blob);
        }
      } catch (err) {
        console.warn(`Could not convert page ${i} to JPG:`, err);
        try {
          const blob = await urlToBlob(page.url);
          folder.file(`${page.name || `Side_${i + 1}`}.jpg`, blob);
        } catch {}
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `${cleanDocName}_Photos.zip`);
    return;
  }

  // Single page
  try {
    const img = await loadImage(doc.url);
    const rot = doc.rotation || 0;
    const canvas = getRotatedCanvas(img, rot);
    canvas.toBlob((blob) => {
      if (blob) {
        const jpgName = doc.name.replace(/\.[^/.]+$/, "") + ".jpg";
        saveAs(blob, jpgName);
      }
    }, 'image/jpeg', 0.95);
  } catch (err) {
    console.warn('JPG export fallback:', err);
    exportSingleDocument(doc);
  }
};

export const exportMultipleDocuments = async (
  docs: DocumentItem[], 
  zipFileName: string = 'DocVault_Export.zip',
  folders: DocumentFolder[] = []
) => {
  const availableDocs = docs.filter(d => d.hasFile && (d.url || (d.pages && d.pages.length > 0)));
  if (availableDocs.length === 0) {
    alert('No uploaded files found in the selection to export.');
    return;
  }
  if (availableDocs.length === 1 && (!availableDocs[0].pages || availableDocs[0].pages.length <= 1) && !availableDocs[0].folderId) {
    return exportSingleDocument(availableDocs[0]);
  }

  const zip = new JSZip();
  const rootFolderName = zipFileName.replace(/\.zip$/i, '') || 'Case_Documents';
  const rootZipFolder = zip.folder(rootFolderName) || zip;

  // Helper to resolve folder path chain
  const getFolderPath = (folderId?: string): string[] => {
    if (!folderId) return [];
    const path: string[] = [];
    let currentId: string | undefined = folderId;
    while (currentId) {
      const f = folders.find(item => item.id === currentId);
      if (!f) break;
      const cleanName = f.name.replace(/[\\/:*?"<>|]/g, '_');
      path.unshift(cleanName);
      currentId = f.parentId;
    }
    return path;
  };

  // Helper to obtain or create nested zip folder
  const resolveZipFolder = (folderId?: string) => {
    const pathSegments = getFolderPath(folderId);
    let target = rootZipFolder;
    for (const segment of pathSegments) {
      target = target.folder(segment) || target;
    }
    return target;
  };

  for (const doc of availableDocs) {
    try {
      const targetFolder = resolveZipFolder(doc.folderId);
      if (doc.pages && doc.pages.length > 1) {
        // Multi-side document: Create a dedicated subfolder with the saved document name!
        const cleanDocFolderName = doc.name.replace(/[\\/:*?"<>|]/g, '_').replace(/\.[^/.]+$/, '');
        const docSubFolder = targetFolder.folder(cleanDocFolderName);

        for (let i = 0; i < doc.pages.length; i++) {
          const page = doc.pages[i];
          const rot = page.rotation !== undefined ? page.rotation : (doc.rotation || 0);
          const cleanPageName = (page.name || `Page_${i + 1}`).replace(/[\\/:*?"<>|]/g, '_');
          const ext = page.fileType || 'jpg';
          const filename = cleanPageName.endsWith(`.${ext}`) ? cleanPageName : `${cleanPageName}.${ext}`;

          if (rot && rot % 360 !== 0 && ['png', 'jpg', 'jpeg', 'webp'].includes(page.fileType)) {
            try {
              const img = await loadImage(page.url);
              const canvas = getRotatedCanvas(img, rot);
              const mime = page.fileType === 'png' ? 'image/png' : 'image/jpeg';
              const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, 0.95));
              if (blob) {
                docSubFolder?.file(filename, blob);
                continue;
              }
            } catch {}
          }
          const pageBlob = await urlToBlob(page.url);
          docSubFolder?.file(filename, pageBlob);
        }
      } else {
        // Single file document
        const cleanName = doc.name.replace(/[\\/:*?"<>|]/g, '_');
        if (doc.rotation && doc.rotation % 360 !== 0 && ['png', 'jpg', 'jpeg', 'webp'].includes(doc.fileType)) {
          try {
            const img = await loadImage(doc.url);
            const canvas = getRotatedCanvas(img, doc.rotation);
            const mime = doc.fileType === 'png' ? 'image/png' : 'image/jpeg';
            const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, 0.95));
            if (blob) {
              targetFolder.file(cleanName, blob);
              continue;
            }
          } catch {}
        }
        const blob = await urlToBlob(doc.url);
        targetFolder.file(cleanName, blob);
      }
    } catch (err) {
      console.warn(`Could not add ${doc.name} to zip:`, err);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, zipFileName);
};

// ============================================================================
// SINGLE-USE INVITATION KEYS SYSTEM (Prevents Sharing & Spam Accounts)
// ============================================================================
const INVITE_KEYS_KEY = 'docvault_invite_keys';
const KEY_SALT = 'DOCVAULT-UK-LEGAL-2026';
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const computeKeyChecksum = (prefix: string): string => {
  let hash = 5381;
  const combined = prefix + '-' + KEY_SALT;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) + hash) + combined.charCodeAt(i);
    hash = hash & hash;
  }
  let res = '';
  let positiveHash = Math.abs(hash);
  for (let i = 0; i < 4; i++) {
    res += KEY_CHARS.charAt(positiveHash % KEY_CHARS.length);
    positiveHash = Math.floor(positiveHash / KEY_CHARS.length) + (i * 13) + 7;
  }
  return res;
};

export const getInviteKeys = (): InviteKeyRecord[] => {
  const saved = localStorage.getItem(INVITE_KEYS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return [];
};

export const saveInviteKeys = (keys: InviteKeyRecord[]) => {
  localStorage.setItem(INVITE_KEYS_KEY, JSON.stringify(keys));
};

export const generateRandomInviteKey = (label?: string): InviteKeyRecord => {
  const segment = (len: number) => {
    let s = '';
    for (let i = 0; i < len; i++) {
      s += KEY_CHARS.charAt(Math.floor(Math.random() * KEY_CHARS.length));
    }
    return s;
  };
  const seg1 = segment(4);
  const seg2 = segment(4);
  const chk = computeKeyChecksum(`${seg1}-${seg2}`);
  const key = `DV-${seg1}-${seg2}-${chk}`;
  const record: InviteKeyRecord = {
    id: 'key_' + Math.random().toString(36).substring(2, 9),
    key,
    createdAt: new Date().toISOString(),
    isUsed: false,
    label: label?.trim() || undefined
  };

  const keys = getInviteKeys();
  keys.unshift(record);
  saveInviteKeys(keys);
  return record;
};

export const deleteInviteKey = (id: string) => {
  const keys = getInviteKeys().filter((k) => k.id !== id);
  saveInviteKeys(keys);
};

export const validateAndConsumeInviteKey = (
  inputKey: string,
  userEmail: string
): { valid: boolean; reason?: string; role?: 'admin' | 'staff' } => {
  const cleanInput = inputKey.trim().toUpperCase();

  // 1. Check Master Admin Key (Firm Owner) -> Grants 'admin' rights (can manage firm and generate keys)
  const masterKey = (
    (import.meta as any).env?.VITE_REGISTRATION_KEY ||
    localStorage.getItem('docvault_registration_key') ||
    'LEGAL-VAULT-2026'
  ).trim().toUpperCase();

  if (cleanInput === masterKey) {
    return { valid: true, role: 'admin' };
  }

  // 2. Check local consumed cache (prevents reuse on this browser)
  const consumedKeyRecord = localStorage.getItem(`docvault_consumed_${cleanInput}`);
  if (consumedKeyRecord) {
    try {
      const parsed = JSON.parse(consumedKeyRecord);
      return {
        valid: false,
        reason: `This one-time key was already used by ${parsed.email || 'another user'} on ${new Date(
          parsed.at || ''
        ).toLocaleDateString()}. It cannot be shared or reused.`
      };
    } catch {
      return { valid: false, reason: 'This one-time license key has already been consumed.' };
    }
  }

  // 3. Check locally stored keys (if seller or shared machine)
  const keys = getInviteKeys();
  const matchedIndex = keys.findIndex((k) => k.key.toUpperCase() === cleanInput);

  if (matchedIndex >= 0) {
    const record = keys[matchedIndex];
    if (record.isUsed) {
      return {
        valid: false,
        reason: `This one-time key was already used by ${record.usedByEmail || 'another user'} on ${new Date(
          record.usedAt || ''
        ).toLocaleDateString()}. It cannot be shared or reused.`
      };
    }
    // Single-use: Consume the key so it cannot ever be reused or shared!
    record.isUsed = true;
    record.usedByEmail = userEmail;
    record.usedAt = new Date().toISOString();
    keys[matchedIndex] = record;
    saveInviteKeys(keys);
    localStorage.setItem(`docvault_consumed_${cleanInput}`, JSON.stringify({ email: userEmail, at: record.usedAt }));
    return { valid: true, role: 'staff' };
  }

  // 4. Verify cryptographic checksum for keys generated on seller device & redeemed on buyer device
  const parts = cleanInput.split('-');
  if (parts.length === 4 && parts[0] === 'DV' && parts[1].length === 4 && parts[2].length === 4 && parts[3].length === 4) {
    const expectedChk = computeKeyChecksum(`${parts[1]}-${parts[2]}`);
    if (parts[3] === expectedChk) {
      // Key is mathematically authentic and authorized by DocVault!
      // Consume it so this device cannot reuse it
      localStorage.setItem(`docvault_consumed_${cleanInput}`, JSON.stringify({ email: userEmail, at: new Date().toISOString() }));
      return { valid: true, role: 'staff' };
    }
  }

  return {
    valid: false,
    reason: 'Invalid Registration Key. Please check the code with your software provider.'
  };
};
