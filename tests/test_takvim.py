import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from datetime import date
from pathlib import Path
from unittest.mock import patch

from burs_takvimi.data import bugun, takvimi_yukle
from burs_takvimi.tools import DOGRULANMAMIS, UYARI, calistir

BUGUN = date(2026, 11, 24)
KOK = Path(__file__).resolve().parents[1]


def ornek_veri():
    katalog = (
        ("kyk-burs-kredi", "KYK burs ve öğrenim kredisi", "kyk-burs", "hepsi"),
        ("kyk-yurt", "KYK yurt", "kyk-yurt", "hepsi"),
        ("yatay-gecis", "Yatay geçiş", "gecis", "lisans"),
        ("aof-sinav", "AÖF sınavı", "aof", "lisans"),
        ("erasmus-ogrenim", "Erasmus öğrenim hareketliliği", "erasmus", "hepsi"),
        ("osym-dgs", "DGS", "osym", "onlisans"),
    )
    kayitlar = [
        dict(id=kimlik, baslik=baslik, kurum="Test kurumu", kategori=kategori, ogrenim=[ogrenim],
             baslangic=None, bitis=None, tekrar="yillik", kaynak_url="https://example.org/",
             kontrol_tarihi=BUGUN.isoformat(), dogrulandi=False, notlar="", belgeler=[])
        for kimlik, baslik, kategori, ogrenim in katalog
    ]
    return {"version": 1, "updated": BUGUN.isoformat(), "entries": kayitlar}


class VeriTesti(unittest.TestCase):
    def test_paket_verisi_yuklenir(self):
        stderr = io.StringIO()
        with redirect_stderr(stderr):
            veri = takvimi_yukle(KOK / "burs_takvimi/data/takvim.json")
        self.assertEqual(stderr.getvalue(), "")
        self.assertTrue(veri["entries"])


    def test_gecersiz_kayitlari_atlar(self):
        veri = ornek_veri()
        gecerli = veri["entries"][0]
        veri["entries"] = [
            gecerli, gecerli, None, {**gecerli, "id": "http", "kaynak_url": "http://example.org"},
            {**gecerli, "id": "tarih", "bitis": "2026-02-30"},
            {**gecerli, "id": "sirasi", "baslangic": "2026-11-25", "bitis": "2026-11-24"},
            {**gecerli, "id": "bool", "dogrulandi": 1},
            {**gecerli, "id": "ogrenim", "ogrenim": ["gecersiz"]},
            {**gecerli, "id": "belgeler", "belgeler": "Belge"},
        ]
        with tempfile.TemporaryDirectory(dir=KOK / "tests") as dizin:
            yol = Path(dizin) / "test.json"
            yol.write_text(json.dumps(veri), encoding="utf-8")
            stderr = io.StringIO()
            with patch.dict(os.environ, {"BURS_TAKVIMI_DATA": str(yol)}), redirect_stderr(stderr):
                self.assertEqual(takvimi_yukle()["entries"], [gecerli])
            self.assertEqual(stderr.getvalue().count("Takvim uyarısı"), 8)
            veri["version"] = True
            yol.write_text(json.dumps(veri), encoding="utf-8")
            with self.assertRaises(ValueError):
                takvimi_yukle(yol)

    def test_bugun_ortam_degiskeni(self):
        with patch.dict(os.environ, {"BURS_TAKVIMI_TODAY": BUGUN.isoformat()}):
            self.assertEqual(bugun(), BUGUN)


