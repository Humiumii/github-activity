import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from github_activity import main


def event(kind, repo, day):
    return {"type": kind, "repo": {"name": repo}, "created_at": f"2026-11-{day}T00:00:00Z"}


def http_error(status, headers=None, message=b""):
    return HTTPError("https://api.github.com", status, "", headers or {}, io.BytesIO(message))


class ActivityTests(unittest.TestCase):
    def invoke(self, response):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with patch("github_activity.urlopen") as request, redirect_stdout(stdout), redirect_stderr(stderr):
            if isinstance(response, Exception):
                request.side_effect = response
            else:
                request.return_value = io.BytesIO(json.dumps(response).encode())
            code = main(["Humiumii"])
            self.assertIn("/users/Humiumii/events/public", request.call_args.args[0].full_url)
            self.assertEqual(request.call_args.kwargs["timeout"], 10)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_prioritizes_key_events_and_sorts_each_group(self):
        code, output, error = self.invoke([
            event("WatchEvent", "owner/three", 17),
            event("IssuesEvent", "owner/one", 15),
            event("PushEvent", "owner/two", 16),
            event("PullRequestEvent", "owner/four", 14),
        ])
        self.assertEqual((code, error), (0, ""))
        self.assertEqual([line.split()[1] for line in output.splitlines()],
                         ["PushEvent", "IssuesEvent", "PullRequestEvent", "WatchEvent"])
        self.assertIn("2026-11-16T00:00:00Z", output)
        self.assertIn("owner/two", output)

    def test_empty_feed(self):
        self.assertEqual(self.invoke([]), (0, "No recent public activity for Humiumii.\n", ""))

    def test_missing_user(self):
        self.assertEqual(self.invoke(http_error(404)), (1, "", "GitHub user not found.\n"))

    def test_primary_limit(self):
        code, _, error = self.invoke(http_error(403, {
            "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1794960000",
        }))
        self.assertEqual(code, 1)
        self.assertIn("UTC", error)

    def test_secondary_limit(self):
        cases = [
            http_error(429, {"Retry-After": "60"}),
            http_error(403, message=b'{"message":"Secondary rate limit exceeded"}'),
        ]
        for response in cases:
            with self.subTest(status=response.code):
                code, _, error = self.invoke(response)
                self.assertEqual(code, 1)
                self.assertIn("rate limit reached", error)

    def test_unrelated_forbidden(self):
        self.assertEqual(self.invoke(http_error(403)), (1, "", "GitHub returned HTTP 403.\n"))

    def test_network_failure_and_timeout(self):
        for response in [URLError("offline"), TimeoutError()]:
            with self.subTest(error=type(response)):
                code, _, error = self.invoke(response)
                self.assertEqual(code, 1)
                self.assertIn("Check your connection", error)


if __name__ == "__main__":
    unittest.main()
