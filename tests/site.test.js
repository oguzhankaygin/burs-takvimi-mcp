"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { normalize, filtrele, yaklasan, kontrolListesi, istanbulBugun, kayitIcs, claudePrompt } = require("../docs/app");
const veri = require("../docs/takvim.json");

function kayit(id, alanlar = {}) {
  return {
    id, baslik: "ÖĞRENİM bursu", kurum: "ÖSYM", kategori: "diger", notlar: "İlk sınıf",
    belgeler: ["Öğrenci belgesi"], ogrenim: ["hepsi"], baslangic: null, bitis: null,
    kaynak_url: "https://example.com/", dogrulandi: false, ...alanlar,
  };
}

test("Türkçe noktalı ve noktasız I, birleşik aksanlar ve birden çok sözcük", () => {
  assert.equal(normalize("I İ ı i Ş Â"), "i i i i s a");
  const liste = [kayit("a"), kayit("b", { ogrenim: ["onlisans"] }), kayit("c", { kategori: "gecis" })];
  assert.deepEqual(filtrele(liste, { ogrenim: "lisans", kategori: "diger", arama: "OĞRENIM SINIF belge" })
    .map(k => k.id), ["a"]);
  assert.equal(filtrele(liste, { arama: "olmayan" }).length, 0);
});

test("yaklaşan tarihler İstanbul takvim gününe göre sıralanır", () => {
  assert.equal(istanbulBugun(new Date("2027-01-01T21:00:00Z")), "2027-01-02");
  const liste = [kayit("sonra", { baslangic: "2027-01-09" }), kayit("belirsiz"),
    kayit("bugun", { baslangic: "2026-12-30", bitis: "2027-01-02" }),
    kayit("gecmis", { bitis: "2027-01-01" })];
  assert.deepEqual(yaklasan(liste, "2027-01-02").map(k => [k.id, k.kalanGun]), [["bugun", 0], ["sonra", 7]]);
});

test("kontrol listesi MCP profil kurallarını ve son tarih sırasını uygular", () => {
  const liste = [
    kayit("yurt", { kategori: "kyk-yurt" }),
    kayit("burs", { kategori: "kyk-burs", bitis: "2027-02-01" }),
    kayit("vgm", { kategori: "vgm", bitis: "2027-01-01" }),
    kayit("gecis", { kategori: "gecis" }),
    kayit("normal"), kayit("gelecek", { baslangic: "2027-01-02" }),
    kayit("gecmis", { baslangic: "2026-12-31" }),
    kayit("uyumsuz", { ogrenim: ["onlisans"] }),
  ];
  const tarih = "2027-01-01";
  const sirala = profil => kontrolListesi(liste, tarih, { ogrenim: "lisans", ...profil }).map(k => [k.id, k.sira]);
  assert.deepEqual(sirala({ yurt: "evet", burs: "hayir", sinif: 1 }),
    [["vgm", 0], ["burs", 0], ["gecis", 0], ["normal", 1], ["gelecek", 1], ["yurt", 2]]);
  assert.deepEqual(sirala({ yurt: "hayir", burs: "evet" }),
    [["yurt", 0], ["gecis", 1], ["normal", 1], ["gelecek", 1], ["vgm", 2], ["burs", 2]]);
});

test("tek kayıt ICS etkinlikleri yayın akışıyla bayt düzeyinde eşleşir", () => {
  const akis = readFileSync(path.join(__dirname, "../docs/takvim.ics"), "utf8");
  for (const k of veri.entries) {
    const cikti = kayitIcs(k, veri.updated);
    if (!k.baslangic && !k.bitis) {
      assert.equal(cikti, "");
      continue;
    }
    const etkinlik = cikti.match(/BEGIN:VEVENT\r\n[\s\S]+?END:VEVENT\r\n/)[0];
    assert.ok(akis.includes(etkinlik), k.id);
    assert.ok(cikti.split("\r\n").every(satir => Buffer.byteLength(satir) <= 75));
  }
  const tekGun = kayit("tek", { bitis: "2028-02-29", baslik: "A, B; C\\D\r\nE" });
  const cikti = kayitIcs(tekGun, veri.updated);
  assert.ok(cikti.includes("DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301\r\n"));
  assert.ok(cikti.includes("SUMMARY:⚠ A\\, B\\; C\\\\D\\nE\r\n"));
});

test("Claude metni filtreye uyan kayıtları ve doğrulama durumunu içerir", () => {
  const liste = [kayit("a", { baslik: "KYK yurdu", kategori: "kyk-yurt" }), kayit("b")];
  const prompt = claudePrompt(filtrele(liste, { kategori: "kyk-yurt" }));
  assert.match(prompt, /Türkçe/);
  assert.match(prompt, /KYK yurdu.*Doğrulanmadı.*https:\/\/example.com/);
  assert.doesNotMatch(prompt, /ÖĞRENİM bursu/);
});
