import type { DriveItem, DriveItemCollection, DavDepth } from '../types/apiType';
import { runtimeEnv } from '../types/env';
import { fetchWithAuth, fetchBatchRes } from './fetchUtils';
import { getSaveDelta } from './utils';
import { createReturnXml, createPropfindXml, uploadChunk } from './davUtils';
import { parsePath, buildUriPath } from './pathUtils';

export const davClient = {
  handlePropfind,
  handleCopyMove,
  handleDelete,
  handleHead,
  handleMkcol,
  handlePut,
};

async function handlePropfind(filePath: string, depth: DavDepth) {
  const { path, parent } = parsePath(filePath);
  let data: DriveItemCollection = { value: [] };
  let selfEntry: DriveItem = {
    name: '',
    size: 0,
    lastModifiedDateTime: new Date().toISOString(),
  };

  // Root folder with depth 0, no need to fetch items
  if (path === '' && depth === '0') {
    return { davXml: createPropfindXml('', [selfEntry]), davStatus: 207 };
  }

  const savedData = await getSaveDelta(path);
  const itemPathWrapped = buildUriPath(path, runtimeEnv.PROTECTED.EXPOSE_PATH, '');
  const baseEndpoint = `/me/drive/root${itemPathWrapped}`;
  const select = '?select=id,name,size,lastModifiedDateTime,file,@odata.etag';
  const reqUrl = new URL(
    savedData?.['@odata.nextLink'] ??
      savedData?.['@odata.deltaLink'] ??
      `${runtimeEnv.OAUTH.apiUrl}${itemPathWrapped}/children${select}&top=1000`,
  );
  const reqEndpoint = (reqUrl.pathname + reqUrl.search).replace('v1.0', '');

  const createBatchRequest = (endpoints: string[]) => ({
    requests: endpoints.map((endpoint, index) => ({
      id: (index + 1).toString(),
      method: 'GET',
      url: endpoint,
    })),
  });

  const batchRequest = createBatchRequest([baseEndpoint + select, reqEndpoint]);
  const batchResult = await fetchBatchRes(batchRequest);

  for (const resp of batchResult.responses) {
    if (resp.status !== 200) {
      return {
        davXml: createReturnXml(filePath, resp.status, 'Failed to fetch files'),
        davStatus: resp.status,
      };
    }

    if (resp.id === '1') {
      selfEntry = resp.body as DriveItem;
      selfEntry.name = selfEntry.file ? selfEntry.name : '';
    } else {
      data = resp.body as DriveItemCollection;
    }
  }

  // children endpoint results
  if (savedData?.['@odata.nextLink'] || data['@odata.nextLink']) {
    data.value = [...(savedData?.value || []), ...data.value];
    await getSaveDelta(path, data);
  }

  // nextlink fetch finished, init delta link
  if (savedData && !data['@odata.nextLink'] && !data['@odata.deltaLink']) {
    const deltaPrams = `${select},parentReference,deleted&token=latest`;
    const deltaUrl =
      buildUriPath(path, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl) +
      `/delta${deltaPrams}`;
    const newDeltaResp = await fetchWithAuth(deltaUrl);
    if (!newDeltaResp.ok) {
      return {
        davXml: createReturnXml(filePath, newDeltaResp.status, 'Failed to fetch delta'),
        davStatus: newDeltaResp.status,
      };
    }
    const newDeltaJson: DriveItemCollection = await newDeltaResp.json();
    newDeltaJson.value = [...data.value];
    await getSaveDelta(path, newDeltaJson);
  }

  // fetch delta data
  if (savedData && data['@odata.deltaLink']) {
    data.value.shift();
    const mergedMap = new Map(savedData?.value.map((item) => [item.id, item]));
    for (const item of data.value) {
      const itemParentPath = item?.parentReference?.path?.replace(`/drive/root:`, '');
      // not direct child, skip
      if (itemParentPath && itemParentPath !== path) {
        continue;
      }

      item.parentReference = undefined;
      if (item.deleted) {
        mergedMap.delete(item.id);
      } else {
        mergedMap.set(item.id, item);
      }
    }
    data.value = Array.from(mergedMap.values());
    await getSaveDelta(path, data);
  }

  data.value.unshift(selfEntry);
  const propfindPath = data.value[0]?.file ? parent : path;
  const responseXML = createPropfindXml(propfindPath, data.value);
  return { davXml: responseXML, davStatus: 207 };
}

