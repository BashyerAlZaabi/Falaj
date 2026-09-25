import "server-only";
import type { EmbeddingProvider } from "../types";
import { getAiSettings } from "../config";

/**
 * Local embedder: deterministic hashed bag-of-words + character n-grams (256 dims).
 * Works offline for demos/tests; lexical rather than semantic, but keeps the whole RAG
 * pipeline functional. Swap for OpenAI or Voyage embeddings in settings.
 */
export class LocalHashEmbedder implements EmbeddingProvider {
  readonly id = "local-hash";
  readonly dimensions = 256;

  private hash(s: string) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  private tokens(text: string) {
    const norm = text.toLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ");
    const words = norm.split(/\s+/).filter((w) => w.length > 1);
    const grams: string[] = [];
    for (const w of words) {
      grams.push(`w:${w}`);
      for (let i = 0; i + 3 <= w.length; i++) grams.push(`g:${w.slice(i, i + 3)}`);
    }
    for (let i = 0; i + 1 < words.length; i++) grams.push(`b:${words[i]}_${words[i + 1]}`);
    return grams;
  }

  async embed(texts: string[]) {
    return texts.map((t) => {
      const v = new Array<number>(this.dimensions).fill(0);
      for (const g of this.tokens(t)) {
        const h = this.hash(g);
        v[h % this.dimensions] += (h & 1) === 0 ? 1 : -1;
      }
      const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
  }
}

class HttpEmbedder implements EmbeddingProvider {
  constructor(readonly id: string, readonly dimensions: number, private url: string, private key: string, private model: string) {}
  async embed(texts: string[]) {
    const res = await fetch(this.url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}` }, body: JSON.stringify({ model: this.model, input: texts }) });
    if (!res.ok) throw new Error(`Embedding endpoint ${res.status}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }
}

export async function getEmbedder(): Promise<EmbeddingProvider> {
  const s = await getAiSettings();
  if (s.embeddingProvider === "openai" && process.env.OPENAI_API_KEY) return new HttpEmbedder("openai", 1536, `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/embeddings`, process.env.OPENAI_API_KEY, process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small");
  if (s.embeddingProvider === "voyage" && process.env.VOYAGE_API_KEY) return new HttpEmbedder("voyage", 1024, "https://api.voyageai.com/v1/embeddings", process.env.VOYAGE_API_KEY, process.env.VOYAGE_MODEL || "voyage-3");
  return new LocalHashEmbedder();
}

export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
