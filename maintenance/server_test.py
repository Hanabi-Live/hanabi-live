import http.client
from threading import Thread
import unittest
from http.server import ThreadingHTTPServer

from server import Handler


class MaintenanceTests(unittest.TestCase):
    def test_page_assets_redirects_and_traversal(self):
        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            thread = Thread(target=server.serve_forever)
            thread.start()
            try:
                for path, status in [
                    ("/", 200),
                    ("/public/img/favicon.ico", 200),
                    ("/lobby", 302),
                    ("/public/%2e%2e/.env", 404),
                    ("/public/missing-audit-file", 404),
                ]:
                    with self.subTest(path=path):
                        connection = http.client.HTTPConnection(*server.server_address)
                        try:
                            connection.request("GET", path)
                            response = connection.getresponse()
                            self.assertEqual(response.status, status)
                            if status == 302:
                                self.assertEqual(response.getheader("Location"), "/")
                            response.read()
                        finally:
                            connection.close()
            finally:
                server.shutdown()
                thread.join()
