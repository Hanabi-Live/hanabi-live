"""Serve the maintenance page without the application database or a compiler."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import ssl
from threading import Thread
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        requested = unquote(urlsplit(self.path).path)
        if requested == "/":
            target = ROOT / "maintenance/index.html"
        elif requested == "/favicon.ico":
            target = ROOT / "public/img/favicon.ico"
        elif requested.startswith("/public/"):
            target = (ROOT / requested.lstrip("/")).resolve()
            if not target.is_relative_to(ROOT / "public"):
                self.send_error(404)
                return None
        else:
            self.send_response(302)
            self.send_header("Location", "/")
            self.end_headers()
            return None
        if not target.is_file():
            self.send_error(404)
            return None
        stream = target.open("rb")
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(target)))
        self.send_header("Content-Length", str(os.fstat(stream.fileno()).st_size))
        self.end_headers()
        return stream


class Redirect(Handler):
    def send_head(self):
        self.send_response(301)
        self.send_header("Location", f"https://{self.headers.get('Host', 'localhost')}{self.path}")
        self.end_headers()
        return None


def main():
    cert = os.environ.get("TLS_CERT_FILE", "")
    key = os.environ.get("TLS_KEY_FILE", "")
    if bool(cert) != bool(key):
        raise ValueError("Configure both TLS_CERT_FILE and TLS_KEY_FILE.")
    port = int(os.environ.get("PORT") or (443 if cert else 80))
    if cert and port == 80:
        port = 443
    redirect = None
    with ThreadingHTTPServer(("", port), partial(Handler, directory=str(ROOT))) as server:
        if cert:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(cert, key)
            server.socket = context.wrap_socket(server.socket, server_side=True)
            redirect = ThreadingHTTPServer(("", 80), Redirect)
            Thread(target=redirect.serve_forever, daemon=True).start()
        try:
            print(f"Maintenance server listening on port {port}.", flush=True)
            server.serve_forever()
        finally:
            if redirect:
                redirect.shutdown()
                redirect.server_close()


if __name__ == "__main__":
    main()
