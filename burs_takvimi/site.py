"""GitHub Pages için veri kopyasını ve iCalendar akışını üret."""

from datetime import timedelta

from .data import VARSAYILAN_VERI, iso_tarih, takvimi_yukle

DOCS = VARSAYILAN_VERI.parents[2] / "docs"


def _metin(deger):
    return (deger.replace("\\", "\\\\").replace("\r\n", "\n").replace("\r", "\n")
            .replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,"))


def _katla(satir):
    parcalar = []
    parca = bytearray()
    for karakter in satir:
        oktetler = karakter.encode("utf-8")
        if len(parca) + len(oktetler) > 75:
            parcalar.append(bytes(parca))
            parca = bytearray(b" ")
        parca.extend(oktetler)
    parcalar.append(bytes(parca))
    return b"\r\n".join(parcalar)


def takvim_ics(veri):
    satirlar = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Burs Takvimi//TR",
                "CALSCALE:GREGORIAN"]
    damga = veri["updated"].replace("-", "") + "T000000Z"
    for kayit in veri["entries"]:
        baslangic = kayit["baslangic"] or kayit["bitis"]
        if not baslangic:
            continue
        bitis = iso_tarih(kayit["bitis"] or baslangic) + timedelta(days=1)
        kaynak = kayit["kaynak_url"]
        baslik = ("" if kayit["dogrulandi"] else "⚠ ") + kayit["baslik"]
        aciklama = _metin("\n".join(filter(None, (
            kayit["notlar"], f"Kaynak: {kaynak}", "Tarihleri resmi kaynaktan kontrol edin.",
        ))))
        kimlik = _metin(kayit["id"] + "@burs-takvimi")
        satirlar.extend([
            "BEGIN:VEVENT",
            f"UID:{kimlik}",
            f"DTSTAMP:{damga}",
            f"DTSTART;VALUE=DATE:{baslangic.replace('-', '')}",
            f"DTEND;VALUE=DATE:{bitis.isoformat().replace('-', '')}",
            f"SUMMARY:{_metin(baslik)}",
            f"DESCRIPTION:{aciklama}",
            f"URL:{kaynak}",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            # DTEND, takvimde gösterilen son günden bir gün sonradır.
            "TRIGGER;RELATED=END:-P4D",
            f"DESCRIPTION:{_metin(baslik)}",
            "END:VALARM",
            "END:VEVENT",
        ])
    satirlar.append("END:VCALENDAR")
    return b"\r\n".join(map(_katla, satirlar)) + b"\r\n"


def siteyi_derle():
    veri = takvimi_yukle(VARSAYILAN_VERI)
    ics = takvim_ics(veri)
    DOCS.mkdir(exist_ok=True)
    (DOCS / "takvim.json").write_bytes(VARSAYILAN_VERI.read_bytes())
    (DOCS / "takvim.ics").write_bytes(ics)
