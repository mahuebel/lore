const DAEMON_URL = 'http://localhost:37778';

export async function readStdin(): Promise<any> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve({}); return; }
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
    setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString()) : {});
    }, 3000);
  });
}

export async function daemonRequest(method: string, path: string, body?: any, timeoutMs = 5000): Promise<any> {
  try {
    const resp = await fetch(`${DAEMON_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return resp.json();
  } catch {
    return null; // daemon not running, silently fail
  }
}

export function output(data: any): never {
  console.log(JSON.stringify(data));
  process.exit(0);
}
