"""MCP araçlarının şemaları, sorguları ve Türkçe çıktıları."""

import unicodedata

from .data import KATEGORILER, OGRENIM, bugun, iso_tarih

DOGRULANMAMIS = "⚠ doğrulanmamış"
UYARI = "⚠ Son tarihleri resmi kaynaktan kontrol et."
RESMI_KAYNAKLAR = (
    ("Gençlik ve Spor Bakanlığı Kredi ve Yurtlar Genel Müdürlüğü", "https://kygm.gsb.gov.tr/"),
    ("Vakıflar Genel Müdürlüğü", "https://www.vgm.gov.tr/"),
    ("Ölçme, Seçme ve Yerleştirme Merkezi", "https://www.osym.gov.tr/"),
    ("Anadolu Üniversitesi Açıköğretim Fakültesi", "https://aof.anadolu.edu.tr/"),
    ("Türkiye Ulusal Ajansı", "https://www.ua.gov.tr/"),
)


def _arac(ad, aciklama, alanlar, gerekli=()):
    return {
        "name": ad,
        "description": aciklama,
        "inputSchema": {
            "type": "object", "properties": alanlar,
            "required": list(gerekli), "additionalProperties": False,
        },
    }


OGRENIM_ALANI = {"type": "string", "enum": list(OGRENIM)}
ARACLAR = [
    _arac("yaklasan_tarihler", "Belirtilen gün aralığındaki başlangıç ve bitişleri kaynaklarıyla listeler.", {
        "gun": {"type": "integer", "minimum": 0, "default": 45},
        "kategori": {"type": "string", "enum": list(KATEGORILER)},
        "ogrenim": OGRENIM_ALANI,
    }),
    _arac("ara", "Takvimde Türkçe harf ve aksan farklarını yok sayarak arar.", {
        "sorgu": {"type": "string", "minLength": 1},
    }, ("sorgu",)),
    _arac("donem_kontrol_listesi", "Öğrenci profiline göre başvuruları ve belgeleri önceliklendirir.", {
        "ogrenim": OGRENIM_ALANI,
        "sinif": {"type": "integer", "minimum": 1},
        "kyk_yurdunda_mi": {"type": "boolean"},
        "burs_aliyor_mu": {"type": "boolean"},
    }, ("ogrenim",)),
    _arac("kaynaklar", "Takvimi kontrol etmek için resmi kurum adreslerini listeler.", {}),
]
SEMALAR = {arac["name"]: arac["inputSchema"] for arac in ARACLAR}


def dogrula(ad, argumanlar):
    if not isinstance(ad, str) or ad not in SEMALAR:
        raise ValueError("Bilinmeyen araç.")
    if not isinstance(argumanlar, dict):
        raise ValueError("arguments bir nesne olmalı.")
    sema = SEMALAR[ad]
    for alan in sema["required"]:
        if alan not in argumanlar:
            raise ValueError(f"Zorunlu alan eksik ({alan}).")
    tipler = {"integer": int, "boolean": bool, "string": str}
    for alan, deger in argumanlar.items():
        kural = sema["properties"].get(alan)
        if kural is None:
            raise ValueError(f"Bilinmeyen alan ({alan}).")
        if type(deger) is not tipler[kural["type"]]:
            raise ValueError(f"Geçersiz alan türü ({alan}).")
        if ("enum" in kural and deger not in kural["enum"]
                or "minimum" in kural and deger < kural["minimum"]
                or "minLength" in kural and not deger.strip()):
            raise ValueError(f"Geçersiz alan değeri ({alan}).")


def _ogrenime_uygun(kayit, ogrenim):
    return ogrenim in (None, "hepsi") or ogrenim in kayit["ogrenim"] or "hepsi" in kayit["ogrenim"]


def _durumlu(kayit):
    return {**kayit, "dogrulama_durumu": "doğrulandı" if kayit["dogrulandi"] else DOGRULANMAMIS}


def yaklasan_tarihler(kayitlar, tarih, gun=45, kategori=None, ogrenim=None):
    sonuc = []
    for kayit in kayitlar:
        if (kategori and kategori != kayit["kategori"]) or not _ogrenime_uygun(kayit, ogrenim):
            continue
        olaylar = []
        for alan in ("baslangic", "bitis"):
            if kayit[alan] is not None:
                kalan = (iso_tarih(kayit[alan]) - tarih).days
                if 0 <= kalan <= gun:
                    olaylar.append({"tur": alan, "tarih": kayit[alan], "kalan_gun": kalan})
        if olaylar:
            olaylar.sort(key=lambda olay: olay["kalan_gun"])
            sonuc.append({**_durumlu(kayit), "kalan_gun": olaylar[0]["kalan_gun"], "olaylar": olaylar})
    return sorted(sonuc, key=lambda kayit: (kayit["kalan_gun"], kayit["id"]))


def _normalize(metin):
    ayrik = unicodedata.normalize("NFKD", metin.casefold().replace("ı", "i"))
    return "".join(harf for harf in ayrik if not unicodedata.category(harf).startswith("M"))


