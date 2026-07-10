interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}

type FetchLike = (url: string, init: FetchInit) => Promise<{ ok: boolean; status: number }>;

const MAX_ATTEMPTS = 4;

export async function uploadDoc(
  appUrl: string,
  apiKey: string,
  source: string,
  fileName: string,
  xml: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<void> {
  const body = JSON.stringify({ source, fileName, xml });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetchImpl(`${appUrl}/api/import/tally`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body,
    });
    if (res.ok) return;
    if (res.status >= 400 && res.status < 500) {
      throw new Error(`upload ${source} failed: ${res.status} (not retried)`);
    }
    if (attempt === MAX_ATTEMPTS) throw new Error(`upload ${source} failed after ${MAX_ATTEMPTS}: ${res.status}`);
    await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100)));
  }
}
