import type { DriveItem, DavDepth } from '../types/apiType';

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
        ${isDirectory ? '' : `<d:getetag>${resource.eTag}</d:getetag>`}
        <d:getcontenttype>${isDirectory ? 'httpd/unix-directory' : resource.file!.mimeType}</d:getcontenttype>
        <d:getcontentlength>${isDirectory ? 0 : resource.size}</d:getcontentlength>
        <d:getlastmodified>${modifiedDate}</d:getlastmodified>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>\n`;
}

export async function uploadChunk(uploadUrl: string, chunk: Uint8Array, contentRange: string) {
  const maxRetries = 3;
  const retryDelay = 1000;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        body: chunk as unknown as BodyInit,
        headers: {
          'Content-Length': chunk.byteLength.toString(),
          'Content-Range': contentRange,
        },
      });

      if (res.status >= 500 || res.status === 429) {
        attempt++;
        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      return res;
    } catch (error) {
      attempt++;
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return new Response(null, {
        status: 500,
        statusText: `Upload failed after ${maxRetries} attempts: ${error}`,
      });
    }
  }

  return new Response(null, { status: 500, statusText: 'Max retries exceeded' });
}

export function parseDepth(value: unknown): DavDepth {
  if (value === '0' || value === '1') {
    return value;
  }
  return '1';
}
