export function toPgVector(values: number[]) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Embedding vector is empty");
  }

  const normalizedValues = values.map((value) => {
    if (!Number.isFinite(value)) {
      throw new Error("Embedding vector contains non-finite values");
    }

    return Number(value.toFixed(8));
  });

  return `[${normalizedValues.join(",")}]`;
}
