import { SINIR, TURLER, duyuruAyikla, duyuruIstemi, claudeYaniti, duyuruIcs, olayGecerli, olayKimligi, tarihGecerli } from "./lib/duyuru.js";
import { filtrele, yaklasan, kontrolListesi, istanbulBugun, kayitIcs, claudePrompt, ONCELIKLER } from "./lib/takvim.js";

function baslat() {
  const bul = id => document.getElementById(id);
  const ogrenim = bul("ogrenim");
  const kategori = bul("kategori");
  const arama = bul("arama");
  const kontrol = bul("kontrol");
  const sekmeler = [bul("yaklasan"), bul("tumu"), kontrol, bul("duyuru")];
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

  function indir(metin, dosya) {
    const url = URL.createObjectURL(new Blob([metin], { type: "text/calendar;charset=utf-8" }));
    const baglanti = document.createElement("a");
    baglanti.href = url;
    baglanti.download = dosya;
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
    if (k.kisisel) {
      durum.append(" ");
      ekle(durum, "span", "Benim eklediğim", "etiket onay");
    }
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
      dugme.addEventListener("click", () => {
        const ics = k.kisisel ? duyuruIcs([k]) : kayitIcs(k, veri.updated);
        indir(ics, `${k.id}.ics`);
      });
    } else {
      dugme.disabled = true;
      ekle(islemler, "span", "Tarih gerekli", "meta");
    }
    if (k.kisisel) {
      const sil = ekle(islemler, "button", "Sil");
      sil.type = "button";
      sil.setAttribute("aria-label", `${k.baslik} kaydını sil`);
      sil.addEventListener("click", () => {
        const kalan = new Map(kisisel);
        kalan.delete(k.id);
        if (depoYaz(kalan)) {
          kisisel = kalan;
          goster();
          bul("durum").textContent += " · Kişisel kayıt silindi.";
          bul("panel").focus();
        } else {
          bul("durum").textContent = "Kişisel kayıt silinemedi. Tarayıcı depolamasına erişilemiyor.";
        }
      });
    }
  }

  function goster() {
    bul("elle-kopya").hidden = true;
    bul("kopya-durum").textContent = "";
    if (secili.id === "duyuru") return;
    const bugun = istanbulBugun();
    eslesen = filtrele(veri?.entries ?? [], { ogrenim: ogrenim.value, kategori: kategori.value, arama: arama.value });
    let gorunen = eslesen;
    if (secili === sekmeler[0]) {
      const benim = [...kisisel].map(([id, olay]) => ({
        ...olay, id, kisisel: true, kurum: TURLER[olay.tur], dogrulandi: false,
        belgeler: [], ogrenim: ["hepsi"], kategori: "diger", kaynak_url: "", notlar: olay.not,
      }));
      gorunen = yaklasan([...eslesen, ...filtrele(benim, { arama: arama.value })], bugun);
    }
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
    if (!veri) {
      bul("durum").textContent += takvimHatasi ? " · Yayın takvimi yüklenemedi." : " · Yayın takvimi yükleniyor…";
    }
    sor.disabled = !eslesen.length;
  }

  function sekmeyeGit(dugme) {
    secili = dugme;
    for (const sekme of sekmeler) {
      sekme.setAttribute("aria-selected", String(sekme === secili));
      sekme.tabIndex = sekme === secili ? 0 : -1;
    }
    const duyuruAcik = secili.id === "duyuru";
    for (const id of ["panel", "takvim-filtreleri", "takvim-claude"]) bul(id).hidden = duyuruAcik;
    bul("duyuru-panel").hidden = !duyuruAcik;
    if (!duyuruAcik) bul("panel").setAttribute("aria-labelledby", secili.id);
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

  const { listeyiOku, depoYaz } = duyuruArayuzu(bul, ekle, indir, yeniListe => {
    kisisel = yeniListe;
    goster();
  }, () => kisisel);
  let kisisel = listeyiOku();
  let takvimHatasi = false;
  goster();

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
      takvimHatasi = true;
      goster();
    });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Çevrimdışı erişim desteklenmese de takvim ağ üzerinden kullanılabilir.
    });
  }
}

