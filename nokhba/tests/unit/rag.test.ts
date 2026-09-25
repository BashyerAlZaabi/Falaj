import { describe, expect, it } from "vitest";
import { chunkText } from "@/ai/rag/chunking";
import { LocalHashEmbedder, cosine } from "@/ai/rag/embeddings";

describe("chunking", () => {
  it("keeps short text as a single ordered chunk", () => {
    const chunks = chunkText("One paragraph.\n\nSecond paragraph.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ order: 0, content: "One paragraph.\n\nSecond paragraph." });
  });

  it("splits long content into bounded chunks with overlap and sequential order", () => {
    const paragraph = "Machine learning models learn patterns from data. ".repeat(20);
    const text = Array.from({ length: 8 }, () => paragraph).join("\n\n");
    const chunks = chunkText(text, { maxTokens: 300, overlapTokens: 40 });
    expect(chunks.length).toBeGreaterThan(2);
    chunks.forEach((c, i) => {
      expect(c.order).toBe(i);
      expect(c.tokenCount).toBeLessThanOrEqual(300 * 1.5 + 1);
      expect(c.content.trim().length).toBeGreaterThan(0);
    });
  });

  it("hard-splits a single oversized paragraph", () => {
    const text = "Sentence number one is here. ".repeat(400);
    const chunks = chunkText(text, { maxTokens: 200 });
    expect(chunks.length).toBeGreaterThan(3);
  });

  it("drops empty input", () => {
    expect(chunkText("   \n\n  ")).toEqual([]);
  });
});

describe("local hash embedder", () => {
  const embedder = new LocalHashEmbedder();

  it("is deterministic and normalised to 256 dimensions", async () => {
    const [a] = await embedder.embed(["neural networks and backpropagation"]);
    const [b] = await embedder.embed(["neural networks and backpropagation"]);
    expect(a).toHaveLength(256);
    expect(a).toEqual(b);
    expect(cosine(a, b)).toBeCloseTo(1, 5);
  });

  it("ranks lexically related text closer than unrelated text", async () => {
    const [query, related, unrelated] = await embedder.embed([
      "gradient descent optimisation for neural networks",
      "how gradient descent updates neural network weights",
      "quarterly revenue and marketing budget planning",
    ]);
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });

  it("handles Arabic text", async () => {
    const [a, b] = await embedder.embed(["الشبكات العصبية والتعلم العميق", "الشبكات العصبية"]);
    expect(cosine(a, b)).toBeGreaterThan(0.2);
  });
});

describe("cosine", () => {
  it("returns 0 for mismatched or empty vectors", () => {
    expect(cosine([], [])).toBe(0);
    expect(cosine([1, 2], [1])).toBe(0);
  });
  it("computes similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
  });
});
