const UYARI = "Tarihleri resmi kaynaktan kontrol edin.";
const GUN = 86400000;

export function normalize(metin) {
  return metin.toLocaleLowerCase("tr").replaceAll("ı", "i")
    .normalize("NFKD").replace(/\p{M}/gu, "");
}

export function filtrele(kayitlar, { ogrenim, kategori, arama = "" }) {
  const kelimeler = normalize(arama).trim().split(/\s+/);
  return kayitlar.filter(k => {
    if (ogrenim && ogrenim !== "hepsi" && !k.ogrenim.includes(ogrenim) && !k.ogrenim.includes("hepsi")) return false;
    if (kategori && k.kategori !== kategori) return false;
    const metin = normalize([k.id, k.baslik, k.kurum, k.kategori, k.notlar, ...k.belgeler].join(" "));
    return kelimeler.every(kelime => metin.includes(kelime));
  });
}

function karsilastir(a, b) {
  return a < b ? -1 : Number(a > b);
}

export function yaklasan(kayitlar, bugun) {
  return kayitlar.flatMap(k => {
    const tarihler = [k.baslangic, k.bitis].filter(tarih => tarih && tarih >= bugun).sort();
    if (!tarihler.length) return [];
    return [{ ...k, kalanGun: (Date.parse(tarihler[0]) - Date.parse(bugun)) / GUN }];
  }).sort((a, b) => a.kalanGun - b.kalanGun || karsilastir(a.id, b.id));
}

export const ONCELIKLER = ["yüksek", "normal", "düşük"];

function oncelik(kategori, { yurt, burs, sinif }) {
  if (kategori === "kyk-yurt" && yurt) {
    return yurt === "evet"
      ? [2, "KYK yurdunda kalıyorsun. Başvurunun durumuna uygunluğunu kontrol et."]
      : [0, "KYK yurdunda kalmıyorsun. Yurt başvurusu koşullarını incele."];
  }
  if (["kyk-burs", "vgm"].includes(kategori) && burs) {
    return burs === "evet"
      ? [2, "Mevcut bursunla birlikte başvuru koşullarını kontrol et."]
      : [0, "Burs almadığın için bu başvurunun koşullarını öncelikle incele."];
  }
  if (kategori === "gecis" && sinif === 1) {
    return [0, "İlk sınıftaysan geçiş koşullarını ve başvuru dönemini erkenden incele."];
  }
  return [1, "Öğrenim düzeyine uygun."];
}

export function kontrolListesi(kayitlar, bugun, profil) {
  return filtrele(kayitlar, { ogrenim: profil.ogrenim })
    .filter(k => !(k.bitis || k.baslangic) || (k.bitis || k.baslangic) >= bugun)
    .map(k => {
      const [sira, neden] = oncelik(k.kategori, profil);
      return { ...k, sira, neden };
    })
    .sort((a, b) => a.sira - b.sira || Number(!a.bitis) - Number(!b.bitis)
      || karsilastir(a.bitis || a.baslangic || "", b.bitis || b.baslangic || "")
      || karsilastir(a.id, b.id));
}

export function istanbulBugun(simdi = new Date()) {
  const parcalar = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(simdi);
  return ["year", "month", "day"].map(tur => parcalar.find(p => p.type === tur).value).join("-");
}

export function icsMetin(metin) {
  return metin.replaceAll("\\", "\\\\").replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;").replaceAll(",", "\\,");
}

export function katla(satir) {
  const encoder = new TextEncoder();
  const parcalar = [];
  let parca = "";
  let uzunluk = 0;
  for (const karakter of satir) {
    const oktet = encoder.encode(karakter).length;
    if (uzunluk + oktet > 75) {
      parcalar.push(parca);
      parca = " ";
      uzunluk = 1;
    }
    parca += karakter;
    uzunluk += oktet;
  }
  return [...parcalar, parca].join("\r\n");
}

export function kayitIcs(k, guncelleme) {
  const ilk = k.baslangic || k.bitis;
  if (!ilk) return "";
  const son = new Date(Date.parse(k.bitis || ilk) + GUN).toISOString().slice(0, 10);
  const tarih = deger => deger.replaceAll("-", "");
  const baslik = icsMetin((k.dogrulandi ? "" : "⚠ ") + k.baslik);
  const aciklama = icsMetin([k.notlar, `Kaynak: ${k.kaynak_url}`, UYARI].filter(Boolean).join("\n"));
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Burs Takvimi//TR", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${icsMetin(k.id + "@burs-takvimi")}`,
    `DTSTAMP:${tarih(guncelleme)}T000000Z`, `DTSTART;VALUE=DATE:${tarih(ilk)}`,
    `DTEND;VALUE=DATE:${tarih(son)}`, `SUMMARY:${baslik}`, `DESCRIPTION:${aciklama}`,
    `URL:${k.kaynak_url}`, "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER;RELATED=END:-P4D",
    `DESCRIPTION:${baslik}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR", "",
  ].map(katla).join("\r\n");
}

export function claudePrompt(kayitlar) {
  return [
    "Aşağıdaki burs, yurt, staj ve öğrenim takvimi kayıtlarını Türkçe özetle. Başvuru adımlarını ve önemli tarihleri belirt. Doğrulanmamış tarihleri uyarıyla işaretle ve resmi kaynakları göster.",
    ...kayitlar.map(k => `- ${k.baslik} | Başlangıç ${k.baslangic ?? "belirtilmemiş"}, bitiş ${k.bitis ?? "belirtilmemiş"} | ${k.dogrulandi ? "Doğrulandı" : "Doğrulanmadı"} | ${k.kaynak_url}`),
  ].join("\n");
}

