import http.server
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest


class AdminCommandsTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="hanabi-admin-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "admin").mkdir()
        source = Path(__file__).resolve().parent.parent
        for name in ("admin/common.sh", "admin/gracefulRestart.sh", "admin/shutdown.sh",
                     "restart_service_only.sh", "stop.sh"):
            (self.root / name).write_text((source / name).read_text())
        self.requests = []
        requests = self.requests

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append(self.path)
                if self.path == "/redirect":
                    self.send_response(302)
                    self.send_header("Location", "/success")
                    self.end_headers()
                    return
                self.send_response(503 if self.path == "/failure" else self.server.response_status)
                self.end_headers()
                self.wfile.write(b"Database unavailable [Reference: abc123]" if self.path == "/failure" else b"ok")

            do_POST = do_GET

            def log_message(self, *args):
                pass

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.response_status = 200
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)
        (self.root / ".env").write_text(f"LOCALHOST_PORT={self.server.server_port}\n")

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, command):
        return subprocess.run(
            ["bash", "-c", 'source admin/common.sh; ' + command],
            cwd=self.root, env={**os.environ, "NO_PROXY": "localhost,127.0.0.1"},
            capture_output=True, text=True,
        )

    def test_get_and_post_http_failures_preserve_body_and_exit_nonzero(self):
        for command in ("admin_command failure", "admin_command_post failure message=test"):
            with self.subTest(command=command):
                result = self.request(command)
                self.assertEqual(result.returncode, 22)
                self.assertIn("Database unavailable", result.stdout)
                self.assertIn("Reference: abc123", result.stdout)
                self.assertIn("HTTP 503", result.stderr)
        result = self.request("admin_command success")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "ok\n")

    def test_redirects_are_followed(self):
        result = self.request("admin_command redirect")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "ok\n")

    def test_network_failure_is_reported(self):
        self.stop_server()
        result = self.request("admin_command failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("curl:", result.stderr)

    def test_lifecycle_scripts_use_rust_control_without_git_or_supervisor(self):
        forbidden = self.root / "forbidden-command"
        binaries = self.root / "bin"
        binaries.mkdir()
        for name in ("git", "supervisorctl"):
            executable = binaries / name
            executable.write_text(f'#!/bin/sh\ntouch "{forbidden}"\nexit 99\n')
            executable.chmod(0o755)
        for script, endpoint in (
            ("admin/gracefulRestart.sh", "/gracefulRestart"),
            ("restart_service_only.sh", "/gracefulRestart"),
            ("admin/shutdown.sh", "/shutdown"),
            ("stop.sh", "/shutdown"),
        ):
            for status in (200, 503):
                with self.subTest(script=script, status=status):
                    self.server.response_status = status
                    self.requests.clear()
                    result = subprocess.run(
                        ["bash", str(self.root / script)], cwd="/",
                        env={**os.environ, "PATH": f"{binaries}:{os.environ['PATH']}",
                             "NO_PROXY": "localhost,127.0.0.1"},
                        capture_output=True, text=True,
                    )
                    self.assertEqual(result.returncode, 0 if status == 200 else 22)
                    self.assertEqual(self.requests, [endpoint])
                    self.assertFalse(forbidden.exists())
