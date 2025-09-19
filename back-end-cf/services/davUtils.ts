import type { DriveItem } from '../types/apiType';

export function createReturnXml(uriPath: string, davStatus: number, statusText: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
  <d:multistatus xmlns:d="DAV:">
    <d:response>
      <d:href>${uriPath.split('/').map(encodeURIComponent).join('/')}</d:href>
      <d:status>HTTP/1.1 ${davStatus} ${statusText}</d:status>
    </d:response>
  </d:multistatus>`;
}

export function createPropfindXml(parent: string, files: DriveItem[]) {
  const encodedParent = parent.split('/').map(encodeURIComponent).join('/');
  const xmlParts = ['<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:">\n'];

  for (const child of files) {
    xmlParts.push(createResourceXml(encodedParent, child, !child.file));
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
