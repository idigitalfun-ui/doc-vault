export type FileType = 'pdf' | 'png' | 'jpg' | 'jpeg' | 'epub' | 'txt' | 'docx' | 'doc' | 'other';

export type DocumentStatus = 'missing' | 'disapproved' | 'pending' | 'approved';

export type ShareType = 'viewer' | 'uploader'; // Document viewer vs Document uploader

export type ClientPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface ClientRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  cameFor: string; // Purpose: e.g. "Spouse Visa & Settlement", "Indefinite Leave to Remain"
  priority: ClientPriority;
  totalDocCost: number; // Total cost for sending docs / courier / registry fees
  totalAskingAmount: number; // Total solicitor agreed fee
  amountPaid: number; // Amount already paid
  firstVisitDate: string;
  lastVisitDate: string;
  visitCount: number; // e.g. came 4 times
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionTab {
  id: string;
  clientId: string; // Linked client ID
  name: string; // e.g. "Application in 2024", "Wife Application in 2025"
  clientName?: string;
  caseNumber?: string;
  icon?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type FolderColor = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'teal' | 'slate' | 'default';

export interface DocumentFolder {
  id: string;
  collectionId: string; // Linked collection tab
  parentId?: string; // Optional parent folder ID for nested subfolders
  name: string; // e.g. "Bills", "Electricity Bills"
  color?: FolderColor;
  createdAt: string;
  updatedAt?: string;
}

export interface DocumentPage {
  id: string;
  name: string; // e.g. "Front Side", "Back Side", "Page 1", "Page 2"
  url: string;
  fileType: FileType;
  fileSize?: number;
  rotation?: number; // Saved permanent rotation (0, 90, 180, 270)
}

export interface DocumentItem {
  id: string;
  clientId?: string;
  collectionId: string;
  folderId?: string; // Linked folder or subfolder ID (undefined if root level)
  name: string;
  fileType: FileType;
  fileSize: number; // in bytes
  url: string; // Primary URL (Page 1 / Front Side)
  hasFile: boolean; // false if it is a missing document placeholder
  status: DocumentStatus; // 'missing' | 'disapproved' -> Red, 'approved' -> Green, 'pending' -> White
  notes?: string;
  storagePath?: string;
  rotation?: number; // Saved permanent rotation (0, 90, 180, 270)
  createdAt: string;
  updatedAt?: string;
  description?: string;
  uploadedBy?: 'solicitor' | 'client';
  pages?: DocumentPage[]; // Multi-page / multi-sided support (e.g. Front & Back)
}

export type ShareScope = 'single' | 'multiple' | 'collection';

export interface ShareRecord {
  id: string;
  title: string;
  shareType: ShareType; // 'viewer' or 'uploader'
  scope: ShareScope;
  targetIds: string[]; // document IDs or collection ID
  passcode: string; // 4-digit PIN required to view
  allowClientUpload?: boolean;
  createdAt: string;
  expiresAt?: string;
  ownerId: string;
  ownerEmail?: string;
  companyName?: string;
  companyLogo?: string;
  clientId?: string;
}

export interface SolicitorProfile {
  id: string;
  email: string;
  displayName: string;
  companyName: string;
  companyLogo?: string;
  phone?: string;
  address?: string;
  pinCode: string; // 4-digit PIN for session lock
  isDemoMode: boolean;
  role?: 'admin' | 'staff';
}

export type UserProfile = SolicitorProfile;

export interface ViewerState {
  zoom: number; // 1 = 100%
  rotation: number; // 0, 90, 180, 270
  currentPage: number;
  totalPages: number;
  panOffset: { x: number; y: number };
  isPanning: boolean;
}

export type SortField = 'date' | 'name' | 'priority' | 'fee';
export type SortDirection = 'asc' | 'desc';

export interface InviteKeyRecord {
  id: string;
  key: string;
  createdAt: string;
  isUsed: boolean;
  usedByEmail?: string;
  usedAt?: string;
  label?: string;
}
