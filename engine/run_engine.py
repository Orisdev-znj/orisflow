"""Point d'entrée utilisé par PyInstaller pour fabriquer orisflow-engine.exe."""

import sys

from orisflow_engine.cli import main

if __name__ == "__main__":
    sys.exit(main())
