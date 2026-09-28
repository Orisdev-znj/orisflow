export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

export function extensionDe(nom: string): string {
  const point = nom.lastIndexOf(".");
  return point === -1 ? "" : nom.slice(point + 1).toUpperCase();
}

/**
 * Nettoie un message d'erreur venu d'un appel IPC Electron.
 * Electron préfixe toujours l'erreur d'un handler avec
 * « Error invoking remote method 'canal': Error: … » et y ajoute une pile
 * d'appels : on ne garde que la phrase utile, écrite pour un comptable.
 */
export function nettoyerErreur(erreur: unknown): string {
  let message = erreur instanceof Error ? erreur.message : String(erreur);
  message = message.replace(/^Error invoking remote method '[^']*':\s*/i, "");
  message = message.replace(/^Error:\s*/i, "");
  const sautDeLigne = message.indexOf("\n");
  if (sautDeLigne !== -1) message = message.slice(0, sautDeLigne);
  return message.trim() || "Une erreur inattendue est survenue.";
}
