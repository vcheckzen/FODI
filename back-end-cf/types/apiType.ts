import { env as globalEnv } from 'cloudflare:workers';

declare global {
  interface Env {
    FODI_CACHE?: KVNamespace;
    WEBDAV?: string;
  }
}

const localEnv = {} as Env;
export const OAUTH = globalEnv.OAUTH || localEnv.OAUTH;
export const PROTECTED = globalEnv.PROTECTED || localEnv.PROTECTED;
export const FODI_CACHE = globalEnv.FODI_CACHE;

export interface AccessTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
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
