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
        source = Path(__file__).resolve().parent.parent / "admin/common.sh"
        (self.root / "admin/common.sh").write_text(source.read_text())

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(503 if self.path == "/failure" else 200)
                self.end_headers()
                self.wfile.write(b"Database unavailable [Reference: abc123]" if self.path == "/failure" else b"ok")

            do_POST = do_GET

            def log_message(self, *args):
                pass

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
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

    def test_network_failure_is_reported(self):
        self.stop_server()
        result = self.request("admin_command failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("curl:", result.stderr)