async function handleCopyMove(filePath: string, method: 'COPY' | 'MOVE', destination: string) {
  const { parent: newParent, tail: newTail } = parsePath(destination);
  const uri =
    buildUriPath(filePath, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl) +
    (method === 'COPY' ? '/copy' : '');

  const resp = await fetchWithAuth(uri, {
    method: method === 'COPY' ? 'POST' : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: newTail,
      parentReference: {
        path: `/drive/root:${runtimeEnv.PROTECTED.EXPOSE_PATH}${newParent}`,
      },
    }),
  });

  const davStatus = resp.status === 200 ? 201 : resp.status;
  const responseXML =
    davStatus === 201 ? null : createReturnXml(filePath, davStatus, resp.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

async function handleDelete(filePath: string) {
  const uri = buildUriPath(filePath, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl);
  const res = await fetchWithAuth(uri, { method: 'DELETE' });
  const davStatus = res.status;
  const responseXML =
    davStatus === 204 ? null : createReturnXml(filePath, davStatus, res.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

async function handleHead(filePath: string) {
  const uri = [
    buildUriPath(filePath, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl),
    '?select=size,file,folder,lastModifiedDateTime',
  ].join('');
  const resp = await fetchWithAuth(uri);
  const data: DriveItem = await resp.json();

  return {
    davXml: null,
    davStatus: data?.folder ? 403 : resp.status,
    davHeaders: data?.file
      ? {
          'Content-Length': data.size.toString(),
          'Content-Type': data.file.mimeType,
          'Last-Modified': new Date(data.lastModifiedDateTime).toUTCString(),
        }
      : {},
  };
}

async function handleMkcol(filePath: string) {
  const { parent, tail } = parsePath(filePath);
  const uri =
    buildUriPath(parent, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl) + '/children';

  const res = await fetchWithAuth(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: tail,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'replace',
    }),
  });

  const davStatus = res.status === 200 ? 201 : res.status;
  const responseXML =
    davStatus === 201 ? null : createReturnXml(filePath, davStatus, res.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

async function handlePut(filePath: string, request: Request) {
  const simpleUploadLimit = 4 * 1024 * 1024; // 4MB
  const chunkSize = 60 * 1024 * 1024;
  const contentLength = request.headers.get('Content-Length') || '0';
  const fileSize = parseInt(contentLength);

  if (fileSize <= simpleUploadLimit) {
    const body = await request.arrayBuffer();
    const uri =
      buildUriPath(filePath, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl) +
      '/content';
    const res = await fetchWithAuth(uri, { method: 'PUT', body });

    const davXml = res.ok ? null : createReturnXml(filePath, res.status, res.statusText);
    const davStatus = res.status === 200 ? 204 : res.status;
    return { davXml, davStatus };
  }

  const uri =
    buildUriPath(filePath, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl) +
    '/createUploadSession';
  const uploadSessionRes = await fetchWithAuth(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item: { '@microsoft.graph.conflictBehavior': 'replace' },
    }),
  });

  const { uploadUrl } = (await uploadSessionRes.json()) as { uploadUrl: string };
  const reader = request.body!.getReader();
  let uploadedBytes = 0;
  let buffer = new Uint8Array(chunkSize);
  let bufferOffset = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        // 如果剩余空间不足，先上传已有的，再写入新数据
        let vOffset = 0;
        while (vOffset < value.length) {
          const space = chunkSize - bufferOffset;
          const copySize = Math.min(space, value.length - vOffset);

          buffer.set(value.subarray(vOffset, vOffset + copySize), bufferOffset);
          bufferOffset += copySize;
          vOffset += copySize;

          if (bufferOffset === chunkSize) {
            // 满块 -> 上传
            const chunk = buffer.subarray(0, bufferOffset);
            const contentRange = `bytes ${uploadedBytes}-${uploadedBytes + bufferOffset - 1}/${fileSize}`;
            const res = await uploadChunk(uploadUrl, chunk, contentRange);
            if (!res.ok) {
              return {
                davXml: createReturnXml(filePath, res.status, 'Upload failed'),
                davStatus: res.status,
              };
            }
            uploadedBytes += bufferOffset;
            bufferOffset = 0; // 清空缓冲
          }
        }
      }

      if (done) {
        if (bufferOffset > 0) {
          // 上传最后不足 60MB 的部分
          const chunk = buffer.subarray(0, bufferOffset);
          const contentRange = `bytes ${uploadedBytes}-${uploadedBytes + bufferOffset - 1}/${fileSize}`;
          const res = await uploadChunk(uploadUrl, chunk, contentRange);
          if (!res.ok) {
            return {
              davXml: createReturnXml(filePath, res.status, 'Upload failed'),
              davStatus: res.status,
            };
          }
        }
        break;
      }
    }

    return { davXml: null, davStatus: 201 };
  } catch (error) {
    return {
      davXml: createReturnXml(filePath, 500, `Upload error: ${error}`),
      davStatus: 500,
    };
  } finally {
    reader.releaseLock();
  }
}
