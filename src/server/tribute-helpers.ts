export function lifeSpanLabel(input: { bornLabel: string; rememberedLabel: string }): string {
  const born = input.bornLabel.replace(/^Born\s*[·.]\s*/i, '').trim();
  const remembered = input.rememberedLabel.replace(/^Remembered\s*[·.]\s*/i, '').trim();
  if (born && remembered) {
    return `${born} – ${remembered}`;
  }
  return born || remembered || '';
}
