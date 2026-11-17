"""Show recent public GitHub events in the terminal."""

import argparse
from datetime import datetime, timezone
import json
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

PRIORITY_TYPES = {"PushEvent", "PullRequestEvent", "IssuesEvent", "IssueCommentEvent"}


class ActivityError(Exception):
    """An activity lookup failed."""


def describe_http_error(error):
    if error.code == 404:
        return "GitHub user not found."
    remaining = error.headers.get("X-RateLimit-Remaining")
    retry_after = error.headers.get("Retry-After")
    if error.code == 403 and remaining != "0" and not retry_after:
        payload = error.read()
        secondary_limit = b"secondary rate limit" in payload.lower()
    else:
        secondary_limit = False
    if error.code == 429 or (error.code == 403 and (
        remaining == "0" or retry_after or secondary_limit
    )):
        message = "GitHub API rate limit reached."
        if retry_after and retry_after.isdigit():
            return f"{message} Retry in {retry_after} seconds."
        reset = error.headers.get("X-RateLimit-Reset", "")
        if remaining == "0" and reset.isdigit():
            try:
                time = datetime.fromtimestamp(int(reset), timezone.utc)
                return f"{message} Retry after {time:%H:%M:%S} UTC."
            except (OverflowError, OSError, ValueError):
                pass
        return f"{message} Wait before retrying."
    return f"GitHub returned HTTP {error.code}."


def fetch_events(username):
    url = f"https://api.github.com/users/{quote(username, safe='')}/events/public?per_page=100"
    request = Request(url, headers={
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "github-activity-cli",
    })
    try:
        with urlopen(request, timeout=10) as response:
            events = json.load(response)
    except HTTPError as error:
        with error:
            raise ActivityError(describe_http_error(error)) from error
    except (URLError, OSError) as error:
        raise ActivityError("Could not connect to GitHub. Check your connection.") from error
    except ValueError as error:
        raise ActivityError("GitHub returned an unreadable response.") from error
    if not isinstance(events, list):
        raise ActivityError("GitHub returned an unexpected response.")
    return events


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("username", help="GitHub login (example: Humiumii)")
    args = parser.parse_args(argv)
    username = args.username.strip()
    if not re.fullmatch(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*", username) or len(username) > 39:
        parser.error("Enter a valid GitHub username.")
    try:
        events = fetch_events(username)
    except ActivityError as error:
        print(error, file=sys.stderr)
        return 1
    if not events:
        print(f"No recent public activity for {username}.")
        return 0
    events.sort(key=lambda event: event["created_at"], reverse=True)
    events.sort(key=lambda event: event["type"] not in PRIORITY_TYPES)
    for event in events:
        print(f'{event["created_at"]}  {event["type"]:<24} {event["repo"]["name"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
