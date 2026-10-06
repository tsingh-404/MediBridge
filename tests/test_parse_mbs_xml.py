"""Golden tests for MBS XML parser."""
from __future__ import annotations

from pathlib import Path
import textwrap

import pytest

from medibridge.data.parsers.mbs_xml import parse_mbs_xml


def _write(tmp_path: Path, body: str) -> Path:
    p = tmp_path / "mbs.xml"
    p.write_text(body, encoding="utf-8")
    return p


def test_active_item_parsed(tmp_path: Path) -> None:
    xml = textwrap.dedent("""\
    <?xml version="1.0" encoding="UTF-8"?><MBS_XML>
    <Data><ItemNum>23</ItemNum><Category>1</Category><Group>A1</Group>
    <ScheduleFee>43.90</ScheduleFee><Benefit100>43.90</Benefit100>
    <BenefitType>E</BenefitType><Description>GP attendance</Description>
    <ItemEndDate></ItemEndDate></Data>
    </MBS_XML>""")
    items = list(parse_mbs_xml(_write(tmp_path, xml)))
    assert len(items) == 1
    assert items[0].item_num == "23"
    assert items[0].schedule_fee == 43.90
    assert items[0].benefit_100 == 43.90
    assert items[0].benefit_type == "E"
    assert items[0].item_end_date is None


def test_expired_item_excluded(tmp_path: Path) -> None:
    xml = textwrap.dedent("""\
    <?xml version="1.0" encoding="UTF-8"?><MBS_XML>
    <Data><ItemNum>999</ItemNum><Category>1</Category><Group>A1</Group>
    <Description>old</Description><ItemEndDate>30.06.2020</ItemEndDate></Data>
    </MBS_XML>""")
    items = list(parse_mbs_xml(_write(tmp_path, xml)))
    assert items == []


def test_sentinel_normalized(tmp_path: Path) -> None:
    xml = textwrap.dedent("""\
    <?xml version="1.0" encoding="UTF-8"?><MBS_XML>
    <Data><ItemNum>5</ItemNum><Category>1</Category><Group>A1</Group>
    <Description>x</Description><ItemEndDate>31/12/9999</ItemEndDate></Data>
    </MBS_XML>""")
    items = list(parse_mbs_xml(_write(tmp_path, xml)))
    assert len(items) == 1
    assert items[0].item_end_date is None


@pytest.mark.skipif(not Path("knowledge/data/MBS-current.XML").exists(),
                    reason="Real XML not present")
def test_real_item_23() -> None:
    items = {it.item_num: it for it in parse_mbs_xml(Path("knowledge/data/MBS-current.XML"))}
    assert "23" in items
    assert items["23"].schedule_fee is not None
    assert items["23"].schedule_fee > 0
