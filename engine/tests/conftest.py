"""Configuration commune des tests du moteur.

LibreOffice est désactivé par défaut (recalcul simulé « indisponible ») : un vrai lancement
coûte plusieurs secondes par test. Seuls les tests marqués `@pytest.mark.libreoffice`
l'appellent réellement, avec un cache de recalcul propre au test.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine import recalcul  # noqa: E402


def pytest_configure(config):
    config.addinivalue_line("markers", "libreoffice: appelle réellement LibreOffice (lent, ignoré s'il est absent)")


@pytest.fixture(autouse=True)
def _libreoffice_seulement_si_demande(request, monkeypatch, tmp_path):
    monkeypatch.setattr(recalcul, "DOSSIER_CACHE", str(tmp_path / "cache_recalcul"))
    if request.node.get_closest_marker("libreoffice") is None:
        monkeypatch.setattr(recalcul, "_trouver_soffice", lambda: None)
    elif recalcul._trouver_soffice() is None:
        pytest.skip("LibreOffice non installé sur ce poste")
