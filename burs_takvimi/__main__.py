"""MCP sunucusunu veya terminal arayüzünü başlat."""

import argparse
import sys

from .data import KATEGORILER, OGRENIM, bugun, takvimi_yukle
from .server import sun
from .tools import calistir, tablo


def _ayristirici():
    ayr = argparse.ArgumentParser(description="Burs ve Yurt Takvimi")
    kipler = ayr.add_subparsers(dest="kip")
    cli = kipler.add_parser("cli", help="Takvimi terminalde sorgula")
    komutlar = cli.add_subparsers(dest="komut", required=True)

    yaklasan = komutlar.add_parser("yaklasan", help="Yaklaşan tarihleri göster")
    yaklasan.set_defaults(arac="yaklasan_tarihler")
    yaklasan.add_argument("--gun", type=int, default=45)
    yaklasan.add_argument("--kategori", choices=KATEGORILER)
    yaklasan.add_argument("--ogrenim", choices=OGRENIM)

    arama = komutlar.add_parser("ara", help="Takvimde ara")
    arama.set_defaults(arac="ara")
    arama.add_argument("sorgu")

    kontrol = komutlar.add_parser("kontrol-listesi", help="Kişisel kontrol listesini göster")
    kontrol.set_defaults(arac="donem_kontrol_listesi")
    kontrol.add_argument("--ogrenim", choices=OGRENIM, required=True)
    kontrol.add_argument("--sinif", type=int)
    kontrol.add_argument("--kyk-yurdunda-mi", action=argparse.BooleanOptionalAction)
    kontrol.add_argument("--burs-aliyor-mu", action=argparse.BooleanOptionalAction)

    komutlar.add_parser("kaynaklar", help="Resmi kaynakları göster").set_defaults(arac="kaynaklar")
    return ayr


def _cli(sonuc):
    if "kaynaklar" in sonuc:
        print(tablo(("Kurum", "Kaynak"), [
            (k["kurum"], k["kaynak_url"]) for k in sonuc["kaynaklar"]
        ]))
    elif not sonuc["kayitlar"]:
        print("Uygun kayıt bulunamadı.")
    else:
        basliklar = ("Başlık", "Başlangıç", "Bitiş", "Kontrol tarihi", "Durum", "Kaynak")
        satirlar = []
        ilk = sonuc["kayitlar"][0]
        if "olaylar" in ilk:
            basliklar += ("En yakın tarihe kalan gün",)
        if "oncelik" in ilk:
            basliklar += ("Öncelik", "Belgeler")
        for k in sonuc["kayitlar"]:
            satir = (k["baslik"], k["baslangic"] or "—", k["bitis"] or "—",
                     k["kontrol_tarihi"], k["dogrulama_durumu"], k["kaynak_url"])
            if "olaylar" in k:
                satir += (str(k["kalan_gun"]),)
            if "oncelik" in k:
                satir += (k["oncelik"], ", ".join(k["belgeler"]) or "—")
            satirlar.append(satir)
        print(tablo(basliklar, satirlar))
    print(sonuc["uyari"])


def main():
    ayristirici = _ayristirici()
    secenekler = ayristirici.parse_args()
    try:
        veri = takvimi_yukle()
        if secenekler.kip == "cli":
            argumanlar = {ad: deger for ad, deger in vars(secenekler).items()
                          if ad not in ("kip", "komut", "arac") and deger is not None}
            _cli(calistir(secenekler.arac, argumanlar, veri)["structuredContent"])
        else:
            bugun()
            sun(veri)
    except (OSError, ValueError) as hata:
        print(f"Burs ve Yurt Takvimi: {hata}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
