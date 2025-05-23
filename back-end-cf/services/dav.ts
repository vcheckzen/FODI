import { DriveItem } from '../types/apiType';

export function davPathSplit(filePath: string) {
  filePath = filePath.includes('://') ? decodeURIComponent(new URL(filePath).pathname) : filePath;
  if (!filePath) filePath = '/';
  const isDirectory = filePath.endsWith('/');
  const nomalizePath = isDirectory ? filePath.slice(0, -1) : filePath;
  return {
    parent: nomalizePath.split('/').slice(0, -1).join('/') || '/',
    tail: nomalizePath.split('/').pop(),
    isDirectory: isDirectory,
    path: nomalizePath || '/',
  };
}

export function createReturnXml(uriPath: string, davStatus: number, statusText: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
  <d:multistatus xmlns:d="DAV:">
    <d:response>
      <d:href>${uriPath.split('/').map(encodeURIComponent).join('/')}</d:href>
      <d:status>HTTP/1.1 ${davStatus} ${statusText}</d:status>
    </d:response>
  </d:multistatus>`;
}

export function createPropfindXml(parent: string, files: DriveItem[], isDirectory: boolean) {
  if (parent === '/') parent = '';
  const encodedParent = parent.split('/').map(encodeURIComponent).join('/');
  const xmlParts = ['<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:">\n'];

  if (isDirectory) {
    const directory = {
      name: '',
      size: 0,
      lastModifiedDateTime: new Date().toUTCString(),
    };
    xmlParts.push(createResourceXml(encodedParent, directory, true));
  }

  if (files) {
    for (const file of files) {
      xmlParts.push(createResourceXml(encodedParent, file, !file.file));
    }
  }

  xmlParts.push('</d:multistatus>');
  return xmlParts.join('');
}

function createResourceXml(encodedParent: string, resource: DriveItem, isDirectory: boolean) {
  const encodedName = resource.name ? `/${encodeURIComponent(resource.name)}` : '';
  const modifiedDate = new Date(resource.lastModifiedDateTime).toUTCString();
  return `\n<d:response>
    <d:href>${encodedParent}${encodedName}${isDirectory ? '/' : ''}</d:href>
    <d:propstat>
      <d:prop>
        ${isDirectory ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/>'}
        <d:getcontenttype>${isDirectory ? 'httpd/unix-directory' : 'application/octet-stream'}</d:getcontenttype>
        <d:getcontentlength>${resource.size}</d:getcontentlength>
        <d:getlastmodified>${modifiedDate}</d:getlastmodified>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>\n`;
}
