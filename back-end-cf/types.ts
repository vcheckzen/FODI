import { env as globalEnv } from 'cloudflare:workers';

export const OAUTH = globalEnv.OAUTH;
export const PROTECTED = globalEnv.PROTECTED;
export const FODI_CACHE = globalEnv.FODI_CACHE;

export interface Env {
  PROTECTED: {
    EXPOSE_PATH: string;
    PASSWD_FILENAME: string;
    PROTECTED_LAYERS: number;
    PROXY_KEYWORD: string;
  };
  OAUTH: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    loginHost: string;
    oauthUrl: string;
    apiHost: string;
    apiUrl: string;
    scope: string;
  };
  CACHE_TTLMAP: {
    GET: number;
    POST: number;
    [key: string]: number;
  };
  WEBDAV?: string;
  FODI_CACHE?: KVNamespace;
}

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
