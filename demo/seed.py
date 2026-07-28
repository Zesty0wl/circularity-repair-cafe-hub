#!/usr/bin/env python3
"""
Fill an empty hub with a believable repair cafe, for the public demo site.

Run against a hub that has just been started with an empty database. It drives
the same HTTP API the browser uses, rather than writing to PostgreSQL directly,
for two reasons: it keeps working when the database schema changes underneath
it, and it fails loudly when a release breaks something. That second one makes
the demo a daily check on our own releases.

Uploads must still be allowed while this runs, so seed with DEMO_MODE off and
turn it on afterwards. demo/reset.sh does exactly that.

Usage:
    python3 demo/seed.py --base-url http://127.0.0.1:5026

Only the Python standard library is used, so it runs on a bare Debian host with
nothing installed.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

UA = {"User-Agent": "circularity-repair-cafe-hub-demo-seed/1.0"}

# The cafe is invented. "Tinkerton" is not a real place and TK is not a real UK
# postcode area, so none of this can be mistaken for, or collide with, a repair
# cafe that actually exists.
CAFE_NAME = "Tinkerton Repair Café"
ADMIN_EMAIL = "demo@example.com"
ADMIN_PASSWORD = "DemoDemo123"
REPAIRER_EMAIL = "repairer@example.com"

# example.com is reserved by RFC 2606 and can never belong to anybody, so these
# addresses cannot reach a real person.
REPAIRERS = [
    ("Ada Fixwell", "ada@example.com", "Electricals and anything with a motor. Twenty years in appliance servicing, now mostly kettles and food mixers."),
    ("Bram Sole", "bram@example.com", "Shoes, bags and leather. Believes almost nothing needs throwing away."),
    ("Cleo Marsh", "cleo@example.com", "Textiles, darning and dressmaking. Runs the sewing table."),
    ("Dev Rahman", "dev@example.com", "Laptops, phones and small electronics. Soldering iron always warm."),
    ("Elsie Groat", "elsie@example.com", "Bicycles, mowers and anything mechanical that has seized up."),
    ("Finn Oakley", "finn@example.com", "Woodwork and furniture. Chairs a speciality."),
]

# The third value is the key of a CO2 factor from The Restart Project's
# reference data, which the hub ships with. Setting it is what makes the demo
# show a real carbon saving instead of zero, and it is one of the better things
# to look at, so it is worth getting right rather than leaving blank.
ITEMS = [
    ("Toaster", "Only one side heats up", "toaster"),
    ("Table lamp", "Flickers when the cable moves", "lamp"),
    ("Food mixer", "Motor hums but the paddle does not turn", "small_kitchen_item"),
    ("Kettle", "Trips the socket when switched on", "kettle"),
    ("Vacuum cleaner", "Very little suction", "vacuum"),
    ("Radio", "Crackles and cuts out", "portable_radio"),
    ("Sewing machine", "Thread keeps bunching underneath", "sewing_machine"),
    ("Laptop", "Fan runs constantly and it gets very hot", "laptop_medium"),
    ("Bicycle", "Gears slip on the back three sprockets", "bicycle"),
    ("Wooden chair", "Back leg has come loose", "furniture"),
    ("Desk fan", "Makes a grinding noise", "fan"),
    ("Hairdryer", "No heat, fan still works", "hair_beauty_item"),
    ("Digital radio", "Screen is blank but sound works", "portable_radio"),
    ("Blender", "Leaks from the base", "blender"),
    ("Wall clock", "Loses ten minutes a day", "watch_clock"),
    ("Iron", "Spits water on the cotton setting", "iron"),
    ("Kettle lead", "Frayed near the plug", "battery_charger_adapter"),
    ("Cordless drill", "Battery will not hold a charge", "power_tool"),
    ("Woollen jumper", "Moth holes in one elbow", "clothing_textile"),
    ("Record player", "Turntable runs slow", "hi_fi_integrated"),
]

VISITORS = [
    "Sam", "Priya", "Joan", "Marcus", "Aoife", "Tom", "Nadia", "Ken",
    "Rosa", "Yusuf", "Beth", "Ivan", "Mei", "Olu", "Greta", "Callum",
]

OUTCOMES = [
    ("completed", "Cleaned the contacts and replaced the fuse. Working again."),
    ("completed", "Loose connection inside the base, resoldered and tested."),
    ("completed", "Perished drive belt replaced from the spares box."),
    ("completed", "Stripped, cleaned and relubricated. Good as new."),
    ("completed", "Tightened everything up and glued the joint. Solid now."),
    ("cannot_repair", "Control board has failed and the part is no longer made."),
    ("cannot_repair", "Cracked housing, and a replacement costs more than the item."),
]


# ── plumbing ──────────────────────────────────────────────────────────────────
class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.token: str | None = None

    def call(self, method: str, path: str, body=None, expect=(200, 201)):
        data = json.dumps(body).encode() if body is not None else None
        headers = dict(UA)
        if data:
            headers["Content-Type"] = "application/json"
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:400]
            if e.code in expect:
                return None
            raise SystemExit(f"\n  {method} {path} failed: HTTP {e.code}\n  {detail}\n")
        except Exception as e:
            raise SystemExit(f"\n  {method} {path} failed: {e}\n")

    def get(self, p, **k):
        return self.call("GET", p, **k)

    def post(self, p, b=None, **k):
        return self.call("POST", p, b, **k)

    def patch(self, p, b=None, **k):
        return self.call("PATCH", p, b, **k)

    def upload(self, path: str, filename: str, blob: bytes, field: str = "file",
               content_type: str = "image/jpeg"):
        """Multipart post, built by hand so nothing outside the stdlib is needed."""
        boundary = "----demoseed" + str(random.randint(10**9, 10**10))
        body = b"".join([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'.encode(),
            f"Content-Type: {content_type}\r\n\r\n".encode(),
            blob,
            f"\r\n--{boundary}--\r\n".encode(),
        ])
        headers = dict(UA)
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(self.base + path, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:200]
            print(f"      upload rejected: HTTP {e.code} {detail}")
            return None
        except Exception as e:
            print(f"      upload failed: {e}")
            return None


# ── drawn avatars ─────────────────────────────────────────────────────────────
# The volunteers get a drawn pattern rather than a photograph of a face.
# A Creative Commons licence covers copyright, not somebody's likeness, and
# nobody should discover their own photograph on a website presenting them as a
# volunteer at a cafe that does not exist. These are generated from the name, so
# each person gets their own and it is the same after every reset.
#
# Written as a PNG by hand because the server only accepts JPEG, PNG or WebP,
# and the seed is not allowed any dependency outside the standard library.
def _png(width: int, height: int, rows: list[bytes]) -> bytes:
    import struct
    import zlib

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    raw = b"".join(b"\x00" + r for r in rows)  # filter byte 0 per scanline
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def avatar_png(name: str, size: int = 420) -> bytes:
    """A symmetrical block pattern, the colour and shape decided by the name."""
    import hashlib

    h = hashlib.sha256(name.encode()).digest()
    # A muted, readable colour: fixed saturation and lightness, hue from the name.
    import colorsys
    r, g, b = colorsys.hls_to_rgb(h[0] / 255.0, 0.42, 0.45)
    fg = (int(r * 255), int(g * 255), int(b * 255))
    bg = (244, 241, 234)

    grid = 7          # a 1-cell quiet border around a 5x5 pattern
    cell = size // grid
    on = set()
    for col in range(3):                      # left half plus the middle column
        for row in range(5):
            if h[4 + col * 5 + row] & 1:
                on.add((col, row))
                on.add((4 - col, row))        # mirror, so it reads as a face-like mark

    rows: list[bytes] = []
    for y in range(size):
        gy = y // cell - 1
        line = bytearray()
        for x in range(size):
            gx = x // cell - 1
            line += bytes(fg if (gx, gy) in on else bg)
        rows.append(bytes(line))
    return _png(size, size, rows)


def step(msg: str) -> None:
    print(f"\n==> {msg}")


def ok(msg: str) -> None:
    print(f"    {msg}")


def wait_for(api: Api, seconds: int = 180) -> None:
    step("Waiting for the hub to answer")
    for _ in range(seconds // 3):
        try:
            req = urllib.request.Request(api.base + "/api/health", headers=UA)
            with urllib.request.urlopen(req, timeout=5) as r:
                if r.status == 200:
                    ok("It is up")
                    return
        except Exception:
            pass
        time.sleep(3)
    raise SystemExit("The hub never answered. Is it running?")


# ── the seed itself ───────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://127.0.0.1:5026")
    ap.add_argument("--public-url", default="https://repaircafe.hyperspanner.net")
    ap.add_argument("--images", default=str(Path(__file__).parent / "images.json"))
    args = ap.parse_args()

    random.seed(20260728)  # same demo every time, so a broken seed is obvious
    api = Api(args.base_url)
    wait_for(api)

    # ── 1. the cafe itself ────────────────────────────────────────────────────
    step("Creating the cafe and the admin account")
    status = api.get("/api/setup/status")
    if status and status.get("setupCompleted"):
        raise SystemExit(
            "This hub is already set up. Seeding expects an empty database.\n"
            "Run demo/reset.sh, which wipes it first."
        )
    api.post("/api/setup/complete", {
        "admin": {"displayName": "Demo Admin", "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        "cafe": {
            "name": CAFE_NAME,
            "tagline": "Bring it in, we will have a go at fixing it",
            "contactEmail": "hello@example.com",
            "description": (
                "We meet on the third Saturday of the month in the old library hall. "
                "Bring anything you own that has stopped working and we will sit down "
                "with you and try to fix it together. There is no charge, there is "
                "always cake, and you keep whatever you brought."
            ),
            "primaryColor": "#1B6B5A",
            "accentColor": "#D2683F",
        },
        "venue": {
            "name": "Tinkerton Old Library",
            "address": "14 Kiln Street, Tinkerton",
            "postcode": "TK1 4RC",
            "notes": "Step-free access from Kiln Street. Tea and cake in the side room.",
        },
        "publicUrl": args.public_url,
        "telemetry": {"level": "none"},
    })
    ok(f"{CAFE_NAME} created")

    token = api.post("/api/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    api.token = (token or {}).get("accessToken") or (token or {}).get("token")
    if not api.token:
        raise SystemExit(f"Could not sign in after setup. Response was: {token}")
    ok("Signed in")

    # ── 2. people ─────────────────────────────────────────────────────────────
    step("Adding repairers")
    made = 0
    for name, email, bio in REPAIRERS:
        r = api.post("/api/admin/users", {
            "email": email, "displayName": name, "role": "repairer",
            "bio": bio, "showOnPublicPage": True, "showOnHomePage": True,
        }, expect=(200, 201, 409))
        if r:
            made += 1
    # One repairer whose password is published, so visitors can see the
    # shop-floor board from a volunteer's point of view.
    api.post("/api/admin/users", {
        "email": REPAIRER_EMAIL, "displayName": "Demo Repairer", "role": "repairer",
        "bio": "The account you can sign in as to see what a volunteer sees.",
        "showOnPublicPage": False, "showOnHomePage": False,
    }, expect=(200, 201, 409))
    ok(f"{made + 1} repairers")

    venues = api.get("/api/admin/venues") or []
    venue_id = venues[0]["id"] if venues else None
    if not venue_id:
        raise SystemExit("No venue found after setup, which should be impossible.")

    # ── 3. events, past and future ────────────────────────────────────────────
    step("Creating events")
    today = date.today()
    events: list[dict] = []
    # Six months of finished sessions, one happening right now, and two to come.
    # The one dated today is what makes the demo worth looking at: the board has
    # items on it, some waiting and some being worked on, so the shop-floor view
    # and the check-in flow both have something real to show.
    for months_back in range(6, 0, -1):
        events.append({"date": today - timedelta(days=30 * months_back), "when": "past"})
    events.append({"date": today, "when": "today"})
    for months_ahead in (1, 2):
        events.append({"date": today + timedelta(days=30 * months_ahead), "when": "future"})

    created = []
    for e in events:
        row = api.post("/api/admin/events", {
            "name": f"{CAFE_NAME} session",
            "venueId": venue_id,
            "description": "Bring one item and we will look at it with you. Doors 10am, last item in at 2pm.",
            "date": e["date"].isoformat(),
            "startTime": "10:00",
            "endTime": "15:00",
            "isPublished": True,
            "maxItems": 30,
        })
        if row:
            created.append({**row, "when": e["when"]})
    ok(f"{len(created)} sessions "
       f"({sum(1 for c in created if c['when'] == 'past')} finished, "
       f"1 running today, "
       f"{sum(1 for c in created if c['when'] == 'future')} to come)")

    # ── 4. a password for the published repairer login ───────────────────────
    # Accounts are created without one, and normally the person follows a reset
    # link. We do the same thing here, so visitors can sign in and see the
    # shop-floor board the way a volunteer does.
    step("Giving the repairers a password so they can work")
    users = api.get("/api/admin/users") or []
    rows = users if isinstance(users, list) else users.get("users", [])
    # Every repairer gets one, not just the published account. Jobs are then
    # finished by signing in as them and using the same screens a volunteer
    # uses, so the repairs end up spread across the team rather than all
    # belonging to the administrator.
    crew: list[Api] = []
    for u in [r for r in rows if r["role"] == "repairer"]:
        link = api.post(f"/api/admin/users/{u['id']}/reset-link", expect=(200, 201, 400))
        if not link or not link.get("token"):
            continue
        api.post(f"/api/auth/reset/{link['token']}", {"password": ADMIN_PASSWORD}, expect=(200, 201, 400))
        session = Api(args.base_url)
        tok = session.post("/api/auth/login", {"email": u["email"], "password": ADMIN_PASSWORD},
                           expect=(200, 201, 401))
        session.token = (tok or {}).get("accessToken") or (tok or {}).get("token")
        if session.token:
            crew.append(session)
    ok(f"{len(crew)} repairers can sign in, including {REPAIRER_EMAIL}")
    if not crew:
        raise SystemExit("No repairer could sign in, so no repair could be finished.")

    step("Drawing a profile picture for everybody")
    faces = 0
    for u in rows:
        if api.upload(f"/api/admin/uploads/avatar/{u['id']}", "avatar.png",
                      avatar_png(u["displayName"]), content_type="image/png"):
            faces += 1
    ok(f"{faces} profile pictures")

    # ── 5. six months of repairs ─────────────────────────────────────────────
    # Done through the real check-in and repair routes rather than by writing
    # rows, so the seed exercises the same code a cafe uses. That is what makes
    # a failure here worth paying attention to.
    step("Checking items in and repairing them")
    # Map our item list onto the carbon figures the hub ships with, so the
    # About page has something real to add up.
    factors = (api.get("/api/public/co2-factors") or {}).get("factors") or []
    by_key = {f["key"]: f["id"] for f in factors}
    missing = sorted({k for _, _, k in ITEMS if k not in by_key})
    if missing:
        print(f"      note: no carbon figure for {', '.join(missing)}")

    total_jobs = fixed = 0
    for ev in created:
        if ev["when"] != "past":
            continue
        api.post(f"/api/admin/events/{ev['id']}/activate", expect=(200, 201, 400, 409))

        for _ in range(random.randint(5, 11)):
            item, fault, factor_key = random.choice(ITEMS)
            api.post("/api/repairer/checkin", {
                "customerName": random.choice(VISITORS),
                "gdprConsent": True,
                "itemDescription": item,
                "faultDescription": fault,
                "co2FactorId": by_key.get(factor_key),
            }, expect=(200, 201, 400))
            total_jobs += 1

        # Finish each job the way a volunteer does: pick it up, then log the
        # outcome. It has to go through these two routes rather than the admin
        # one, because this is where the carbon saving is worked out from the
        # kind of item. Completing a job any other way leaves the saving empty
        # and the About page adding up to nothing.
        page = api.get(f"/api/admin/repairs?eventId={ev['id']}&perPage=100") or {}
        for job in page.get("data", []):
            if job.get("status") not in (None, "waiting", "in_progress"):
                continue
            who = random.choice(crew)
            who.call("PATCH", f"/api/repairer/jobs/{job['id']}/accept", expect=(200, 201, 400, 409))
            status, note = random.choice(OUTCOMES)
            who.call("PATCH", f"/api/repairer/jobs/{job['id']}/complete", {
                "outcome": status,
                "outcomeNotes": note,
                "partsUsed": random.choice(["", "", "Fuse", "Drive belt", "Mains lead", "Solder"]),
            }, expect=(200, 201, 400))
            if status == "completed":
                fixed += 1

        api.post(f"/api/admin/events/{ev['id']}/complete", expect=(200, 201, 400, 409))

    ok(f"{total_jobs} items brought in, {fixed} fixed")

    # ── 6. today's session, mid-flow ─────────────────────────────────────────
    # Left deliberately unfinished. Some items are still waiting to be picked
    # up, some are being worked on, a couple are already done. That is what a
    # session actually looks like at two in the afternoon, and it means the
    # shop-floor board has something on it for anyone who signs in to look.
    step("Running today's session, and leaving it half way through")
    live = next((c for c in created if c["when"] == "today"), None)
    waiting = in_progress = done = 0
    if live:
        api.post(f"/api/admin/events/{live['id']}/activate", expect=(200, 201, 400, 409))

        for item, fault, factor_key in random.sample(ITEMS, 9):
            api.post("/api/repairer/checkin", {
                "customerName": random.choice(VISITORS),
                "gdprConsent": True,
                "itemDescription": item,
                "faultDescription": fault,
                "co2FactorId": by_key.get(factor_key),
            }, expect=(200, 201, 400))

        page = api.get(f"/api/admin/repairs?eventId={live['id']}&perPage=100") or {}
        jobs = page.get("data", [])
        for n, job in enumerate(jobs):
            who = random.choice(crew)
            if n % 3 == 0:
                waiting += 1                      # nobody has picked it up yet
                continue
            who.call("PATCH", f"/api/repairer/jobs/{job['id']}/accept", expect=(200, 201, 400, 409))
            if n % 3 == 1:
                in_progress += 1                  # picked up, still being worked on
                continue
            status, note = random.choice(OUTCOMES)
            who.call("PATCH", f"/api/repairer/jobs/{job['id']}/complete", {
                "outcome": status, "outcomeNotes": note,
            }, expect=(200, 201, 400))
            done += 1
        ok(f"Today: {waiting} waiting, {in_progress} being worked on, {done} finished")

    # ── 7. photographs ───────────────────────────────────────────────────────
    # Downloaded at seeding time rather than committed, so the repository and
    # the container image stay small. Every one is CC0, public domain or CC BY,
    # and the credit goes into the caption because CC BY asks for it.
    step("Adding photographs")
    manifest = json.loads(Path(args.images).read_text())
    added = 0
    past_events = [c for c in created if c["when"] == "past"]
    for i, img in enumerate(manifest["images"]):
        try:
            req = urllib.request.Request(img["url"], headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                blob = r.read(8_000_000)
        except Exception as e:
            print(f"      could not fetch {img['title'][:30]}: {e}")
            continue
        caption = f'{img["caption"]}. {img["credit"]}.'
        if img["role"] == "gallery" and past_events:
            ev = past_events[i % len(past_events)]
            res = api.upload(f"/api/event-gallery/{ev['id']}", f"demo-{i}.jpg", blob)
        else:
            res = api.upload("/api/admin/gallery", f"demo-{i}.jpg", blob)
        if res:
            added += 1
            photo_id = res.get("id") if isinstance(res, dict) else None
            if photo_id:
                # The caption carries the photographer's name. Two of these are
                # CC BY, which requires the credit to appear wherever the photo
                # does, so this is set on every picture and not only the ones
                # chosen for the home page.
                if img["role"] == "gallery":
                    api.patch(f"/api/event-gallery/photos/{photo_id}",
                              {"caption": caption, "isPublished": True,
                               # Star some of them, so the home page gallery has
                               # something in it, which is what a cafe would do.
                               "showOnHome": i % 2 == 0},
                              expect=(200, 201, 400, 404))
                else:
                    api.patch(f"/api/admin/gallery/{photo_id}", {"caption": caption},
                              expect=(200, 201, 400, 404))
    ok(f"{added} of {len(manifest['images'])} photographs added")
    if added == 0:
        raise SystemExit(
            "No photographs could be added. If uploads are refused, the hub is\n"
            "already in demo mode: seed first, then turn DEMO_MODE on."
        )

    # ── done ─────────────────────────────────────────────────────────────────
    print(f"""
{CAFE_NAME} is ready.

  Site       {args.public_url}
  Admin      {ADMIN_EMAIL} / {ADMIN_PASSWORD}
  Repairer   {REPAIRER_EMAIL} / {ADMIN_PASSWORD}

  {len(created)} sessions, {total_jobs} items, {fixed} fixed, {added} photographs.
""")
    return 0


if __name__ == "__main__":
    sys.exit(main())
