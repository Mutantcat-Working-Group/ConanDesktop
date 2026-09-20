"""Opt-in Conan 2 protocol test; requires conan-server in this Python environment."""

import configparser
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import threading
from wsgiref.simple_server import make_server, WSGIRequestHandler

from conans.server.launcher import ServerLauncher


class QuietHandler(WSGIRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    executable = os.environ.get("CONAN_TEST_EXECUTABLE", "conan")
    with tempfile.TemporaryDirectory(prefix="conandesktop-private-") as temporary:
        root = Path(temporary)
        server_dir = root / "server"
        server_dir.mkdir()
        password = secrets.token_urlsafe(24)
        environment = {key: value for key, value in os.environ.items()
                       if not key.startswith(("CONAN_", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"))}
        environment.update(CONAN_HOME=str(root / "home"), NO_PROXY="127.0.0.1,localhost")

        def cli(*args, login_password=None, success=True):
            env = environment.copy()
            if login_password is not None:
                env["CONAN_PASSWORD_PRIVATE"] = login_password
            result = subprocess.run(
                [executable, *args, "-cc", "core:non_interactive=True"],
                env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=90,
            )
            assert (result.returncode == 0) == success, f"{args}: {result.stderr}"
            return result

        def query(pattern):
            # Same CLI contract as the desktop JSON adapter.
            output = root / "query.json"
            cli("list", pattern, "-r", "private", "--format", "json", "--out-file", str(output))
            return json.loads(output.read_text())

        # Reserve an ephemeral loopback port before generating the server's public URL.
        with make_server("127.0.0.1", 0, None, handler_class=QuietHandler) as server:
            ServerLauncher(server_dir=str(server_dir))
            config_path = server_dir / "server.conf"
            config = configparser.ConfigParser(interpolation=None)
            config.read(config_path)
            config["server"]["port"] = str(server.server_port)
            config["server"]["host_name"] = "127.0.0.1"
            config["server"]["disk_storage_path"] = str(server_dir / "data")
            config["server"]["jwt_secret"] = secrets.token_hex(32)
            config["server"]["updown_secret"] = secrets.token_hex(32)
            config["users"] = {"tester": password, "blocked": password}
            config["read_permissions"] = {"*/*@*/*": "tester"}
            config["write_permissions"] = {"*/*@*/*": "tester"}
            with config_path.open("w") as stream:
                config.write(stream)
            launcher = ServerLauncher(server_dir=str(server_dir))
            prefix = "/artifactory/api/conan/private"

            def proxy_app(environ, start_response):
                if environ["PATH_INFO"].startswith(prefix + "/"):
                    environ["SCRIPT_NAME"] += prefix
                    environ["PATH_INFO"] = environ["PATH_INFO"][len(prefix):]
                return launcher.server.root_app(environ, start_response)

            server.set_app(proxy_app)
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                cli("remote", "remove", "conancenter")
                cli("remote", "add", "private", f"http://127.0.0.1:{server.server_port}")
                cli("remote", "login", "private", "tester", login_password="wrong-password", success=False)
                cli("remote", "login", "private", "tester", login_password=password)
                users = json.loads(cli("remote", "list-users", "--format", "json").stdout)
                assert users == [{"name": "private", "user_name": "tester", "authenticated": True}], users

                recipe = root / "recipe"
                recipe.mkdir()
                (recipe / "conanfile.py").write_text(
                    'from conan import ConanFile\nclass Engine(ConanFile):\n'
                    '    name = "engine"\n    version = "2.10"\n'
                    '    package_type = "header-library"\n'
                )
                reference = "engine/2.10@team/stable"
                cli("export", str(recipe), "--user", "team", "--channel", "stable")
                cli("upload", reference, "-r", "private", "--confirm")
                assert reference in query("engine/*@team/stable")["private"]
                assert query(reference + "#*")["private"][reference]["revisions"]
                probe = query("conan-desktop-connectivity-probe-*")
                assert probe == {"private": {}}, probe
                # A prefix proxy tests URL preservation, not Artifactory's implementation.
                cli("remote", "update", "private", "--url", f"http://127.0.0.1:{server.server_port}{prefix}")
                cli("remote", "login", "private", "tester", login_password=password)
                assert reference in query("engine/*@team/stable")["private"]
                cli("remote", "logout", "private")
                users = json.loads(cli("remote", "list-users", "--format", "json").stdout)
                assert users[0]["authenticated"] is False, users
                cli("remote", "login", "private", "blocked", login_password=password)
                denied = query(reference + "#*")
                assert reference not in denied["private"], denied
                assert "error" in denied["private"], denied
                cli("remote", "logout", "private")
                print("PASS: private login, wrong password, cached users, upload fixture, user/channel search, revisions, empty probe, proxy base path, logout, denied access")
            finally:
                server.shutdown()
                worker.join(timeout=5)


if __name__ == "__main__":
    main()
