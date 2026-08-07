export type ReadingChunk = { text: string; from: number; to: number };

/** 원문을 바꾸지 않고 대사 따옴표를 존중해 문장 단위로 나눈다. */
export function splitStorySentences(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    cur += text[i];
    if (!".!?。".includes(text[i])) continue;

    let quoted = false;
    while (i + 1 < text.length && `"'”’」』)`.includes(text[i + 1])) {
      cur += text[++i];
      quoted = true;
    }
    if (quoted && i + 1 < text.length) continue;

    while (i + 1 < text.length && /\s/.test(text[i + 1])) cur += text[++i];
    out.push(cur);
    cur = "";
  }
  if (cur) out.push(cur);
  return out.length > 0 ? out : [text];
}

/** 꽉 찬 그림 낭독용: 긴 문장은 쉼표·공백 가까이에서 최대 2줄 분량으로 더 나눈다. */
export function readingChunks(text: string, maxChars = 44): ReadingChunk[] {
  const pieces: string[] = [];
  for (const sentence of splitStorySentences(text)) {
    let rest = sentence;
    while (rest.length > maxChars) {
      const minimum = Math.floor(maxChars * 0.55);
      let cut = maxChars;
      for (let i = maxChars; i >= minimum; i--) {
        if (/[\s,，、;:…]/.test(rest[i - 1])) {
          cut = i;
          break;
        }
      }
      pieces.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) pieces.push(rest);
  }

  let from = 0;
  return pieces.map((piece) => {
    const chunk = { text: piece, from, to: from + piece.length };
    from = chunk.to;
    return chunk;
  });
}

export function currentReadingChunk(text: string, highlight: number): ReadingChunk {
  const chunks = readingChunks(text);
  return chunks.find((chunk) => highlight < chunk.to) ?? chunks[chunks.length - 1] ?? { text, from: 0, to: text.length };
}
