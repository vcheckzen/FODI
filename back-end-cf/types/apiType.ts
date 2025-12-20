declare global {
  interface Env {
    FODI_CACHE?: KVNamespace;
    USERNAME?: string;
    PASSWORD?: string;
  }
}

export interface TokenResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
  refresh_token: string;
  save_time?: number;
}

export interface Resource {
  name: string;
  size: number;
  lastModifiedDateTime: string;
  url?: string;
}

export interface DriveItem extends Resource {
  id?: string;
  file?: {
    mimeType: string;
  };
  folder?: {
    childCount: number;
  };
  '@odata.etag'?: string;
  '@microsoft.graph.downloadUrl'?: string;
  deleted?: any;
  parentReference?: {
    path: string;
  };
}

export interface DriveItemCollection {
  error?: Record<string, string>;
  value: DriveItem[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

export interface PostPayload {
  path: string;
  passwd?: string;
  skipToken?: string;
  orderby?: string;
  files?: UploadPayload[];
}

export interface UploadPayload {
  remotePath: string;
  fileSize: number;
  uploadUrl?: string;
}

export interface BatchReqPayload {
  requests: {
    id: string;
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: Record<string, string>;
  }[];
}

export interface BatchRespData {
  responses: {
    id: string;
    status: number;
    headers: Record<string, string>;
    body: unknown;
  }[];
}

export interface FetchFilesRes {
  parent: string;
  skipToken?: string;
  orderby?: string;
  files: Resource[];
}

export interface DavRes {
  davXml: string | null;
  davStatus: number;
  davHeaders?: Record<string, string> | {};
}

export type DavDepth = '0' | '1' | 'infinity';
export type TokenScope = 'download' | 'list' | 'upload' | 'refresh' | 'children' | 'recursive';
