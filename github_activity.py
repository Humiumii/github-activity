"""Show recent public GitHub events in the terminal."""

import argparse
import json
from urllib.parse import quote
from urllib.request import Request, urlopen

PRIORITY_TYPES = {"PushEvent", "PullRequestEvent", "IssuesEvent", "IssueCommentEvent"}


def fetch_events(username):
    url = f"https://api.github.com/users/{quote(username, safe='')}/events/public?per_page=100"
    request = Request(url, headers={
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "github-activity-cli",
    })
    with urlopen(request, timeout=10) as response:
        return json.load(response)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("username", help="GitHub login (example: Humiumii)")
    args = parser.parse_args(argv)
    events = fetch_events(args.username)
    events.sort(key=lambda event: event["created_at"], reverse=True)
    events.sort(key=lambda event: event["type"] not in PRIORITY_TYPES)
    for event in events:
        print(f'{event["created_at"]}  {event["type"]:<24} {event["repo"]["name"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