class AracTesti(unittest.TestCase):
    def setUp(self):
        self.veri = ornek_veri()

    def test_turkce_arama(self):
        for sorgu, kimlik in (
            ("kredİsı OGRENIM", "kyk-burs-kredi"),
            ("GEÇİŞ yatay", "yatay-gecis"),
            ("AOF SINAVI", "aof-sinav"),
            ("HAREKETLILIGI", "erasmus-ogrenim"),
        ):
            with self.subTest(sorgu=sorgu):
                yanit = calistir("ara", {"sorgu": sorgu}, self.veri)
                kayitlar = yanit["structuredContent"]["kayitlar"]
                self.assertEqual([k["id"] for k in kayitlar], [kimlik])
                self.assertEqual(kayitlar[0]["dogrulama_durumu"], DOGRULANMAMIS)
                self.assertIn(DOGRULANMAMIS, yanit["content"][0]["text"])
                self.assertIn(UYARI, yanit["content"][0]["text"])

    def test_pencere_dahil_sinirlar_ve_filtreler(self):
        temel = self.veri["entries"][0]
        self.veri["entries"] = [
            {**temel, "baslangic": "2026-11-24", "bitis": "2026-12-01"},
            {**temel, "id": "acik", "baslangic": "2026-11-23", "bitis": "2026-11-25"},
            {**temel, "id": "uzak", "baslangic": None, "bitis": "2026-12-02"},
            {**temel, "id": "gecmis", "bitis": "2025-11-24"},
            {**temel, "id": "yurt", "kategori": "kyk-yurt", "bitis": "2026-11-24"},
            {**temel, "id": "onlisans", "ogrenim": ["onlisans"], "bitis": "2026-11-24"},
        ]
        args = {"gun": 7, "kategori": "kyk-burs", "ogrenim": "lisans"}
        sonuc = calistir("yaklasan_tarihler", args, self.veri, BUGUN)["structuredContent"]
        ilk, ikinci = sonuc["kayitlar"]
        self.assertEqual(ilk["id"], temel["id"])
        self.assertEqual([o["kalan_gun"] for o in ilk["olaylar"]], [0, 7])
        self.assertEqual(ikinci["id"], "acik")
        self.assertEqual(ikinci["olaylar"], [{"tur": "bitis", "tarih": "2026-11-25", "kalan_gun": 1}])
        args["gun"] = 0
        sonuc = calistir("yaklasan_tarihler", args, self.veri, BUGUN)["structuredContent"]
        self.assertEqual(len(sonuc["kayitlar"]), 1)

    def test_kontrol_listesi_profili_ve_son_tarih(self):
        ilk = self.veri["entries"][0]
        ilk.update(bitis="2026-12-02", belgeler=["Öğrenci belgesi"])
        self.veri["entries"].append({**ilk, "id": "gecmis", "bitis": "2026-11-23"})
        profil = {"ogrenim": "lisans", "sinif": 1, "burs_aliyor_mu": False, "kyk_yurdunda_mi": True}
        yanit = calistir("donem_kontrol_listesi", profil, self.veri, BUGUN)
        kayitlar = yanit["structuredContent"]["kayitlar"]
        self.assertEqual(kayitlar[0]["id"], ilk["id"])
        self.assertEqual(kayitlar[0]["son_tarih"], "2026-12-02")
        self.assertIn("Öğrenci belgesi", yanit["content"][0]["text"])
        oncelikler = {k["id"]: k["oncelik"] for k in kayitlar}
        self.assertEqual(oncelikler["kyk-yurt"], "düşük")
        self.assertEqual(oncelikler["yatay-gecis"], "yüksek")
        self.assertNotIn("osym-dgs", oncelikler)
        self.assertNotIn("gecmis", oncelikler)

    def test_parametre_dogrulama(self):
        for ad, args in (
            ("yaklasan_tarihler", {"gun": True}),
            ("yaklasan_tarihler", {"gun": -1}),
            ("ara", {}),
            ("ara", {"sorgu": "   "}),
            ("kaynaklar", {"fazla": True}),
            ("donem_kontrol_listesi", {"ogrenim": "lise"}),
        ):
            with self.subTest(ad=ad, args=args), self.assertRaises(ValueError):
                calistir(ad, args, self.veri)


def rpc(kimlik, metot, parametreler=None):
    istek = {"jsonrpc": "2.0", "method": metot}
    if kimlik is not None:
        istek["id"] = kimlik
    if parametreler is not None:
        istek["params"] = parametreler
    return json.dumps(istek)


