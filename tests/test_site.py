import unittest
from datetime import timedelta

from burs_takvimi.data import VARSAYILAN_VERI, iso_tarih, takvimi_yukle
from burs_takvimi.site import DOCS, takvim_ics


class SiteTest(unittest.TestCase):
    def test_yayin_dosyalari_guncel(self):
        mesaj = "python3 -m burs_takvimi build-site komutunu çalıştırın."
        self.assertEqual((DOCS / "takvim.json").read_bytes(), VARSAYILAN_VERI.read_bytes(), mesaj)
        self.assertEqual((DOCS / "takvim.ics").read_bytes(), takvim_ics(takvimi_yukle(VARSAYILAN_VERI)), mesaj)

    def test_ics_bicimi(self):
        veri = takvimi_yukle(VARSAYILAN_VERI)
        ics = takvim_ics(veri)
        self.assertTrue(ics.endswith(b"\r\n"))
        fiziksel = ics.split(b"\r\n")
        for satir in fiziksel:
            self.assertLessEqual(len(satir), 75)
            self.assertNotIn(b"\n", satir)
            self.assertNotIn(b"\r", satir)
            satir.decode("utf-8")
        self.assertTrue(any(satir.startswith(b" ") for satir in fiziksel))

        acik = ics.replace(b"\r\n ", b"").decode()
        self.assertTrue(acik.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:"))
        self.assertTrue(acik.endswith("END:VCALENDAR\r\n"))
        etkinlikler = acik.split("BEGIN:VEVENT\r\n")[1:]
        tarihli = [k for k in veri["entries"] if k["baslangic"] or k["bitis"]]
        self.assertEqual(len(etkinlikler), len(tarihli))
        for etkinlik, kayit in zip(etkinlikler, tarihli):
            with self.subTest(kayit=kayit["id"]):
                satirlar = etkinlik.split("\r\n")
                ilk = iso_tarih(kayit["baslangic"] or kayit["bitis"])
                son = iso_tarih(kayit["bitis"]) if kayit["bitis"] else ilk
                self.assertIn(f"UID:{kayit['id']}@burs-takvimi", satirlar)
                self.assertIn(f"DTSTART;VALUE=DATE:{ilk:%Y%m%d}", satirlar)
                self.assertIn(f"DTEND;VALUE=DATE:{son + timedelta(days=1):%Y%m%d}", satirlar)
                self.assertRegex(etkinlik, r"DTSTAMP:\d{8}T\d{6}Z\r\n")
                self.assertIn(f"URL:{kayit['kaynak_url']}", satirlar)
                self.assertIn("resmi kaynaktan kontrol edin.", etkinlik)
                self.assertIn("BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER;RELATED=END:-P4D\r\n", etkinlik)
                self.assertIn("END:VALARM\r\nEND:VEVENT\r\n", etkinlik)
                self.assertEqual("SUMMARY:⚠ " in etkinlik, not kayit["dogrulandi"])

    def test_ics_tek_tarih_ve_metin_kacislari(self):
        veri = takvimi_yukle(VARSAYILAN_VERI)
        kayit = dict(veri["entries"][0], baslik="Çığ, A; B\\C\r\nD\rE",
                     baslangic=None, bitis="2028-02-29", dogrulandi=True, notlar="Bir\niki")
        ics = takvim_ics({**veri, "entries": [kayit]}).replace(b"\r\n ", b"").decode()
        self.assertIn("SUMMARY:Çığ\\, A\\; B\\\\C\\nD\\nE\r\n", ics)
        self.assertIn("DESCRIPTION:Bir\\niki\\nKaynak:", ics)
        self.assertIn("DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301\r\n", ics)
        kayit.update(baslangic="2028-12-31", bitis=None)
        self.assertIn(b"DTEND;VALUE=DATE:20290101\r\n", takvim_ics({**veri, "entries": [kayit]}))

    def test_yayin_boyutu(self):
        self.assertLess(sum(dosya.stat().st_size for dosya in DOCS.iterdir() if dosya.is_file()), 60_000)
