import { env as workerEnv } from 'cloudflare:workers';

declare global {
  interface Env {
    FODI_CACHE?: KVNamespace;
    WEBDAV?: string;
  }
}

export const runtimeEnv = workerEnv;

export interface TokenResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
  refresh_token: string;
}

export interface AccessTokenResponse extends TokenResponse {
  save_time: number;
}

export interface Resource {
  name: string;
  size: number;
  lastModifiedDateTime: string;
  url?: string;
}

export interface DriveItem extends Resource {
  file?: {
    mimeType: string;
  };
  folder?: {
    childCount: number;
  };
  '@odata.nextLink'?: string;
  '@microsoft.graph.downloadUrl'?: string;
  error?: string;
  value?: DriveItem[];
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
    headers: Record<string, string>;
    body: Record<string, string> | {};
  }[];
}

export interface BatchRespData {
  responses: {
    id: string;
    status: number;
    headers: Record<string, string>;
    body: Record<string, string>;
  }[];
}

export interface fetchFilesRes {
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
