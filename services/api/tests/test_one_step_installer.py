"""Static wiring checks for the one-step installers (aegis.cmd / scripts/aegis.ps1 / aegis.sh)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_compose_ports_default_to_the_documented_values():
    compose = (ROOT / "compose.yaml").read_text()
    assert '"127.0.0.1:${AEGIS_WEB_PORT:-3000}:3000"' in compose
    assert '"127.0.0.1:${AEGIS_API_PORT:-8000}:8000"' in compose
    # CORS follows the web address so a moved web port stays consistent.
    assert "CORS_ORIGIN: ${APP_ORIGIN:-http://localhost:3000}" in compose


def test_sign_in_port_is_never_remapped():
    idp = (ROOT / "compose.local-idp.yaml").read_text()
    assert "'127.0.0.1:8443:8443'" in idp
    assert "AEGIS_IDP_PORT" not in idp


def test_installers_exist_and_keep_the_single_project():
    windows = (ROOT / "scripts/aegis.ps1").read_text()
    posix = (ROOT / "aegis.sh").read_text()
    assert (ROOT / "aegis.cmd").exists()
    assert "Invoke-AegisLocalOperation" in windows and "start-windows.ps1" in windows
    assert "PROJECT=ai-project-aegis" in posix
    for script in (windows, posix):
        assert "down -v" not in script and "volume rm" not in script
        assert "runtime-ports.env" in script


def test_shell_scripts_stay_lf():
    attributes = (ROOT / ".gitattributes").read_text()
    assert "*.sh text eol=lf" in attributes
    assert b"\r\n" not in (ROOT / "aegis.sh").read_bytes()
