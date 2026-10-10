import { useState } from "react";
import { CAS_USAGE, type IdCas } from "../lib/cloudbankCas";
import { nettoyerErreur } from "../lib/format";
import type { FichierImporte, ResultatEcritureCloudBank, ResultatImportMapping } from "../lib/types";
import EcranCloudBankCasUsage from "./EcranCloudBankCasUsage";
import EcranCloudBankImporter from "./EcranCloudBankImporter";
import EcranCloudBankMapping from "./EcranCloudBankMapping";
import EcranCloudBankResultats from "./EcranCloudBankResultats";

type Onglet = "cas" | "importer" | "mapping" | "resultats";

const ONGLETS: { id: Onglet; libelle: string }[] = [
  { id: "cas", libelle: "Cas d'usage" },
  { id: "importer", libelle: "Importer" },
  { id: "mapping", libelle: "Mapping" },
  { id: "resultats", libelle: "Résultats" },
];

/** « Téléverser sur CloudBank » : module autonome à navigation interne (comme Suivi Courrier).
 * Claude lit le document et propose le mapping, hors d'Orisflow ; Orisflow confirme puis produit
 * le fichier. Aucune règle comptable dans l'interface : elles vivent dans le moteur. */
export default function EcranCloudBank() {
  const [onglet, setOnglet] = useState<Onglet>("cas");
  const [casId, setCasId] = useState<IdCas | null>(null);
  const [valeursPrompt, setValeursPrompt] = useState<Record<string, string>>({});
  const [importDebloque, setImportDebloque] = useState(false);
  const [fichier, setFichier] = useState<FichierImporte | null>(null);
  const [donnees, setDonnees] = useState<ResultatImportMapping | null>(null);
  const [resultat, setResultat] = useState<ResultatEcritureCloudBank | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  // Chaque nouvel import repart d'un mapping vierge (les décisions de l'écran sont locales).
  const [versionImport, setVersionImport] = useState(0);

  const cas = CAS_USAGE.find((c) => c.id === casId) ?? null;
  const actif: Record<Onglet, boolean> = {
    cas: true,
    importer: importDebloque && cas !== null,
    mapping: donnees !== null && cas?.sortie === "mapping",
    resultats: resultat !== null,
  };

  const choisirCas = (id: IdCas) => {
    setCasId(id);
    // Changer de cas d'usage repart de zéro : un fichier lu pour un autre cas n'a plus de sens.
    setFichier(null);
    setDonnees(null);
    setResultat(null);
    setErreur(null);
  };

  const choisirFichier = async () => {
    setErreur(null);
    try {
      const choisi = await window.orisflow?.cloudbankChoisirFichier();
      if (choisi) setFichier(choisi);
    } catch (e) {
      setErreur(nettoyerErreur(e));
    }
  };

  const validerImport = async () => {
    if (!fichier || !cas || !window.orisflow) return;
    setEnCours(true);
    setErreur(null);
    try {
      if (cas.sortie === "mapping") {
        setDonnees(await window.orisflow.cloudbankImporterMapping(fichier.chemin));
        setVersionImport((v) => v + 1);
        setOnglet("mapping");
      } else {
        // Fichier déjà final (extourne, extrait) : copié dans les résultats, sans écrasement.
        const depose = await window.orisflow.cloudbankDeposer(fichier.chemin);
        setResultat(depose);
        setOnglet("resultats");
      }
    } catch (e) {
      setErreur(nettoyerErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const nouveau = () => {
    setFichier(null);
    setDonnees(null);
    setResultat(null);
    setErreur(null);
    setOnglet("cas");
  };

  return (
    <div className="cloudbank">
      <nav className="cloudbank-nav" aria-label="Étapes de Téléverser sur CloudBank">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={o.id === onglet ? "onglet onglet--actif" : "onglet"}
            aria-current={o.id === onglet ? "page" : undefined}
            aria-disabled={!actif[o.id]}
            disabled={!actif[o.id]}
            onClick={() => setOnglet(o.id)}
          >
            {o.libelle}
          </button>
        ))}
      </nav>

      {onglet === "cas" && (
        <EcranCloudBankCasUsage
          casId={casId}
          valeurs={valeursPrompt}
          onChoisir={choisirCas}
          onValeurs={setValeursPrompt}
          onDebloquerImport={() => {
            setImportDebloque(true);
            setOnglet("importer");
          }}
        />
      )}
      {onglet === "importer" && cas && (
        <EcranCloudBankImporter
          cas={cas}
          fichier={fichier}
          enCours={enCours}
          erreur={erreur}
          onChoisirFichier={choisirFichier}
          onValider={validerImport}
        />
      )}
      {/* Le mapping reste monté (simplement masqué) : changer d'onglet ne fait pas perdre les décisions. */}
      {cas && donnees && cas.sortie === "mapping" && (
        <div hidden={onglet !== "mapping"}>
          <EcranCloudBankMapping
            key={versionImport}
            cas={cas}
            donnees={donnees}
            onGenere={(r) => {
              setResultat(r);
              setOnglet("resultats");
            }}
          />
        </div>
      )}
      {onglet === "resultats" && resultat && <EcranCloudBankResultats resultat={resultat} onNouveau={nouveau} />}
    </div>
  );
}
