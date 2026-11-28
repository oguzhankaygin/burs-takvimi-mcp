# Burs ve Yurt Takvimi

Türk üniversite öğrencileri için yerel bir MCP sunucusu. Claude, KYK burs ve kredi başvuruları, yurt, VGM, ÖSYM, AÖF, Erasmus+, geçiş, Ulusal Staj Programı ve TÜBİTAK 2209-A duyurularını aynı takvimden sorgulayabilir. Kayıtlar kaynak adresini, kontrol tarihini ve doğrulama durumunu taşır.

## Tarayıcıda kullan

[Burs ve Yurt Takvimi’ni aç](https://oguzhankaygin.github.io/burs-takvimi-mcp/).

Telefonda tarayıcı menüsündeki **Ana ekrana ekle** (iPhone’da Paylaş → Ana Ekrana Ekle) seçeneğiyle uygulama gibi açabilirsiniz; bir kez açıldıktan sonra internetsiz de çalışır.

Takvimi kurulum ve hesap gerekmeksizin inceleyebilir, başvuruları filtreleyebilir ve
kişisel kontrol listeni oluşturabilirsin. Tek bir kaydı indirebilir veya tüm takvime
abone olabilirsin. İlk çevrimiçi yüklemeden sonra takvim çevrimdışı açılabilir.
Claude’a sor özelliği, filtrelenen kayıtları kopyalayıp kendi Claude hesabında kullanman için
Claude’u ayrı sekmede açar.

Kaynak veri değiştiğinde GitHub Pages için dosyaları proje dizininde yeniden üret:

```sh
python3 -m burs_takvimi build-site
```

GitHub Pages yayın kaynağı olarak deponun yayın dalındaki `/docs` klasörünü kullanır.

## Duyurudan ekle

1. **Duyurudan ekle** sekmesine duyuru metnini yapıştır ve **Tarihleri ayıkla** düğmesine bas. Bu işlem çevrimdışı çalışır. Yılı belirtilmeyen tarih için duyuru tarihinden (boşsa Türkiye saatine göre bugünden) itibaren ilk uygun yılı önerir.
2. Önizlemede kaynak cümleleri ve uyarıları incele. Başlığı, tarihi, saati ve türü düzenleyip eklemek istediğin olayları seç. **Seçilenleri .ics olarak indir** düğmesi bir ve yedi gün öncesine hatırlatıcı ekler.
3. **Kişisel listeme ekle** düğmesiyle güncel olayları **Yaklaşan** sekmesinde **Benim eklediğim** rozetiyle gör. **Kişisel listemi bu tarayıcıda sakla** kutusunu işaretlersen liste sonraki ziyaretlere kalır. Saklama onayı olmadan liste oturumluk çalışır. Her kaydı ayrı ayrı silebilir veya **Verilerimi sil** ile duyuru alanlarını ve kişisel listeyi temizleyebilirsin.

İstersen **Claude’da aç** ile hazırlanan istemi panoya kopyalayıp kendi Claude hesabına yapıştır. Tarayıcı panoya yazamazsa istemi elle kopyalayabilirsin. Claude’un JSON yanıtını **Claude’un yanıtını yapıştır** alanından içe aktar. Geçerli tarih ve duyurudan birebir alıntı içeren olaylar **Claude** rozetiyle önizlemeye eklenir. Duyuru ayıklaması için API anahtarı gerekmez. Metni Claude’a yapıştırırsan Claude ile paylaşmış olursun. Takvime eklemeden önce tarihleri resmi duyurudan kontrol et.

Tarayıcı mantığının testlerini Node.js 22 ile `npm test` komutundan çalıştırabilirsin.

## Kurulum

Python 3.10 veya üzeri yeterli. Proje dizininde aşağıdaki komutlarla çalıştırabilirsin.

```sh
python3 -m burs_takvimi
python3 -m burs_takvimi cli yaklasan --gun 60
python3 -m burs_takvimi cli ara "yatay gecis"
python3 -m burs_takvimi cli kontrol-listesi --ogrenim lisans --sinif 1 --no-kyk-yurdunda-mi
python3 -m burs_takvimi cli kaynaklar
```

İlk komut MCP istemcisinden satır başına bir UTF-8 JSON-RPC mesajı bekler. Günlükler ve veri uyarıları stderr'e gider.

### Claude Code

Proje dizininde sunucuyu ekle ve Claude Code'u aynı dizinden aç.

```sh
claude mcp add burs-takvimi -- python3 -m burs_takvimi
claude mcp list
```

Claude Code'u başka bir çalışma dizininden açıyorsan ve yapılandırma o oturumda erişilebilirse, kayıt komutunda `--env PYTHONPATH=/mutlak/yol/proje` seçeneğini `--` ayırıcısından önce ekle. Yol, `burs_takvimi/` paketini içeren dizine işaret etmeli. [Claude Code MCP belgeleri](https://code.claude.com/docs/en/mcp)

### Claude Desktop

Claude Desktop ayarlarında **Developer → Edit Config** üzerinden `claude_desktop_config.json` dosyasını aç. Aşağıdaki sunucuyu mevcut `mcpServers` nesnesine ekle ve uygulamayı yeniden başlat.

```json
{
  "mcpServers": {
    "burs-takvimi": {
      "command": "/mutlak/yol/python3",
      "args": ["-m", "burs_takvimi"],
      "env": {
        "PYTHONPATH": "/mutlak/yol/proje"
      }
    }
  }
}
```

`command` alanına Python çalıştırılabilir dosyasının yolunu, `PYTHONPATH` alanına proje kökünü yaz. Bu ayar, Desktop farklı bir çalışma dizininden başlasa da paketi bulmasını sağlar. [Yerel MCP sunucusu yapılandırması](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

## Claude'a şunu sor

| Araç | Örnek soru |
| --- | --- |
| `yaklasan_tarihler` | “Önümüzdeki 60 gün içinde başlayacak veya bitecek KYK yurt başvuruları var mı? Kaynağı ve kontrol tarihini ekle.” |
| `ara` | “Takvimde yatay gecis ara.” |
| `donem_kontrol_listesi` | “Birinci sınıf lisans öğrencisiyim, KYK yurdunda kalmıyorum ve burs almıyorum. Bu dönem hangi başvuruları, ne zamana kadar ve hangi belgelerle takip etmeliyim?” |
| `kaynaklar` | “Burs ve sınav tarihlerini hangi resmi sitelerden kontrol edebilirim?” |

MCP istemcisi `takvim://tum` kaynağından doğrulamadan geçen tüm kayıtları JSON olarak okuyabilir. Araçlar Türkçe metin ile yapılandırılmış veriyi birlikte döndürür.

## Veri katkısı

`burs_takvimi/data/takvim.json` dosyasının üst düzeyinde `version: 1`, `updated` ve `entries` bulunur. Başka bir dosyayı kullanmak için sunucunun ortamında `BURS_TAKVIMI_DATA` değişkenine dosyanın mutlak yolunu ver.

1. `entries` listesine benzersiz ve kalıcı bir `id` ile kayıt ekle. `baslik` ve `kurum` alanlarını doldur.
2. `kategori` için `kyk-burs`, `kyk-yurt`, `vgm`, `osym`, `aof`, `erasmus`, `gecis`, `staj` veya `diger` kullan. `ogrenim` listesine uygun düzeyleri ekle. Geçerli değerler `onlisans`, `lisans`, `yuksek-lisans`, `doktora` ve `hepsi`.
3. `kaynak_url` alanına resmi duyurunun HTTPS bağlantısını, `kontrol_tarihi` alanına duyuruyu incelediğin tarihi yaz. Tarih biçimi `YYYY-MM-DD`. Örnek kayıtlardaki kontrol tarihi, örnek verinin hazırlandığı gündür.
4. Resmi duyurudan kesinleşen `baslangic` ve `bitis` tarihlerini gir. Bilinmeyen tarihler için `null` kullan. `dogrulandi` alanını yalnızca tarihleri ve kayıt ayrıntılarını resmi duyuruyla karşılaştırdığında `true` yap.
5. `tekrar` alanı için `yillik` veya `null` kullan. `notlar` alanına başvuru koşullarını ya da duyuruya ilişkin ayrıntıları ekle. `belgeler` alanına duyuruda istenen belgeleri metin listesi olarak yaz. Bilgi yoksa boş liste kullan.
6. Veri dosyasının `updated` tarihini güncelle ve testleri çalıştır. Yükleyici şemaya uymayan kayıtları uyarıyla atlar.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
BURS_TAKVIMI_TODAY=2026-11-24 python3 -m burs_takvimi cli yaklasan --gun 60
```

## Sınırlamalar

- Veri dosyası 22 kayıt içerir; 18’i resmi duyurularla karşılaştırılıp `dogrulandi: true` yapıldı (ÖSYM, AÖF, VGM, Ulusal Staj Programı, TÜBİTAK 2209-A). KYK burs/kredi ve yurt, Erasmus+ ve yatay geçiş kayıtları henüz doğrulanmadı; araç bu kayıtlarda "⚠ doğrulanmamış" uyarısı gösterir.
- Sunucu yerel dosyayı başlangıçta yükler. Veri değiştiğinde yeniden başlat. Resmi duyuruları otomatik çekme ve yıllık olaylara tarih atama bu sürümün kapsamı dışındadır.
- Yaklaşan tarihler sorgusu bugünü ve pencerenin son gününü kapsar. Varsayılan gün hesabı Türkiye saatine (UTC+3) göre yapılır.
- Kontrol listesi öğrenim düzeyine göre filtreler, geçmiş tarihli kayıtları eler ve öğrenci profilinden öncelik belirler. Erasmus+ ve geçiş tarihleri kurum ve programa göre değişebilir. Başvuru koşullarını ve son tarihleri resmi duyurudan kontrol et.

## Gerekli bilgiler

Projeyi yayına almadan önce şunlar gerekiyor:

- **Tarih doğrulaması:** `burs_takvimi/data/takvim.json` içindeki tarihler resmi duyurularla karşılaştırılmalı. Doğrulanan kayıtlarda `dogrulandi: true` yapılmalı, `kaynak_url` alanına da ana sayfa yerine duyurunun kendi bağlantısı yazılmalı.
- **Yayın kararı:** GitHub deposu şimdilik gizli. Herkese açık yapılıp yapılmayacağına karar verilmeli.
- **Üniversiteye özel veri (isteğe bağlı):** Belirli bir üniversitenin akademik takvimi (kayıt yenileme, ders ekle-bırak, bütünleme) eklenecekse hangi üniversite olduğu belirtilmeli.
