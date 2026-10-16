"""Discover current official MBS XML and IMAP sources."""
from __future__ import annotations

import html
import re
import ssl
from datetime import date, datetime
from urllib.parse import urljoin
from urllib.request import Request, urlopen

import certifi


BASE_URL = "https://www.mbsonline.gov.au"
DOWNLOADS_URL = (
    BASE_URL
    + "/internet/mbsonline/publishing.nsf/Content/downloads"
)

USER_AGENT = "MediBridge-data-refresh/1.0"


def _fetch_text(url: str) -> str:
    context = ssl.create_default_context(cafile=certifi.where())
    request = Request(url, headers={"User-Agent": USER_AGENT})

    with urlopen(request, context=context, timeout=30) as response:
        raw = response.read()

    return raw.decode("iso-8859-1", errors="replace")


def _parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y%m%d").date()


def discover_current_sources(as_of: date | None = None) -> dict[str, str]:
    """Return the newest MBS XML and IMAP sources effective on or before as_of."""
    as_of = as_of or date.today()

    downloads_html = _fetch_text(DOWNLOADS_URL)

    period_matches = re.findall(
        r'href="([^"]*Downloads-(\d{8})[^"]*)"',
        downloads_html,
        flags=re.IGNORECASE,
    )

    valid_periods = [
        (_parse_date(date_text), urljoin(DOWNLOADS_URL, html.unescape(href)))
        for href, date_text in period_matches
        if _parse_date(date_text) <= as_of
    ]

    if not valid_periods:
        raise RuntimeError("No current MBS download period found.")

    effective_date, period_url = max(valid_periods, key=lambda item: item[0])

    period_html = _fetch_text(period_url)

    xml_matches = re.findall(
        r'href="([^"]*\$FILE/MBS-XML-(\d{8})\.XML)"',
        period_html,
        flags=re.IGNORECASE,
    )

    xml_candidates = [
        (date_text, urljoin(BASE_URL, html.unescape(href)))
        for href, date_text in xml_matches
        if _parse_date(date_text) <= as_of
    ]

    if not xml_candidates:
        raise RuntimeError("No current MBS XML link found.")

    xml_date, xml_url = max(
        xml_candidates,
        key=lambda item: _parse_date(item[0]),
    )

    imap_matches = re.findall(
        r'href="([^"]*\$FILE/(\d{8})_MBSONLINE_IMAP[^"]*\.TXT)"',
        downloads_html,
        flags=re.IGNORECASE,
    )

    imap_candidates = [
        (date_text, urljoin(BASE_URL, html.unescape(href)))
        for href, date_text in imap_matches
        if _parse_date(date_text) <= as_of
    ]

    if not imap_candidates:
        raise RuntimeError("No current IMAP link found.")

    imap_date, imap_url = max(
        imap_candidates,
        key=lambda item: _parse_date(item[0]),
    )

    return {
        "effective_date": effective_date.isoformat(),
        "xml_date": xml_date,
        "xml_url": xml_url,
        "imap_date": imap_date,
        "imap_url": imap_url,
    }


def download_file(url: str, destination: str) -> None:
    """Download an official MBS source file with TLS verification."""
    import shutil
    from pathlib import Path

    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)

    context = ssl.create_default_context(cafile=certifi.where())
    request = Request(url, headers={"User-Agent": USER_AGENT})

    with urlopen(request, context=context, timeout=60) as response:
        with path.open("wb") as output:
            shutil.copyfileobj(response, output)


def validate_mbs_xml(path: str) -> None:
    """Validate that a downloaded file looks like an MBS XML export."""
    from xml.etree import ElementTree as ET

    root = ET.parse(path).getroot()

    if root.tag != "MBS_XML":
        raise ValueError(f"Unexpected MBS XML root element: {root.tag}")

    if root.find("Data") is None:
        raise ValueError("MBS XML contains no Data records.")


def validate_imap(path: str) -> None:
    """Validate the header of an MBS IMAP TSV file."""
    with open(path, encoding="cp1252") as file:
        header = file.readline().strip().split("\t")

    if header[:2] != ["ITEM", "MAPPED_ITEM"]:
        raise ValueError(
            f"Unexpected IMAP header: {header[:2]}"
        )


def refresh_sources(xml_destination: str, imap_destination: str) -> dict[str, str]:
    """Download, validate, and atomically replace current MBS source files."""
    import tempfile
    from pathlib import Path

    sources = discover_current_sources()

    xml_destination_path = Path(xml_destination)
    imap_destination_path = Path(imap_destination)

    xml_destination_path.parent.mkdir(parents=True, exist_ok=True)
    imap_destination_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as folder:
        temp_dir = Path(folder)

        temp_xml = temp_dir / "mbs.xml"
        temp_imap = temp_dir / "imap.txt"

        download_file(sources["xml_url"], str(temp_xml))
        download_file(sources["imap_url"], str(temp_imap))

        validate_mbs_xml(str(temp_xml))
        validate_imap(str(temp_imap))

        temp_xml.replace(xml_destination_path)
        temp_imap.replace(imap_destination_path)

    return sources


def main() -> None:
    """Refresh the canonical MBS XML and IMAP source files."""
    from medibridge.config import IMAP_PATH, MBS_XML_PATH

    sources = refresh_sources(
        str(MBS_XML_PATH),
        str(IMAP_PATH),
    )

    print(f"MBS sources refreshed to {sources['effective_date']}")
    print(f"XML:  {sources['xml_date']} -> {MBS_XML_PATH}")
    print(f"IMAP: {sources['imap_date']} -> {IMAP_PATH}")


if __name__ == "__main__":
    main()