class SunucuTesti(unittest.TestCase):
    def _oturum(self, *satirlar):
        with tempfile.TemporaryDirectory(dir=KOK / "tests") as dizin:
            yol = Path(dizin) / "test.json"
            yol.write_text(json.dumps(ornek_veri()), encoding="utf-8")
            env = {**os.environ, "BURS_TAKVIMI_TODAY": BUGUN.isoformat(), "BURS_TAKVIMI_DATA": str(yol)}
            islem = subprocess.run(
                [sys.executable, "-m", "burs_takvimi"], cwd=KOK, env=env,
                input="\n".join(satirlar) + "\n", encoding="utf-8", capture_output=True, timeout=10,
            )
        self.assertEqual(islem.returncode, 0, islem.stderr)
        self.assertEqual(islem.stderr, "")
        return [json.loads(satir) for satir in islem.stdout.splitlines()]

    def test_oturum_araclar_ve_kaynak(self):
        yanitlar = self._oturum(
            rpc(1, "initialize", {"protocolVersion": "2025-06-18"}),
            rpc(None, "notifications/initialized"),
            rpc(None, "bilinmeyen/bildirim"),
            rpc(2, "tools/list"), rpc(3, "tools/call", {"name": "ara", "arguments": {"sorgu": "KYK"}}),
            rpc(4, "resources/list"), rpc(5, "resources/read", {"uri": "takvim://tum"}),
            rpc(6, "ping"),
        )
        self.assertEqual([y["id"] for y in yanitlar], list(range(1, 7)))
        baslangic, araclar, arama, kaynaklar, kaynak, ping = [y["result"] for y in yanitlar]
        self.assertEqual(baslangic["protocolVersion"], "2025-06-18")
        self.assertEqual(set(baslangic["capabilities"]), {"tools", "resources"})
        self.assertEqual({a["name"] for a in araclar["tools"]},
                         {"yaklasan_tarihler", "ara", "donem_kontrol_listesi", "kaynaklar"})
        self.assertTrue(all(a["inputSchema"]["type"] == "object" for a in araclar["tools"]))
        self.assertEqual(arama["content"][0]["type"], "text")
        self.assertEqual(len(arama["structuredContent"]["kayitlar"]), 2)
        self.assertEqual(kaynaklar["resources"][0]["uri"], "takvim://tum")
        self.assertEqual(json.loads(kaynak["contents"][0]["text"]),
                         ornek_veri())
        self.assertEqual(ping, {})

    def test_istemci_surumu_ve_varsayilan(self):
        yeni, varsayilan = self._oturum(
            rpc("a", "initialize", {"protocolVersion": "2026-01-01"}), rpc("b", "initialize"),
        )
        self.assertEqual(yeni["id"], "a")
        self.assertEqual(yeni["result"]["protocolVersion"], "2026-01-01")
        self.assertEqual(varsayilan["result"]["protocolVersion"], "2025-06-18")

    def test_hata_kodlari_ve_devam(self):
        yanitlar = self._oturum(
            "{", "[]", '{"jsonrpc":"1.0","method":"ping","id":10}',
            '{"jsonrpc":"2.0","method":"ping","id":null}',
            rpc(1, "bilinmeyen"), rpc(2, "tools/call", {"name": "bilinmeyen"}),
            rpc(3, "tools/call", {"name": "ara", "arguments": []}),
            rpc(4, "ping", []), rpc(5, "resources/read", {"uri": "takvim://eksik"}), rpc(6, "ping"),
        )
        self.assertEqual([y["error"]["code"] for y in yanitlar[:-1]],
                         [-32700, -32600, -32600, -32600, -32601, -32602, -32602, -32602, -32002])
        self.assertEqual([y["id"] for y in yanitlar], [None] * 4 + list(range(1, 7)))
        self.assertEqual(yanitlar[-1]["result"], {})


if __name__ == "__main__":
    unittest.main()


class StajKategorisiTesti(unittest.TestCase):
    def test_gercek_veride_staj_kaydi_yaklasanlarda_gorunur(self):
        from burs_takvimi.data import takvimi_yukle
        from burs_takvimi.tools import yaklasan_tarihler
        from datetime import date
        sonuc = yaklasan_tarihler(takvimi_yukle()["entries"], date(2026, 11, 26), gun=30, kategori="staj")
        self.assertEqual([k["id"] for k in sonuc], ["ulusal-staj-programi"])