function duyuruArayuzu(bul, ekle, indir, listeyiGuncelle, listeyiGetir) {
  const anahtar = "burs-takvimi-kisisel";
  const metin = bul("duyuru-metin");
  const onay = bul("duyuru-onay");
  const durum = bul("duyuru-durum");
  const depoDurum = bul("duyuru-depo-durum");
  const islemDurum = bul("duyuru-islem-durum");
  const govde = bul("duyuru-olaylar");
  let satirlar = [];
  let istemSayaci = 0;

  function listeyiOku() {
    try {
      const kayitlar = JSON.parse(localStorage.getItem(anahtar));
      onay.checked = Array.isArray(kayitlar);
      return new Map((onay.checked ? kayitlar : [])
        .filter(olay => olayGecerli(olay) && typeof olay.alinti === "string" && typeof olay.not === "string")
        .map(olay => [olayKimligi(olay), olay]));
    } catch {
      return new Map();
    }
  }

  function depoYaz(liste) {
    if (!onay.checked) return true;
    try {
      localStorage.setItem(anahtar, JSON.stringify([...liste.values()]));
      return true;
    } catch {
      return false;
    }
  }

  function alan(ebeveyn, ad, tip, deger) {
    const etiket = ekle(ebeveyn, "label", ad);
    const girdi = ekle(etiket, "input", "");
    girdi.type = tip;
    girdi.value = deger ?? "";
    if (tip === "date") {
      girdi.min = "0001-01-01";
      girdi.max = "9999-12-31";
    }
    return girdi;
  }

  function satirEkle(olay) {
    const satir = ekle(govde, "tr", "");
    const duzenle = ekle(satir, "td", "");
    const kaynak = ekle(satir, "td", "");
    const secim = alan(duzenle, "Olayı seç", "checkbox", "");
    secim.parentElement.className = "onay-kutusu";
    secim.setAttribute("aria-label", `${olay.baslik} olayını seç`);
    secim.checked = true;
    const baslik = alan(duzenle, "Başlık", "text", olay.baslik);
    baslik.maxLength = 200;
    baslik.required = true;
    const baslangic = alan(duzenle, "Başlangıç", "date", olay.baslangic);
    baslangic.required = true;
    const bitis = alan(duzenle, "Bitiş (isteğe bağlı)", "date", olay.bitis);
    const saat = alan(duzenle, "Türkiye saati (isteğe bağlı)", "time", olay.saat);
    const tur = ekle(ekle(duzenle, "label", "Tür"), "select", "");
    for (const [deger, ad] of Object.entries(TURLER)) ekle(tur, "option", ad).value = deger;
    tur.value = olay.tur;
    ekle(kaynak, "span", "Doğrulanmadı", "etiket supheli");
    if (olay.claude) {
      kaynak.append(" ");
      ekle(kaynak, "span", "Claude", "etiket onay");
    }
    ekle(kaynak, "blockquote", olay.alinti);
    if (olay.not) ekle(kaynak, "p", olay.not, "meta");
    satirlar.push({ olay, secim, baslik, baslangic, bitis, saat, tur });
    bul("duyuru-onizleme").hidden = false;
  }

  function onizlemeyiSil() {
    govde.replaceChildren();
    satirlar = [];
    bul("duyuru-onizleme").hidden = true;
    bul("duyuru-listeler").replaceChildren();
    bul("duyuru-listeler").hidden = true;
    islemDurum.textContent = "";
  }

  function secilenler() {
    const olaylar = new Map();
    islemDurum.textContent = "";
    for (const satir of satirlar) {
      if (!satir.secim.checked) continue;
      const { olay, baslik, baslangic, bitis, saat, tur } = satir;
      if (![baslik, baslangic, bitis, saat].every(girdi => girdi.reportValidity())) {
        islemDurum.textContent = "Seçili olayın alanlarını kontrol et.";
        return [];
      }
      const kayit = {
        ...olay, baslik: baslik.value.trim(), baslangic: baslangic.value,
        bitis: bitis.value || null, saat: saat.value || null, tur: tur.value,
      };
      if (!olayGecerli(kayit)) {
        islemDurum.textContent = "Seçili olay için başlık ve geçerli bir tarih aralığı gir.";
        (kayit.baslik ? bitis : baslik).focus();
        return [];
      }
      olaylar.set(olayKimligi(kayit), kayit);
    }
    if (!olaylar.size) islemDurum.textContent = "En az bir olay seç.";
    return [...olaylar.values()];
  }

  function duyuruHazir() {
    const tarih = bul("duyuru-tarih").value;
    if (!metin.value.trim() || metin.value.length > SINIR) {
      durum.textContent = "En fazla 100.000 karakterlik bir duyuru metni gir.";
      metin.focus();
      return false;
    }
    if (tarih && !tarihGecerli(tarih)) {
      durum.textContent = "Geçerli bir duyuru tarihi gir.";
      bul("duyuru-tarih").focus();
      return false;
    }
    return true;
  }

  metin.addEventListener("input", () => {
    istemSayaci++;
    bul("duyuru-istem").value = "";
    bul("duyuru-elle-kopya").hidden = true;
    durum.textContent = "";
    onizlemeyiSil();
  });
  bul("duyuru-ayikla").addEventListener("click", () => {
    if (!duyuruHazir()) return;
    const bugun = istanbulBugun();
    const { olaylar, atilan } = duyuruAyikla(metin.value, bul("duyuru-tarih").value || bugun, bugun);
    // Önceden içe aktarılan Claude satırlarını ve düzenlemelerini koru.
    for (const satir of satirlar.filter(satir => !satir.olay.claude)) satir.secim.closest("tr").remove();
    satirlar = satirlar.filter(satir => satir.olay.claude);
    olaylar.forEach(satirEkle);
    bul("duyuru-onizleme").hidden = !satirlar.length;
    islemDurum.textContent = "";
    durum.textContent = `${olaylar.length} olay bulundu. ${atilan} geçersiz tarih atlandı.`;
  });

  bul("duyuru-claude").addEventListener("click", async () => {
    if (!duyuruHazir()) return;
    const sira = ++istemSayaci;
    const istem = duyuruIstemi(metin.value, bul("duyuru-tarih").value || undefined);
    bul("duyuru-elle-kopya").hidden = true;
    let kopyalama;
    try {
      kopyalama = navigator.clipboard?.writeText(istem);
    } catch {
      // Eşzamanlı pano hatasında da elle kopyalama seçeneğini göster.
    }
    window.open("https://claude.ai/new", "_blank", "noopener");
    try {
      if (kopyalama) {
        await kopyalama;
        if (sira === istemSayaci) durum.textContent = "İstem panoya kopyalandı. Claude’a yapıştırabilirsin.";
        return;
      }
    } catch {
      // Pano erişimi reddedildiğinde aşağıdaki alanı göster.
    }
    if (sira !== istemSayaci) return;
    durum.textContent = "Panoya otomatik kopyalanamadı.";
    const alan = bul("duyuru-istem");
    alan.value = istem;
    bul("duyuru-elle-kopya").hidden = false;
    alan.focus();
    alan.select();
  });

  bul("duyuru-aktar").addEventListener("click", () => {
    if (!duyuruHazir()) return;
    const sonuc = claudeYaniti(bul("duyuru-yanit").value, metin.value);
    if (!sonuc) {
      durum.textContent = "Geçerli bir Claude JSON yanıtı bulunamadı. Sınır 100.000 karakter.";
      return;
    }
    const aktarilan = new Set(satirlar.filter(satir => satir.olay.claude).map(satir => olayKimligi(satir.olay)));
    let eklenen = 0;
    for (const olay of sonuc.olaylar) {
      const id = olayKimligi(olay);
      if (aktarilan.has(id)) continue;
      aktarilan.add(id);
      satirEkle(olay);
      eklenen++;
    }
    const listeler = bul("duyuru-listeler");
    listeler.replaceChildren();
    for (const [ad, maddeler] of [["Claude’un yapılacaklar listesi", sonuc.yapilacaklar],
      ["Resmi kaynaktan doğrulanacaklar", sonuc.dogrulanacaklar]]) {
      if (!maddeler.length) continue;
      ekle(listeler, "h2", ad);
      const liste = ekle(listeler, "ul", "");
      maddeler.forEach(madde => ekle(liste, "li", madde));
    }
    listeler.hidden = !listeler.childElementCount;
    durum.textContent = `${eklenen} Claude olayı eklendi. ${sonuc.atilan} geçersiz öğe atlandı.`;
  });

  bul("duyuru-indir").addEventListener("click", () => {
    const olaylar = secilenler();
    if (!olaylar.length) return;
    indir(duyuruIcs(olaylar), "duyuru-takvimi.ics");
    islemDurum.textContent = `${olaylar.length} olay için takvim dosyası hazırlandı.`;
  });

  bul("duyuru-kaydet").addEventListener("click", () => {
    const olaylar = secilenler();
    if (!olaylar.length) return;
    const mevcut = listeyiGetir();
    const liste = new Map(mevcut);
    for (const olay of olaylar) liste.set(olayKimligi(olay), olay);
    if (!depoYaz(liste)) {
      islemDurum.textContent = "Tarayıcı depolamasına kaydedilemedi. Saklama onayını kaldırıp bu oturumda ekleyebilirsin.";
      return;
    }
    listeyiGuncelle(liste);
    const eklenen = liste.size - mevcut.size;
    islemDurum.textContent = `${eklenen} yeni olay eklendi. Güncel olayları Yaklaşan sekmesinde görebilirsin.`;
  });

  function depoyuSil() {
    try {
      localStorage.removeItem(anahtar);
      onay.checked = false;
      return true;
    } catch {
      depoDurum.textContent = "Tarayıcı depolamasındaki veriler silinemedi.";
      return false;
    }
  }

  onay.addEventListener("change", () => {
    if (onay.checked) {
      if (depoYaz(listeyiGetir())) depoDurum.textContent = "Kişisel liste bu tarayıcıda saklanıyor.";
      else {
        onay.checked = false;
        depoDurum.textContent = "Tarayıcı depolamasına kaydedilemedi.";
      }
    } else if (depoyuSil()) {
      depoDurum.textContent = "Saklanan liste silindi. Bu oturumdaki kayıtları kullanabilirsin.";
    } else {
      onay.checked = true;
    }
  });

  bul("duyuru-sil").addEventListener("click", () => {
    const silindi = depoyuSil();
    listeyiGuncelle(new Map());
    metin.value = "";
    bul("duyuru-tarih").value = "";
    bul("duyuru-yanit").value = "";
    metin.dispatchEvent(new Event("input"));
    if (silindi) depoDurum.textContent = "Duyuru verileri silindi.";
  });

  return { listeyiOku, depoYaz };
}

baslat();
