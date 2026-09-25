/** Split learning content into overlapping chunks that fit an embedding window. */
export interface Chunk {
  content: string;
  order: number;
  tokenCount: number;
}

const approxTokens = (s: string) => Math.ceil(s.length / 4);

export function chunkText(text: string, { maxTokens = 350, overlapTokens = 40 } = {}): Chunk[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push({ content: current.trim(), order: chunks.length, tokenCount: approxTokens(current) });
  };
  for (const p of paragraphs) {
    if (approxTokens(current + "\n\n" + p) > maxTokens && current) {
      push();
      // keep an overlap tail so context isn't cut mid-idea
      const tail = current.slice(-overlapTokens * 4);
      current = tail + "\n\n" + p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
    // very long single paragraphs: hard-split by sentences
    while (approxTokens(current) > maxTokens * 1.5) {
      const cut = current.lastIndexOf(". ", maxTokens * 4) + 1 || maxTokens * 4;
      const head = current.slice(0, cut);
      current = current.slice(cut);
      chunks.push({ content: head.trim(), order: chunks.length, tokenCount: approxTokens(head) });
    }
  }
  push();
  return chunks;
}
