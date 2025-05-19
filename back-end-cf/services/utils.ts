export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function postFormData<T>(url: string, data: Record<string, string>): Promise<T> {
  const formData = new FormData();
  for (const key in data) {
    formData.append(key, data[key]);
  }
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  const result = await response.json();
  return result as T;
}
