"""O laboratório não apaga registros nem caches pela API (dados caros de baixar do IRSA)."""

from __future__ import annotations

import json
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
import tempfile
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server  # noqa: E402


class DeleteDisabledTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        server.AUTH = server.BasicAuth(Path(self.tmp.name), False)
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.LabHandler)
        Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmp.cleanup()

    def delete(self, path: str) -> tuple[int, dict]:
        try:
            with urlopen(Request(self.base + path, method="DELETE"), timeout=5) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def test_record_and_cache_deletion_are_refused(self) -> None:
        self.assertFalse(server.ALLOW_DELETE)
        for path in ("/api/records/abc123", "/api/records/abc123?engine=v1&forget=1", "/api/e/v1/cache/0123456789abcdef"):
            status, body = self.delete(path)
            self.assertEqual(status, 403, path)
            self.assertIn("desativado", body["error"])


if __name__ == "__main__":
    unittest.main()
