"use strict";

const UYARI = "Tarihleri resmi kaynaktan kontrol edin.";
const GUN = 86400000;

function normalize(metin) {
  return metin.toLocaleLowerCase("tr").replaceAll("ı", "i")
    .normalize("NFKD").replace(/\p{M}/gu, "");
}

function filtrele(kayitlar, { ogrenim, kategori, arama = "" }) {
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

function yaklasan(kayitlar, bugun) {
  return kayitlar.flatMap(k => {
    const tarihler = [k.baslangic, k.bitis].filter(tarih => tarih && tarih >= bugun).sort();
    if (!tarihler.length) return [];
    return [{ ...k, kalanGun: (Date.parse(tarihler[0]) - Date.parse(bugun)) / GUN }];
  }).sort((a, b) => a.kalanGun - b.kalanGun || karsilastir(a.id, b.id));
}

const ONCELIKLER = ["yüksek", "normal", "düşük"];

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

function kontrolListesi(kayitlar, bugun, profil) {
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

function istanbulBugun(simdi = new Date()) {
  const parcalar = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(simdi);
  return ["year", "month", "day"].map(tur => parcalar.find(p => p.type === tur).value).join("-");
}

function icsMetin(metin) {
  return metin.replaceAll("\\", "\\\\").replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;").replaceAll(",", "\\,");
}

function katla(satir) {
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

function kayitIcs(k, guncelleme) {
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

function claudePrompt(kayitlar) {
  return [
    "Aşağıdaki burs, yurt ve öğrenim takvimi kayıtlarını Türkçe özetle. Başvuru adımlarını ve önemli tarihleri belirt. Doğrulanmamış tarihleri uyarıyla işaretle ve resmi kaynakları göster.",
    ...kayitlar.map(k => `- ${k.baslik} | Başlangıç ${k.baslangic ?? "belirtilmemiş"}, bitiş ${k.bitis ?? "belirtilmemiş"} | ${k.dogrulandi ? "Doğrulandı" : "Doğrulanmadı"} | ${k.kaynak_url}`),
  ].join("\n");
}

function baslat() {
  const bul = id => document.getElementById(id);
  const ogrenim = bul("ogrenim");
  const kategori = bul("kategori");
  const arama = bul("arama");
  const kontrol = bul("kontrol");
  const sekmeler = [bul("yaklasan"), bul("tumu"), kontrol];
  const liste = bul("kayitlar");
  const sor = bul("claude");
  let secili = sekmeler[0];
  let veri;
  let eslesen = [];

  for (const alan of [ogrenim, kategori]) {
    const anahtar = `burs-takvimi-${alan.id}`;
    try {
      const deger = localStorage.getItem(anahtar);
      if ([...alan.options].some(secenek => secenek.value === deger)) alan.value = deger;
    } catch {
      // Depolama erişimi kapalıyken seçim bu sayfada çalışmaya devam eder.
    }
    alan.addEventListener("change", () => {
      try {
        localStorage.setItem(anahtar, alan.value);
      } catch {
        // Tarayıcı depolama erişimine izin vermeyebilir.
      }
      goster();
    });
  }

  const abonelik = new URL("./takvim.ics", location.href);
  bul("https").href = abonelik.href;
  bul("webcal").href = `webcal://${abonelik.host}${abonelik.pathname}`;

  function ekle(ebeveyn, tur, metin, sinif) {
    const eleman = document.createElement(tur);
    eleman.textContent = metin;
    if (sinif) eleman.className = sinif;
    ebeveyn.append(eleman);
    return eleman;
  }

  function indir(k) {
    const url = URL.createObjectURL(new Blob([kayitIcs(k, veri.updated)], { type: "text/calendar;charset=utf-8" }));
    const baglanti = document.createElement("a");
    baglanti.href = url;
    baglanti.download = `${k.id}.ics`;
    document.body.append(baglanti);
    baglanti.click();
    baglanti.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function kart(k) {
    const satir = ekle(liste, "li", "");
    ekle(satir, "h2", k.baslik);
    const tarih = k.baslangic || k.bitis
      ? `Başlangıç ${k.baslangic ?? "belirtilmemiş"} · Bitiş ${k.bitis ?? "belirtilmemiş"}`
      : "Tarih henüz belirtilmemiş";
    ekle(satir, "p", `${k.kurum} · ${tarih}`, "meta");
    const durum = ekle(satir, "div", "");
    ekle(durum, "span", k.dogrulandi ? "Doğrulandı" : "⚠ Doğrulanmadı",
      k.dogrulandi ? "etiket onay" : "etiket supheli");
    if (k.kalanGun !== undefined) {
      durum.append(" ");
      ekle(durum, "span", k.kalanGun === 0 ? "Bugün" : `${k.kalanGun} gün kaldı`,
        k.kalanGun <= 7 ? "etiket acil" : "etiket");
    }
    if (k.neden) ekle(satir, "p", `Öncelik ${ONCELIKLER[k.sira]}. ${k.neden}`);
    if (k.belgeler.length) ekle(satir, "p", `Belgeler · ${k.belgeler.join(", ")}`);
    if (k.notlar) ekle(satir, "p", k.notlar);
    const islemler = ekle(satir, "div", "", "islemler");
    if (k.kaynak_url.startsWith("https://")) {
      const kaynak = ekle(islemler, "a", "Resmi kaynak");
      kaynak.href = k.kaynak_url;
      kaynak.target = "_blank";
      kaynak.rel = "noopener noreferrer";
    }
    const dugme = ekle(islemler, "button", "Takvimime ekle");
    dugme.type = "button";
    if (k.baslangic || k.bitis) {
      dugme.addEventListener("click", () => indir(k));
    } else {
      dugme.disabled = true;
      ekle(islemler, "span", "Tarih gerekli", "meta");
    }
  }

  function goster() {
    bul("elle-kopya").hidden = true;
    bul("kopya-durum").textContent = "";
    if (!veri) return;
    const bugun = istanbulBugun();
    eslesen = filtrele(veri.entries, { ogrenim: ogrenim.value, kategori: kategori.value, arama: arama.value });
    let gorunen = eslesen;
    if (secili === sekmeler[0]) gorunen = yaklasan(eslesen, bugun);
    if (secili === kontrol) {
      gorunen = ogrenim.value === "hepsi" ? [] : kontrolListesi(eslesen, bugun, {
        ogrenim: ogrenim.value, yurt: bul("yurt").value, burs: bul("burs").value,
        sinif: bul("sinif").valueAsNumber,
      });
    }
    liste.replaceChildren();
    bul("durum").textContent = secili === kontrol && ogrenim.value === "hepsi"
      ? "Kontrol listeni görmek için öğrenim düzeyini seç."
      : (gorunen.length ? `${gorunen.length} kayıt` : "Uygun kayıt bulunamadı.");
    gorunen.forEach(kart);
    sor.disabled = !eslesen.length;
  }

  function sekmeyeGit(dugme) {
    secili = dugme;
    for (const sekme of sekmeler) {
      sekme.setAttribute("aria-selected", String(sekme === secili));
      sekme.tabIndex = sekme === secili ? 0 : -1;
    }
    bul("panel").setAttribute("aria-labelledby", secili.id);
    bul("profil").hidden = secili !== kontrol;
    goster();
  }

  sekmeler.forEach((dugme, i) => {
    dugme.addEventListener("click", () => sekmeyeGit(dugme));
    dugme.addEventListener("keydown", olay => {
      const son = sekmeler.length - 1;
      const hedef = { ArrowLeft: i ? i - 1 : son, ArrowRight: i === son ? 0 : i + 1, Home: 0, End: son };
      if (!Object.hasOwn(hedef, olay.key)) return;
      olay.preventDefault();
      sekmeyeGit(sekmeler[hedef[olay.key]]);
      secili.focus();
    });
  });
  arama.addEventListener("input", goster);
  for (const id of ["burs", "yurt", "sinif"]) bul(id).addEventListener("input", goster);

  sor.addEventListener("click", async () => {
    const metin = claudePrompt(eslesen);
    // İki API çağrısını da tıklama sırasında başlat.
    let kopyalama;
    try {
      kopyalama = navigator.clipboard?.writeText(metin);
    } catch {
      // Bazı tarayıcılar panoya erişim hatasını eşzamanlı bildirebilir.
    }
    window.open("https://claude.ai/new", "_blank", "noopener,noreferrer");
    try {
      if (kopyalama) {
        await kopyalama;
        bul("elle-kopya").hidden = true;
        bul("kopya-durum").textContent = "Metin kopyalandı. Claude’a yapıştırabilirsin.";
        return;
      }
    } catch {
      // Panoya erişim reddedilirse metni seçilebilir olarak göster.
    }
    bul("kopya-durum").textContent = "Panoya otomatik kopyalanamadı.";
    bul("prompt").value = metin;
    bul("elle-kopya").hidden = false;
    bul("prompt").focus();
    bul("prompt").select();
  });

  fetch("./takvim.json")
    .then(yanit => {
      if (!yanit.ok) throw new Error("Takvim yüklenemedi");
      return yanit.json();
    })
    .then(sonuc => {
      veri = sonuc;
      goster();
    })
    .catch(() => {
      bul("durum").textContent = "Takvim yüklenemedi. Bağlantını kontrol edip sayfayı yenile.";
    });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Çevrimdışı erişim desteklenmese de takvim ağ üzerinden kullanılabilir.
    });
  }
}

if (typeof module !== "undefined") {
  module.exports = { normalize, filtrele, yaklasan, kontrolListesi, istanbulBugun, kayitIcs, claudePrompt };
}
if (typeof document !== "undefined") baslat();
