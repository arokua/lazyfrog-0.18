#!/usr/bin/env python3
"""
Rename image files in Google Drive subfolders.

Only processes subfolders with a numeric SKU (e.g. "182", "073 Geo Dominoes", "SKU 391 Balls on pegs").
Folders named "SKU ..." can be renamed first (strip "SKU ", title-case words). Skips lifestyle images.
Others become: 091 (0).jpg, 091 (1).png, ...

Usage:
  python rename_drive_folder_images.py
  python rename_drive_folder_images.py --reauth

Uses OAuth client config already in this folder:
  .google_oauth_client.json  or  tokens.json
Session saved to token.json after first sign-in.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import webbrowser
import wsgiref.simple_server
import wsgiref.util
from pathlib import Path
from urllib.parse import urlparse

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = ["https://www.googleapis.com/auth/drive"]
SCRIPT_DIR = Path(__file__).resolve().parent
TOKEN_FILE = SCRIPT_DIR / "token.json"
OAUTH_CLIENT_FILES = (
    SCRIPT_DIR / ".google_oauth_client.json",
    SCRIPT_DIR / "tokens.json",
    SCRIPT_DIR / "credentials.json",
)
# Must match Google Cloud Console -> Authorized redirect URIs exactly.
DEFAULT_REDIRECT_URI = "http://localhost:3000/rest/oauth2-credential/callback"

IMAGE_MIME_PREFIX = "image/"
IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
    ".avif",
}

API_MAX_RETRIES = 5


def drive_execute(request, description: str = "API call"):
    """Run a Drive API request with retries on transient network errors."""
    last_err: Exception | None = None
    for attempt in range(API_MAX_RETRIES):
        try:
            return request.execute()
        except HttpError as err:
            status = err.resp.status if err.resp else 0
            if status in {429, 500, 502, 503, 504} and attempt < API_MAX_RETRIES - 1:
                last_err = err
            else:
                raise
        except (ConnectionResetError, ConnectionError, TimeoutError, OSError) as err:
            last_err = err
        else:
            continue

        if attempt >= API_MAX_RETRIES - 1:
            break
        wait = min(2 ** attempt, 30)
        print(
            f"  ! {description} failed ({last_err}); retrying in {wait}s "
            f"({attempt + 1}/{API_MAX_RETRIES})...",
            file=sys.stderr,
            flush=True,
        )
        time.sleep(wait)
    raise last_err  # type: ignore[misc]


def log_progress(message: str) -> None:
    print(message, flush=True)


def find_oauth_client_file() -> Path | None:
    for path in OAUTH_CLIENT_FILES:
        if path.exists():
            return path
    return None


def load_oauth_client_config(path: Path) -> tuple[dict, str | None]:
    """
    Load OAuth client JSON (web or installed) from the project's existing files.
    Returns (client_config, redirect_uri for web clients else None).
    """
    raw = json.loads(path.read_text(encoding="utf-8"))

    # Saved user session misnamed as tokens.json — not client config.
    if "token" in raw or "refresh_token" in raw:
        raise ValueError(f"{path.name} looks like a saved session, not OAuth client config")

    if "web" in raw:
        section = dict(raw["web"])
        redirect_uris = list(section.get("redirect_uris") or [])
        redirect_uri = redirect_uris[0] if redirect_uris else DEFAULT_REDIRECT_URI
        section["redirect_uris"] = [redirect_uri]
        return {"web": section}, redirect_uri

    if "installed" in raw:
        return {"installed": raw["installed"]}, None

    raise ValueError(f"{path.name}: expected 'web' or 'installed' OAuth client JSON")


class _OAuthCallbackApp:
    """Local HTTP handler for the OAuth redirect (any path under the registered URI)."""

    def __init__(self, success_message: str) -> None:
        self.last_request_uri: str | None = None
        self._success_message = success_message

    def __call__(self, environ, start_response):
        start_response("200 OK", [("Content-type", "text/plain; charset=utf-8")])
        self.last_request_uri = wsgiref.util.request_uri(environ)
        return [self._success_message.encode("utf-8")]


def run_web_oauth_flow(
    flow: InstalledAppFlow,
    redirect_uri: str,
    *,
    open_browser: bool = True,
    **kwargs,
) -> Credentials:
    """
    OAuth loopback using the exact redirect URI registered in Google Cloud.

    google_auth_oauthlib.run_local_server() always sends http://host:port/ —
    that breaks when Console has a path like /rest/oauth2-credential/callback.
    """
    parsed = urlparse(redirect_uri)
    host = parsed.hostname or "localhost"
    port = parsed.port or 80

    app = _OAuthCallbackApp(
        "Authentication complete. You may close this tab and return to the terminal."
    )
    wsgiref.simple_server.WSGIServer.allow_reuse_address = False
    server = wsgiref.simple_server.make_server(host, port, app)

    try:
        flow.redirect_uri = redirect_uri
        auth_url, _ = flow.authorization_url(**kwargs)
        print(f"Redirect URI sent to Google:\n  {redirect_uri}\n")
        if open_browser:
            webbrowser.open(auth_url, new=1, autoraise=True)
        print("Waiting for Google to redirect back to the local server...\n")
        server.handle_request()
        if not app.last_request_uri:
            raise RuntimeError("Timed out waiting for OAuth callback on local server")
        authorization_response = app.last_request_uri.replace("http", "https")
        flow.fetch_token(authorization_response=authorization_response)
    finally:
        server.server_close()

    return flow.credentials


def credentials_help() -> None:
    print(
        "\nNo OAuth client config found in scripts/.\n"
        "Expected one of:\n"
        "  .google_oauth_client.json\n"
        "  tokens.json\n",
        file=sys.stderr,
    )


def authenticate(*, force_reauth: bool = False) -> Credentials:
    """Sign in using .google_oauth_client.json / tokens.json already in scripts/."""
    if force_reauth and TOKEN_FILE.exists():
        TOKEN_FILE.unlink()
        print("Removed saved token.\n")

    creds: Credentials | None = None
    if TOKEN_FILE.exists() and not force_reauth:
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except (OSError, ValueError):
            creds = None

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token and not force_reauth:
        try:
            creds.refresh(Request())
            TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
            return creds
        except Exception:
            creds = None

    client_path = find_oauth_client_file()
    if not client_path:
        credentials_help()
        sys.exit(1)

    try:
        client_config, redirect_uri = load_oauth_client_config(client_path)
    except ValueError as err:
        print(f"\n{err}\n", file=sys.stderr)
        sys.exit(1)

    client_type = "web" if "web" in client_config else "installed"
    print(f"Using OAuth client: {client_path.name} ({client_type})")
    print("Opening browser for Google sign-in (Incognito if you need another account).\n")

    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    oauth_kwargs = {
        "access_type": "offline",
        "prompt": "select_account",
    }
    if redirect_uri:
        creds = run_web_oauth_flow(
            flow,
            redirect_uri,
            open_browser=True,
            **oauth_kwargs,
        )
    else:
        creds = flow.run_local_server(
            port=0,
            open_browser=True,
            **oauth_kwargs,
        )

    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    print(f"Session saved to {TOKEN_FILE.name}\n")
    return creds


def print_signed_in_account(service) -> None:
    try:
        about = service.about().get(fields="user").execute()
        email = about.get("user", {}).get("emailAddress")
        if email:
            print(f"Signed in to Google Drive as: {email}\n")
    except Exception:
        pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rename Drive images in SKU-prefixed subfolders."
    )
    parser.add_argument(
        "--reauth",
        action="store_true",
        help="Delete saved token and sign in again (account picker in browser)",
    )
    return parser.parse_args()


ENTIRE_SKU_PATTERN = re.compile(r"^\d+$")
LEADING_SKU_PATTERN = re.compile(r"^(\d+)")
SKU_PREFIX_PATTERN = re.compile(r"^SKU\s+", re.IGNORECASE)
TITLECASE_LOWERCASE_WORDS = frozenset({"and", "with"})


def has_sku_prefix_label(folder_name: str) -> bool:
    return bool(SKU_PREFIX_PATTERN.match(folder_name.strip()))


def format_sku_folder_name(folder_name: str) -> str:
    """Strip 'SKU ' prefix and title-case words (keeping 'and', 'with' lowercase)."""
    stripped = SKU_PREFIX_PATTERN.sub("", folder_name.strip())
    words = stripped.split()
    formatted: list[str] = []
    for i, word in enumerate(words):
        lower = word.lower()
        if i > 0 and lower in TITLECASE_LOWERCASE_WORDS:
            formatted.append(lower)
        elif word.isdigit():
            formatted.append(word)
        elif word:
            formatted.append(word[0].upper() + word[1:].lower())
        else:
            formatted.append(word)
    return " ".join(formatted)


def extract_sku_from_folder(folder_name: str) -> str | None:
    """
    Return SKU string for file naming:
      - entire name is digits (e.g. "182", "123069") -> full string
      - "SKU 391 ..." or "073 Geo ..." -> leading digit run after optional SKU strip
    """
    name = folder_name.strip()
    if ENTIRE_SKU_PATTERN.fullmatch(name):
        return name

    remainder = SKU_PREFIX_PATTERN.sub("", name).strip()
    match = LEADING_SKU_PATTERN.match(remainder)
    return match.group(1) if match else None


def is_lifestyle_image(filename: str) -> bool:
    return "lifestyle" in filename.lower()


def build_new_name(sku: str, index: int, original_name: str) -> str:
    ext = Path(original_name).suffix.lower()
    if not ext:
        ext = ".jpg"
    return f"{sku} ({index}){ext}"


def is_correctly_renamed_image(filename: str, sku: str, index: int) -> bool:
    return filename == build_new_name(sku, index, filename)


def folder_images_already_renamed(images: list[dict], sku: str) -> bool:
    """True when every non-lifestyle image is already {sku} (0).ext, (1).ext, ..."""
    to_check = [img for img in images if not is_lifestyle_image(img["name"])]
    if not to_check:
        return False
    to_check.sort(key=lambda f: f.get("name", "").lower())
    return all(
        is_correctly_renamed_image(img["name"], sku, index)
        for index, img in enumerate(to_check)
    )


def list_subfolders(service, parent_id: str) -> list[dict]:
    """Return immediate child folders of parent_id."""
    folders: list[dict] = []
    page_token = None
    query = (
        f"'{parent_id}' in parents and "
        "mimeType='application/vnd.google-apps.folder' and trashed=false"
    )
    while True:
        response = drive_execute(
            service.files()
            .list(
                q=query,
                spaces="drive",
                fields="nextPageToken, files(id, name)",
                pageToken=page_token,
                pageSize=1000,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ),
            "list subfolders",
        )
        folders.extend(response.get("files", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return folders


def is_image_file(file_obj: dict) -> bool:
    mime = (file_obj.get("mimeType") or "").lower()
    if mime.startswith(IMAGE_MIME_PREFIX):
        return True
    ext = Path(file_obj.get("name", "")).suffix.lower()
    return ext in IMAGE_EXTENSIONS


def list_images_in_folder(service, folder_id: str) -> list[dict]:
    """Return non-folder files in folder_id that look like images."""
    files: list[dict] = []
    page_token = None
    query = f"'{folder_id}' in parents and trashed=false"
    while True:
        response = drive_execute(
            service.files()
            .list(
                q=query,
                spaces="drive",
                fields="nextPageToken, files(id, name, mimeType)",
                pageToken=page_token,
                pageSize=1000,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ),
            "list folder images",
        )
        for item in response.get("files", []):
            if item.get("mimeType") == "application/vnd.google-apps.folder":
                continue
            if is_image_file(item):
                files.append(item)
        page_token = response.get("nextPageToken")
        if not page_token:
            break

    files.sort(key=lambda f: f.get("name", "").lower())
    return files


def rename_file(service, file_id: str, new_name: str) -> None:
    drive_execute(
        service.files().update(
            fileId=file_id,
            body={"name": new_name},
            supportsAllDrives=True,
        ),
        f"rename to {new_name}",
    )


def rename_folder(service, folder: dict, new_name: str) -> None:
    rename_file(service, folder["id"], new_name)
    folder["name"] = new_name


def prompt_yes_no(message: str, *, default_no: bool = True) -> bool:
    suffix = " [y/N]: " if default_no else " [Y/n]: "
    answer = input(message + suffix).strip().lower()
    if not answer:
        return not default_no
    return answer in {"y", "yes"}


def offer_sku_folder_renames(service, subfolders: list[dict]) -> int:
    """Ask case-by-case to rename 'SKU ...' folders. Returns count renamed."""
    renamed = 0
    sku_label_folders = [f for f in subfolders if has_sku_prefix_label(f["name"])]
    if not sku_label_folders:
        return renamed

    print(f"\nFound {len(sku_label_folders)} folder(s) with 'SKU ' prefix.")
    for folder in sku_label_folders:
        old_name = folder["name"]
        new_name = format_sku_folder_name(old_name)
        if new_name == old_name:
            print(f"\n  [skip] folder already correctly named: {old_name}")
            continue
        print(f"\n  From: {old_name}")
        print(f"  To:   {new_name}")
        if prompt_yes_no("Rename this folder?"):
            try:
                rename_folder(service, folder, new_name)
                print("  -> folder renamed")
                renamed += 1
            except HttpError as err:
                print(f"  ! folder rename failed: {err}", file=sys.stderr)
        else:
            print("  -> skipped")
    return renamed


def prompt_folder_id() -> str:
    print()
    print("Enter the Google Drive folder ID (from the URL when you open the folder).")
    print("Example URL: https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp")
    print("              Folder ID:                          1AbCdEfGhIjKlMnOp")
    print()
    folder_id = input("Parent folder ID: ").strip()
    if not folder_id:
        print("Folder ID is required.", file=sys.stderr)
        sys.exit(1)
    return folder_id


def confirm_action(subfolder_count: int) -> bool:
    answer = input(
        f"\nRename images in {subfolder_count} subfolder(s)? [y/N]: "
    ).strip().lower()
    return answer in {"y", "yes"}


def main() -> None:
    args = parse_args()
    creds = authenticate(force_reauth=args.reauth)
    service = build("drive", "v3", credentials=creds)
    print_signed_in_account(service)

    parent_id = prompt_folder_id()

    try:
        parent = (
            service.files()
            .get(fileId=parent_id, fields="id, name", supportsAllDrives=True)
            .execute()
        )
    except HttpError as err:
        print(f"Could not access folder {parent_id}: {err}", file=sys.stderr)
        sys.exit(1)

    print(f"\nParent folder: {parent.get('name')} ({parent_id})")

    log_progress("Listing subfolders...")
    subfolders = list_subfolders(service, parent_id)
    log_progress(f"Found {len(subfolders)} subfolder(s).")
    if not subfolders:
        print("No subfolders found in that folder.")
        return

    folders_renamed = offer_sku_folder_renames(service, subfolders)
    if folders_renamed:
        log_progress(f"Renamed {folders_renamed} folder(s).")

    sku_folders: list[tuple[dict, str]] = []
    skipped_folders: list[dict] = []
    for folder in subfolders:
        sku = extract_sku_from_folder(folder["name"])
        if sku:
            sku_folders.append((folder, sku))
        else:
            skipped_folders.append(folder)

    already_done: list[tuple[dict, str]] = []
    pending_folders: list[tuple[dict, str]] = []
    images_by_folder_id: dict[str, list[dict]] = {}
    total_sku = len(sku_folders)
    if total_sku:
        log_progress(f"Scanning {total_sku} SKU folder(s) for work already done...")
    for index, (folder, sku) in enumerate(sku_folders, start=1):
        if index == 1 or index % 25 == 0 or index == total_sku:
            log_progress(f"  scan {index}/{total_sku}: {folder['name']}")
        images = list_images_in_folder(service, folder["id"])
        images_by_folder_id[folder["id"]] = images
        if folder_images_already_renamed(images, sku):
            already_done.append((folder, sku))
        else:
            pending_folders.append((folder, sku))

    print(f"Found {len(subfolders)} subfolder(s), {len(sku_folders)} with SKU:")
    for folder, sku in sku_folders:
        if sku == folder["name"].strip():
            print(f"  - [{sku}] {folder['name']}")
        else:
            print(f"  - {folder['name']}  (file SKU: {sku})")
    if already_done:
        print(f"\nAlready complete ({len(already_done)} folder(s), will skip):")
        for folder, sku in already_done:
            print(f"  - {folder['name']}")
    if skipped_folders:
        print(f"\nSkipping {len(skipped_folders)} folder(s) without numeric SKU:")
        for folder in skipped_folders:
            print(f"  - {folder['name']}")

    if not pending_folders:
        if already_done:
            print("\nAll SKU folders already renamed. Nothing to do.")
        else:
            print("\nNo SKU subfolders to process.")
        return

    if not confirm_action(len(pending_folders)):
        print("Cancelled.")
        return

    log_progress(f"\nRenaming images in {len(pending_folders)} folder(s)...")
    total_renamed = 0
    total_skipped_lifestyle = 0
    total_skipped_unchanged = 0
    for folder, sku in pending_folders:
        folder_id = folder["id"]
        folder_name = folder["name"]
        images = images_by_folder_id.get(folder_id)
        if images is None:
            images = list_images_in_folder(service, folder_id)
            images_by_folder_id[folder_id] = images

        if not images:
            print(f"[skip] {folder_name}: no images")
            continue

        to_rename = [img for img in images if not is_lifestyle_image(img["name"])]
        lifestyle_count = len(images) - len(to_rename)
        total_skipped_lifestyle += lifestyle_count

        if not to_rename:
            print(f"[skip] {folder_name}: only lifestyle images ({lifestyle_count})")
            continue

        if folder_images_already_renamed(images, sku):
            print(f"[skip] {folder_name}: already renamed")
            continue

        print(
            f"[{folder_name}] renaming {len(to_rename)} image(s)"
            + (f", skipping {lifestyle_count} lifestyle" if lifestyle_count else "")
            + "..."
        )
        for index, image in enumerate(to_rename):
            old_name = image["name"]
            new_name = build_new_name(sku, index, old_name)
            if old_name == new_name:
                print(f"  = {old_name} (already correct)")
                total_skipped_unchanged += 1
                continue
            try:
                rename_file(service, image["id"], new_name)
                print(f"  {old_name} -> {new_name}")
                total_renamed += 1
            except HttpError as err:
                print(f"  ! failed {old_name}: {err}", file=sys.stderr)

    summary = f"\nDone. Renamed {total_renamed} file(s)"
    if total_skipped_unchanged:
        summary += f", {total_skipped_unchanged} already correct"
    if total_skipped_lifestyle:
        summary += f", {total_skipped_lifestyle} lifestyle skipped"
    if already_done:
        summary += f", {len(already_done)} folder(s) already complete"
    print(summary + ".")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(130)
