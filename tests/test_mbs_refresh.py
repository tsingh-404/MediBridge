from pathlib import Path

import pytest

from medibridge.data.refresh.mbs import validate_imap, validate_mbs_xml


def test_validate_mbs_xml_accepts_valid_file(tmp_path: Path) -> None:
    path = tmp_path / "mbs.xml"
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<MBS_XML><Data><ItemNum>23</ItemNum></Data></MBS_XML>',
        encoding="utf-8",
    )

    validate_mbs_xml(str(path))


def test_validate_mbs_xml_rejects_wrong_root(tmp_path: Path) -> None:
    path = tmp_path / "bad.xml"
    path.write_text("<WrongRoot><Data /></WrongRoot>", encoding="utf-8")

    with pytest.raises(ValueError, match="Unexpected MBS XML root element"):
        validate_mbs_xml(str(path))


def test_validate_imap_accepts_valid_header(tmp_path: Path) -> None:
    path = tmp_path / "imap.txt"
    path.write_text(
        "ITEM\tMAPPED_ITEM\tItem_Start_Date\n23\t23\t01.01.2026\n",
        encoding="cp1252",
    )

    validate_imap(str(path))


def test_validate_imap_rejects_wrong_header(tmp_path: Path) -> None:
    path = tmp_path / "bad.txt"
    path.write_text(
        "WRONG\tHEADER\n",
        encoding="cp1252",
    )

    with pytest.raises(ValueError, match="Unexpected IMAP header"):
        validate_imap(str(path))


def test_refresh_sources_replaces_files_only_after_validation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from medibridge.data.refresh import mbs

    xml_destination = tmp_path / "current.xml"
    imap_destination = tmp_path / "current.txt"

    xml_destination.write_text("old xml", encoding="utf-8")
    imap_destination.write_text("old imap", encoding="cp1252")

    monkeypatch.setattr(
        mbs,
        "discover_current_sources",
        lambda: {
            "effective_date": "2026-08-01",
            "xml_date": "20260801",
            "xml_url": "https://example.test/mbs.xml",
            "imap_date": "20260801",
            "imap_url": "https://example.test/imap.txt",
        },
    )

    def fake_download(url: str, destination: str) -> None:
        path = Path(destination)

        if url.endswith("mbs.xml"):
            path.write_text(
                '<MBS_XML><Data><ItemNum>23</ItemNum></Data></MBS_XML>',
                encoding="utf-8",
            )
        else:
            path.write_text(
                "ITEM\tMAPPED_ITEM\tItem_Start_Date\n23\t23\t01.01.2026\n",
                encoding="cp1252",
            )

    monkeypatch.setattr(mbs, "download_file", fake_download)

    result = mbs.refresh_sources(
        str(xml_destination),
        str(imap_destination),
    )

    assert "<MBS_XML>" in xml_destination.read_text(encoding="utf-8")
    assert imap_destination.read_text(encoding="cp1252").startswith(
        "ITEM\tMAPPED_ITEM"
    )
    assert result["effective_date"] == "2026-08-01"


def test_refresh_sources_keeps_old_files_when_validation_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from medibridge.data.refresh import mbs

    xml_destination = tmp_path / "current.xml"
    imap_destination = tmp_path / "current.txt"

    xml_destination.write_text("old xml", encoding="utf-8")
    imap_destination.write_text("old imap", encoding="cp1252")

    monkeypatch.setattr(
        mbs,
        "discover_current_sources",
        lambda: {
            "effective_date": "2026-08-01",
            "xml_date": "20260801",
            "xml_url": "https://example.test/mbs.xml",
            "imap_date": "20260801",
            "imap_url": "https://example.test/imap.txt",
        },
    )

    def fake_download(url: str, destination: str) -> None:
        path = Path(destination)

        if url.endswith("mbs.xml"):
            path.write_text(
                '<MBS_XML><Data><ItemNum>23</ItemNum></Data></MBS_XML>',
                encoding="utf-8",
            )
        else:
            path.write_text(
                "BAD\tHEADER\n",
                encoding="cp1252",
            )

    monkeypatch.setattr(mbs, "download_file", fake_download)

    with pytest.raises(ValueError, match="Unexpected IMAP header"):
        mbs.refresh_sources(
            str(xml_destination),
            str(imap_destination),
        )

    assert xml_destination.read_text(encoding="utf-8") == "old xml"
    assert imap_destination.read_text(encoding="cp1252") == "old imap"


def test_discover_current_sources_ignores_future_release(monkeypatch):
    from datetime import date

    from medibridge.data.refresh import mbs

    downloads_html = """
    <a href="/internet/mbsonline/publishing.nsf/Content/Downloads-20260801">
        August 2026
    </a>
    <a href="/internet/mbsonline/publishing.nsf/Content/Downloads-20261101">
        November 2026
    </a>

    <a href="/internet/mbsonline/publishing.nsf/test/$FILE/20260801_MBSONLINE_IMAP.TXT">
        August IMAP
    </a>
    <a href="/internet/mbsonline/publishing.nsf/test/$FILE/20261101_MBSONLINE_IMAP.TXT">
        November IMAP
    </a>
    """

    august_html = """
    <a href="/internet/mbsonline/publishing.nsf/test/$FILE/MBS-XML-20260801.XML">
        August XML
    </a>
    """

    def fake_fetch_text(url):
        if url == mbs.DOWNLOADS_URL:
            return downloads_html

        if "Downloads-20260801" in url:
            return august_html

        raise AssertionError(f"Unexpected URL fetched: {url}")

    monkeypatch.setattr(mbs, "_fetch_text", fake_fetch_text)

    result = mbs.discover_current_sources(
        as_of=date(2026, 10, 6)
    )

    assert result["effective_date"] == "2026-08-01"
    assert result["xml_date"] == "20260801"
    assert result["imap_date"] == "20260801"
    assert "20260801" in result["xml_url"]
    assert "20260801" in result["imap_url"]
