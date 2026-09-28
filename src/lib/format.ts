export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

export function extensionDe(nom: string): string {
  const point = nom.lastIndexOf(".");
  return point === -1 ? "" : nom.slice(point + 1).toUpperCase();
}