def ara(kayitlar, sorgu):
    sozcukler = _normalize(sorgu).split()
    sonuc = []
    for kayit in kayitlar:
        alanlar = [kayit[alan] for alan in ("id", "baslik", "kurum", "kategori", "notlar")]
        metin = _normalize(" ".join(alanlar + kayit["belgeler"]))
        if sozcukler and all(sozcuk in metin for sozcuk in sozcukler):
            sonuc.append(_durumlu(kayit))
    return sonuc


def donem_kontrol_listesi(kayitlar, tarih, ogrenim, sinif=None,
                          kyk_yurdunda_mi=None, burs_aliyor_mu=None):
    sonuc = []
    for kayit in kayitlar:
        if not _ogrenime_uygun(kayit, ogrenim):
            continue
        baslangic = kayit["baslangic"]
        bitis = kayit["bitis"]
        son_bilinen_tarih = bitis or baslangic
        if son_bilinen_tarih and iso_tarih(son_bilinen_tarih) < tarih:
            continue
        kategori = kayit["kategori"]
        oncelik, neden = 1, "Öğrenim düzeyine uygun."
        if kategori == "kyk-yurt" and kyk_yurdunda_mi is not None:
            if kyk_yurdunda_mi:
                oncelik, neden = 2, "KYK yurdunda kalıyorsun. Başvurunun durumuna uygunluğunu kontrol et."
            else:
                oncelik, neden = 0, "KYK yurdunda kalmıyorsun. Yurt başvurusu koşullarını incele."
        elif kategori in ("kyk-burs", "vgm") and burs_aliyor_mu is not None:
            if burs_aliyor_mu:
                oncelik, neden = 2, "Mevcut bursunla birlikte başvuru koşullarını kontrol et."
            else:
                oncelik, neden = 0, "Burs almadığın için bu başvurunun koşullarını öncelikle incele."
        elif kategori == "gecis" and sinif == 1:
            oncelik, neden = 0, "İlk sınıftaysan geçiş koşullarını ve başvuru dönemini erkenden incele."
        sonuc.append({
            **_durumlu(kayit), "son_tarih": bitis, "oncelik": ("yüksek", "normal", "düşük")[oncelik],
            "oncelik_nedeni": neden,
        })
    sira = {"yüksek": 0, "normal": 1, "düşük": 2}
    return sorted(sonuc, key=lambda k: (sira[k["oncelik"]], k["bitis"] is None,
                                        k["bitis"] or k["baslangic"] or "", k["id"]))


def tablo(basliklar, satirlar):
    satirlar = [basliklar, *satirlar]
    genislikler = [max(map(len, sutun)) for sutun in zip(*satirlar)]
    bicim = " | ".join(f"{{:<{genislik}}}" for genislik in genislikler)
    return "\n".join([
        bicim.format(*basliklar), "-+-".join("-" * g for g in genislikler),
        *(bicim.format(*satir) for satir in satirlar[1:]),
    ])


def _kayit_metni(kayit):
    satirlar = [
        f"• {kayit['baslik']} ({kayit['kurum']}) — {kayit['dogrulama_durumu']}",
        f"  Başlangıç {kayit['baslangic'] or 'belirtilmemiş'}, bitiş {kayit['bitis'] or 'belirtilmemiş'}.",
        f"  Kaynak {kayit['kaynak_url']} (kontrol tarihi {kayit['kontrol_tarihi']}).",
    ]
    for olay in kayit.get("olaylar", []):
        tur = "Başlangıca" if olay["tur"] == "baslangic" else "Bitişe"
        satirlar.append(f"  {tur} {olay['kalan_gun']} gün ({olay['tarih']}).")
    if "oncelik" in kayit:
        belgeler = ", ".join(kayit["belgeler"]) or "belirtilmemiş"
        satirlar.append(f"  Öncelik {kayit['oncelik']}. {kayit['oncelik_nedeni']} Belgeler {belgeler}.")
    if kayit["notlar"]:
        satirlar.append(f"  {kayit['notlar']}")
    return "\n".join(satirlar)


def calistir(ad, argumanlar, veri, tarih=None):
    dogrula(ad, argumanlar)
    kayitlar = veri["entries"]
    if ad == "kaynaklar":
        kaynaklar = [{"kurum": kurum, "kaynak_url": url} for kurum, url in RESMI_KAYNAKLAR]
        metin = "\n".join(f"• {kurum} — {url}" for kurum, url in RESMI_KAYNAKLAR)
        sonuc = {"kaynaklar": kaynaklar}
    else:
        if ad == "ara":
            eslesen = ara(kayitlar, **argumanlar)
        else:
            tarih = tarih if tarih is not None else bugun()
            sorgu = yaklasan_tarihler if ad == "yaklasan_tarihler" else donem_kontrol_listesi
            eslesen = sorgu(kayitlar, tarih, **argumanlar)
        metin = "\n".join(map(_kayit_metni, eslesen)) or "Uygun kayıt bulunamadı."
        sonuc = {"kayitlar": eslesen, "veri_guncelleme_tarihi": veri["updated"]}
        if tarih is not None:
            sonuc["bugun"] = tarih.isoformat()
    sonuc["uyari"] = UYARI
    return {
        "content": [{"type": "text", "text": f"{metin}\n\n{UYARI}"}],
        "structuredContent": sonuc,
    }
