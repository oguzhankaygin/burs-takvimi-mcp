"""Yerel takvim dosyasını doğrula ve yükle."""

import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
import sys

KATEGORILER = ("kyk-burs", "kyk-yurt", "vgm", "osym", "aof", "erasmus", "gecis", "staj", "diger")
OGRENIM = ("onlisans", "lisans", "yuksek-lisans", "doktora", "hepsi")
VARSAYILAN_VERI = Path(__file__).with_name("data") / "takvim.json"
ALANLAR = {
    "id", "baslik", "kurum", "kategori", "ogrenim", "baslangic", "bitis",
    "tekrar", "kaynak_url", "kontrol_tarihi", "dogrulandi", "notlar", "belgeler",
}


def iso_tarih(deger):
    if not isinstance(deger, str):
        raise ValueError("tarih YYYY-MM-DD biçiminde olmalı")
    tarih = date.fromisoformat(deger)
    if tarih.isoformat() != deger:
        raise ValueError("tarih YYYY-MM-DD biçiminde olmalı")
    return tarih


def bugun():
    sabit = os.environ.get("BURS_TAKVIMI_TODAY")
    if sabit is not None:
        return iso_tarih(sabit)
    return datetime.now(timezone(timedelta(hours=3))).date()


def _dolu_metin(deger):
    return isinstance(deger, str) and bool(deger.strip())


def _kaydi_dogrula(kayit):
    if not isinstance(kayit, dict) or kayit.keys() != ALANLAR:
        raise ValueError("kayıt alanları şemayla uyuşmuyor")
    for alan in ("id", "baslik", "kurum", "kaynak_url"):
        if not _dolu_metin(kayit[alan]):
            raise ValueError(f"{alan} boş olmayan bir metin olmalı")
    if kayit["kategori"] not in KATEGORILER:
        raise ValueError("geçersiz kategori")
    ogrenim = kayit["ogrenim"]
    if not isinstance(ogrenim, list) or not ogrenim or any(x not in OGRENIM for x in ogrenim):
        raise ValueError("geçersiz öğrenim listesi")
    url = kayit["kaynak_url"]
    parcalar = urlsplit(url)
    if (parcalar.scheme != "https" or not parcalar.hostname
            or parcalar.username is not None or any(c.isspace() for c in url)):
        raise ValueError("kaynak_url geçerli bir HTTPS adresi olmalı")
    # Port özelliği biçim ve aralık denetimini yapar.
    if parcalar.port == 0:
        raise ValueError("geçersiz kaynak portu")
    iso_tarih(kayit["kontrol_tarihi"])
    baslangic, bitis = (
        iso_tarih(kayit[alan]) if kayit[alan] is not None else None
        for alan in ("baslangic", "bitis")
    )
    if baslangic and bitis and baslangic > bitis:
        raise ValueError("başlangıç bitişten sonra olamaz")
    if kayit["tekrar"] not in ("yillik", None) or type(kayit["dogrulandi"]) is not bool:
        raise ValueError("geçersiz tekrar veya doğrulama durumu")
    if not isinstance(kayit["notlar"], str):
        raise ValueError("notlar metin olmalı")
    belgeler = kayit["belgeler"]
    if not isinstance(belgeler, list) or any(not _dolu_metin(x) for x in belgeler):
        raise ValueError("belgeler boş olmayan metinlerden oluşan bir liste olmalı")


def takvimi_yukle(dosya=None):
    yol = Path(dosya if dosya is not None else os.environ.get("BURS_TAKVIMI_DATA", VARSAYILAN_VERI))
    with yol.open(encoding="utf-8") as akim:
        veri = json.load(akim)
    if (not isinstance(veri, dict) or type(veri.get("version")) is not int
            or veri["version"] != 1 or not isinstance(veri.get("entries"), list)):
        raise ValueError("takvim version=1 ve entries listesi içermeli")
    iso_tarih(veri.get("updated"))
    kayitlar = {}
    for sira, kayit in enumerate(veri["entries"], start=1):
        try:
            _kaydi_dogrula(kayit)
            kimlik = kayit["id"]
            if kimlik in kayitlar:
                raise ValueError(f"yinelenen id {kimlik!r}")
            kayitlar[kimlik] = kayit
        except ValueError as hata:
            print(f"Takvim uyarısı (kayıt {sira}): {hata}", file=sys.stderr)
    return {"version": 1, "updated": veri["updated"], "entries": list(kayitlar.values())}
