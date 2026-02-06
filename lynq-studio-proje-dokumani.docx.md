  
**LYNQ STUDIO**

*lynq.studio*

**First-Party Web Analytics Proje Dokümanı**

Snowplow, Plausible, Umami ve ClickHouseAraştırmalarından Süzülmüş Kapsamlı Teknik Rehber

Versiyon 1.0 — Şubat 2026

Tek Kişilik Geliştirme için Tasarlanmıştır

# **İÇİNDEKİLER**

# **1\. NEDEN FIRST-PARTY ANALYTICS?**

## **1.1 3rd Party Tool’ların Gerçek Sorunları**

Google Analytics 4 başta olmak üzere üçüncü parti analitik araçları, birden fazla yapısal sorun nedeniyle güvenilir veri sunmakta zorlanıyor. Bu sorunları anlamak, neden kendi çözümünü yapmak istediğini net bir şekilde ortaya koyar.

**Sampling ve Thresholding:** GA4, belirli bir veri hacmini aştığında (genellikle 500K event/gün üzeri) otomatik olarak sampling yapar. Yani raporladığı sayılar gerçek sayılar değil, tahminlerdir. Thresholding ise Google Signals açıkken küçük kullanıcı gruplarının verilerini tamamen gizler. Raporlarında '(other)' satırı görüyorsan bu thresholding etkisidir.

**Cookie Kısıtlamaları:** Safari ITP, 3rd party cookie’leri tamamen engeller ve 1st party cookie’leri bile 7 güne (bazı durumlarda 24 saate) kısıtlar. Firefox ETP benzer şekilde davranır. Chrome’un Privacy Sandbox gelişmeleri de üçüncü parti izlemeyi günden güne zorlaştırıyor. Sonuç: returning visitor sayıların güvenilmez hale gelir.

**Consent Duvarı:** GDPR ve KVKK uyumu için gösterilen cookie banner’larında kullanıcıların ortalama %30-50’si consent vermeden ayrılır. Bu da GA4’ün gördüğü trafiğin gerçeğin yarısı kadar olabileceği anlamına gelir.

**Adblocker Etkisi:** Desktop kullanıcıların yaklaşık %25-40’ı adblocker kullanır. GA4’ün gtag.js ve google-analytics.com alanı neredeyse tüm adblocker listelerinde bulunur. First-party bir çözüm kendi alanından servis edildiği için bu sorunu büyük ölçüde ortadan kaldırır.

## **1.2 First-Party Yaklaşımın Avantajları**

* **Tam veri sahipliği:** Verin hiçbir üçüncü tarafa gitmez, kendi sunucunda kalır

* **Sampling yok:** Her bir event birebir kaydedilir, tahmin değil gerçek sayılar görürsün

* **Adblocker dayanıklılığı:** Kendi domain’inden serve edilen bir script adblocker’lara takılmaz

* **GDPR/KVKK uyumu:** Kişisel veri toplamadan analytics yapabilirsin (Plausible modeli)

* **Sonsuz retention:** GA4’ün 14 ay sınırı yok, istediğin kadar geçmiş veriyi tutarsın

* **Raw data erişimi:** SQL ile istediğin soruyu sorabilirsin, önceden tanımlı raporlarla sınırlı değilsin

# **2\. KAYNAKLARDAN ÖğRENİLENLER**

## **2.1 Snowplow Analytics — Referans Mimari**

Snowplow, first-party data pipeline’ının “altın standardı” sayılır. 12 yılı aşkın production deneyimiyle, aylık 1 trilyon event işleyen bir platform. Mimarisini anlamak, Lynq Studio'yu doğru temeller üzerine inşa etmeni sağlar.

**Pipeline Felsefesi:** Snowplow’un temel ilkesi “separation of concerns” — yani veri toplama ile veri analizi birbirinden ayrı ve gevşek bağlı (loosely-coupled) sistemler olmalıdır. Bu sayede toplama katmanını değiştirdiğinde analiz katmanı etkilenmez ve tam tersi. Bu ilke Lynq Studio için de geçerli olmalı.

**4 Katmanlı Mimari:** Snowplow’un pipeline’ı şu sırayla çalışır:

* **Trackers:** 35+ farklı tracker (web, mobil, server-side) event’leri toplar ve collector’a gönderir. JS tracker first-party cookie ile domain\_userid üretir (2 yıla kadar persist eder). Her event’e "self-describing JSON" schema’sı eklenir — bu schema validation’ın temelidir.

* **Collector:** Stateless HTTP endpoint’leridir. Gelen event’leri ham haliyle bir stream’e (Kinesis/PubSub/Kafka) ve aynı zamanda raw storage’a (S3) yazar. Böylece hiçbir veri kaybolmaz — buna “non-lossy pipeline” denir.

* **Enrichment:** Ham event’leri alır, schema’ya göre validate eder, ardından zenginleştirir. IP’den coğrafi konum, User-Agent’tan cihaz/tarayıcı bilgisi, campaign attribution (UTM parametreleri), PII pseudonymization gibi 15+ enrichment uygulanır. Validation’ı geçemeyen event’ler “bad data stream”’e yönlendirilir ve sonra yeniden işlenebilir.

* **Loader:** Zenginleştirilmiş event’leri hedef warehouse’a (Redshift, BigQuery, Snowflake, ClickHouse) yükler.

**Lynq Studio İçin Çıkarım:** Snowplow’un tam mimarisini kurmana gerek yok — bu enterprise seviye. Ama şu ilkeleri mutlaka uygula: (1) schema validation — gelen event’lerin formatını kontrol et, (2) non-lossy pipeline — ham veriyi her zaman sakla, (3) enrichment katmanı — geo, device parsing gibi zenginleştirmeleri event kaydedilmeden önce yap, (4) bad event stream — hatalı event’leri silme, ayrı bir yerde tut.

## **2.2 Plausible Analytics — Mimari Zarafet**

Plausible, tam tersi bir felsefe ile yola çıkmış: mümkün olan en basit, en hafif, privacy-first analytics. 28.000+ web sitesini izler ve aylık 1 milyar+ page view işler. Başlangıçta PostgreSQL kullanan Plausible, ölçek büyüdüğünde ClickHouse’a geçmiştir — bunu kendi kurucuları “aldığımız en iyi teknik karar” olarak nitelendiriyor.

**Dual Database Mimarisi:** Plausible, iki ayrı veritabanı kullanır: PostgreSQL uygulama verileri için (kullanıcı hesapları, web sitesi ayarları, team bilgileri), ClickHouse ise tamamen analytics verileri için (event’ler, session’lar, metrikler). Bu ayrım çok önemli çünkü OLTP (işlemsel) ve OLAP (analitik) workload’ları farklı optimizasyon gerektirir.

**Tracker Yaklaşımı:** Plausible’ın JavaScript tracker’ı 2KB’ın altında. Cookie kullanmaz, fingerprinting yapmaz, kişisel veri toplamaz. Session tanımlama yerine her page view’ü bağımsız bir event olarak kaydeder. Bu yaklaşım GDPR uyumunu otomatik olarak sağlar çünkü cookie banner’a ihtiyaç duymaz.

**Tech Stack:** Elixir/Phoenix (backend), React \+ TailwindCSS (frontend), PostgreSQL (app DB), ClickHouse (analytics DB). Elixir’in concurrency modeli (Erlang VM) yüksek trafiği düşük kaynakla karşılayabilir. Ancak tek kişilik proje için Elixir öğrenme eğrisi yüksek olabilir.

**Lynq Studio İçin Çıkarım:** Plausible’ın dual-database yaklaşımı (PG \+ ClickHouse) Lynq Studio'da de kullanılmalı. Ayrıca tracker’ın küçük olması kritik — sayfa performansını etkilememeli. Plausible’ın cookie kullanmama kararı privacy için iyi ama session analizi için kısıtlayıcı; Lynq Studio'da first-party cookie ile daha zengin session verisi toplayabilirsin.

## **2.3 Umami — Tek Kişi Projesi Referansı**

Umami, senin yapmak istediğin şeyin en yakın çalışan örneğidir. Next.js \+ PostgreSQL ile yazılmış, Docker ile dakikalar içinde deploy edilebilir, modern ve anlaşılır bir code base’e sahip.

**Veritabanı Şeması (Kritik Detay):** Umami’nin çekirdek şeması iki ana tablodan oluşur:

* **session tablosu:** session\_id (UUID), website\_id, hostname, browser, os, device, screen, language, country, subdivision1, subdivision2, city, created\_at. Session ID bir hash olarak üretilir: website \+ hostname \+ IP \+ User-Agent \+ ayın başlangıcının birleşiminden. Bu da aynı kullanıcının aynı ay içinde tek session olarak sayılmasını sağlar.

* **website\_event tablosu:** event\_id, website\_id, session\_id, created\_at, url\_path, url\_query, referrer\_path, referrer\_query, referrer\_domain, page\_title, event\_type (1=pageview, 2=custom event), event\_name. Ek olarak event\_data tablosu, custom event’lere JSON key-value çiftleri ekler.

**Tracker Mekanizması:** Umami’nin JS tracker’ı 2KB altında, script tagı olarak eklenir. Otomatik olarak page view’ları izler, ayrıca umami.track() fonksiyonu ile custom event’ler gönderilebilir. Collect endpoint’i /api/send yolundadır. Tracker, data-before-send callback’i ile gönderilmeden önce veriyi modifiye etme imkanı sunar.

**Kimlik Belirleme (Session Stitching):** Umami cookie kullanmaz. Bunun yerine server tarafında IP \+ User-Agent \+ website ID \+ ay başlangıcı bilgilerini hashleyerek session\_id üretir. Bu privacy-friendly bir yaklaşım ama eksik tarafı şu: aynı cihaz ve tarayıcıdan gelen farklı kullanıcıları ayırt edemez ve VPN kullanan kullanıcılar için yanlış sonuçlar üretebilir.

**Lynq Studio İçin Çıkarım:** Umami’nin şeması iyi bir başlangıç noktası ama session identification’ı geliştirilmeli. Senin projende first-party cookie ile client\_id ataman ve bunu session\_id’den ayrı tutman (Snowplow’un yaptığı gibi) çok daha zengin analiz imkanı sunar. Umami’nin Next.js \+ PG stack’i tek kişilik proje için ideal, ancak veri hacmi arttıkça ClickHouse’a geçiş planlanmalı.

## **2.4 ClickHouse — Analitik Motorun Kalbi**

ClickHouse’un adı “Clickstream Data Warehouse”ın kısaltmasıdır — tam olarak senin kullanım alanin için tasarlanmış. Yandex.Metrica (Google Analytics’in Rusya versiyonu) için geliştirilmiş ve hala dünyanın en büyük web analytics sistemlerinden birini besliyor.

**Neden ClickHouse:** Columnar (sütun bazlı) depolama sayesinde analitik sorgular için inanılmaz hızlıdır. Bir web analytics sorgusu genellikle milyarlarca satırdan sadece 3-5 sütunu okur (timestamp, url, referrer gibi). ClickHouse sadece o sütunları diskten okur, gerisi yerinde kalır. Bu da 10-100x hız farkı demek. ClickHouse Cloud’un ücretsiz tier’ı küçük-orta ölçek projeler için yeterlidir.

**ClickHouse’un Kendi Product Analytics Deneyimi (Galaxy):** ClickHouse ekibi, kendi ürün analitiğini ClickHouse üzerinde inşa etmiş. 20 milyar+ event ve 14 TB veri ile çalışıyor. Yaklaşımlarının özü: tüm event’leri tek, denormalize bir tabloda tutmak. Farklı event tipleri aynı tabloda, boş sütunlar çok iyi sıkıştırılır (sparse serialization). Bu yaklaşım JOIN ihtiyacını ortadan kaldırır ve TB ölçeğinde bile sub-second sorgu performansı sağlar.

**Materialized View Stratejisi:** ClickHouse’un incremental materialized view’ları kritik bir performans aracıdır. Ana tabloya insert edilen her event, önceden tanımlı kurallarla otomatik olarak özet tablolara da yazılır. Örneğin, sadece page\_view event’lerini filtreleyen bir materialized view, dashboard sorgularını 10-50x hızlandırabilir. Galaxy’de sorguların %90’ının birkaç düzine tipik erişim pattern’ından oluştuğu belirlendi — bu pattern’lara özel materialized view’lar çok etkili.

**Schema Tasarımı (Galaxy Örneği):** created\_at (DateTime, primary key — çoğu sorgu zamana göre filtrelenir), session\_id, user\_id, namespace (hangi sayfa/view), component (hangi UI bileşeni), event (click, pageLoad, serviceSelection gibi), interaction (click veya triggered), payload (JSON string, ek veriler için). Önemli kural: sık sorgulanan alanları (cohort oluşturanlar) mutlaka ayrı sütun yap, payload JSON’ına gömme.

**Veri Koruma (Data Security):** Web analytics için proxy katmanı şart. ClickHouse’un kendi deneyiminde her insert, rate limit uygulayan, schema’ya uyumu kontrol eden ve batch’leyen bir proxy üzerinden geçer. Doğrudan ClickHouse’a yazdırmaman lazım — hem güvenlik hem performans için.

## **2.5 Dieter Plaetinck / Grafana Ekosistemi**

Dieter Plaetinck, Grafana Labs’ın kurucu mühendislerinden biridir. Analytics ve monitoring sistemleri konusundaki deneyimi, özellikle visualization ve alerting katmanları için değerli içgörüler sunar.

**Önemli İlkeler:** Dieter’in yazılarından çıkan en önemli mesaj: anomaly detection için karmaşık makine öğrenimi algoritmalarına koşma. Basit z-score ve yüzde değişimi hesaplamaları gerçek dünya sorunlarının büyük çoğunluğunu çözer. Grafana’nın açık kaynak dashboard altyapısı, ClickHouse ile native entegrasyona sahip ve Lynq Studio için ideal bir visualization katmanıdır.

# **3\. MİMARİ TASARIM**

## **3.1 Genel Mimari**

Aşağıdaki mimari, Lynq Studio için Snowplow’un ilkelerini, Plausible’ın dual-DB yaklaşımını, Umami’nin basitliğini ve ClickHouse’un performansını tek bir çatıda birleştirir.

**Veri Akışı:**

Website → JS Tracker (2KB) → POST /collect → Ingestion Layer (validate \+ enrich \+ buffer) → ClickHouse (analytics storage) \+ PostgreSQL (app config) → Dashboard (Grafana/Metabase veya Custom)

## **3.2 Katman 1: JavaScript Tracker**

**Amaç:** Web sitesindeki kullanıcı etkileşimlerini yakalayıp JSON event’ler olarak kendi sunucuna göndermek.

**Temel Gereksinimler:**

* **Boyut:** 2KB altında olmalı (Umami ve Plausible referans). Gzip ile servis edildiğinde \~1KB.

* **Yükleme:** async ve defer ile yüklenmeli, sayfa render’ını bloklamamalı.

* **Gönderim:** navigator.sendBeacon() veya fetch() with keepalive kullan. Beacon API sayfa kapanırken bile veri gönderimini garanti eder.

* **First-Party Cookie:** client\_id olarak UUID üret ve first-party cookie olarak sakla. HttpOnly: false (JS erişimi gerekli), Secure: true, SameSite: Lax, Max-Age: 63072000 (2 yıl). Bu, Snowplow’un domain\_userid yaklaşımının aynısıdır.

* **Session ID:** sessionStorage’da UUID tut. Tab kapatılınca otomatik silinir. Ayrıca 30 dakika inactivity timeout ile yeni session başlat (GA4 ile aynı mantık).

**Otomatik Yakalanan Event’ler:**

* **page\_view:** URL, referrer, title, timestamp, viewport size. SPA’larda History API’yi dinleyerek route değişikliklerinde otomatik tetikle.

* **session\_start:** Yeni session başladığında bir kez gönderilir.

* **scroll\_depth:** %25, %50, %75, %100 eşiklerinde IntersectionObserver ile tespit et.

* **web\_vitals:** LCP, FID/INP, CLS değerlerini PerformanceObserver API ile yakala (opsiyonel ama değerli).

**Manuel Event’ler (umami.track() benzeri):**

window.lynq.event(name, properties) şeklinde bir API sun. Properties JSON objesi olsun, max 50 key, string max 500 karakter (Umami ile aynı limitler).

## **3.3 Katman 2: Ingestion Layer (Collect Endpoint)**

**Amaç:** Tracker’dan gelen HTTP request’leri almak, validate etmek, zenginleştirmek ve ClickHouse’a yazmak.

**Endpoint Tasarımı:**

* **URL:** POST /api/collect (veya /api/event)

* **CORS:** Sadece kendi domain’lerinden gelen isteklere izin ver (Origin header kontrolü)

* **Rate Limiting:** IP başına dakikada max 60 event (bot ve abuse koruması)

* **Response:** 204 No Content (en hızlı response, browser’a işlem tamam der)

**Validation (Snowplow’dan öğrenilen):**

* Gelen JSON’ın beklenen schema’ya uygun olup olmadığını kontrol et

* Zorunlu alanları kontrol et: website\_id, event\_type, timestamp

* website\_id’nin geçerli bir kayıtlı site olup olmadığını doğrula

* Geçersiz event’leri silme — ayrı bir bad\_events tablosuna kaydet (non-lossy ilkesi)

**Enrichment (collector aşamasında yapılacaklar):**

* **GeoIP:** MaxMind GeoLite2 (free) ile IP’den ülke, şehir, timezone çıkar

* **Device Parsing:** User-Agent string’inden browser, OS, device type parse et (ua-parser-js veya benzer)

* **UTM Parsing:** URL’deki utm\_source, utm\_medium, utm\_campaign, utm\_term, utm\_content parametrelerini ayıkla

* **Referrer Classification:** Referrer domain’ini kategorize et: search (google, bing), social (twitter, facebook), direct, email, other

* **Bot Filtering:** IAB bot listesi ve bilinen bot User-Agent pattern’larını filtrele (Snowplow bunu enrichment içinde yapar)

**Buffering ve Batch Insert:**

ClickHouse küçük insert’lerde verimsizdir. Her event’i tek tek yazmak yerine, in-memory buffer’da biriktir ve her 5 saniyede veya 1000 event biriktiğinde toplu insert yap. ClickHouse’un async\_insert özelliği de kullanılabilir ama kendi buffer’ın daha kontrollü.

## **3.4 Katman 3: Veri Depolama**

**Ana Tablo Tasarımı (ClickHouse):** Galaxy ve Umami şemalarından eşlenen, tek denormalize tablo yaklaşımı:

| Alan | Tip | Açıklama |
| :---- | :---- | :---- |
| timestamp | DateTime('UTC') | Event zamanı (PRIMARY KEY) |
| event\_type | LowCardinality(String) | page\_view, click, scroll, custom |
| event\_name | String | Custom event adı (opsiyonel) |
| website\_id | UUID | Hangi site |
| client\_id | String | First-party cookie (2 yıl) |
| session\_id | String | Session (30dk timeout) |
| url\_path | String | Sayfa yolu |
| url\_query | String | Query string |
| page\_title | String | Sayfa başlığı |
| referrer | String | Referrer URL |
| referrer\_domain | String | Referrer domain |
| utm\_source | LowCardinality(String) | Kampanya kaynak |
| utm\_medium | LowCardinality(String) | Kampanya medyum |
| utm\_campaign | String | Kampanya adı |
| country | LowCardinality(String) | GeoIP ülke kodu |
| city | String | GeoIP şehir |
| browser | LowCardinality(String) | Tarayıcı adı |
| os | LowCardinality(String) | İşletim sistemi |
| device\_type | LowCardinality(String) | desktop/mobile/tablet |
| screen | String | Ekran çözünürlüğü |
| language | LowCardinality(String) | Tarayıcı dili |
| properties | String | JSON ek veriler |

**MergeTree Engine ve ORDER BY:** ORDER BY (website\_id, timestamp) kullan. Çoğu sorgu bir website’ı belirli tarih aralığında filtreler. Bu sıralama ClickHouse’un sparse index’ini en verimli şekilde kullanmasını sağlar. PARTITION BY toYYYYMM(timestamp) ile aylık partition’lar oluştur — eski verileri kolay sil veya arşivle.

**LowCardinality Optimizasyonu:** Tekrar eden değerler için (country, browser, os, device\_type, utm\_source) LowCardinality wrapper kullan. Bu, dictionary encoding uygulayarak hem depolama hem sorgu performansını artırır. ClickHouse dokümanları bunu özellikle web analytics için önerir.

**Materialized View Örnekleri:**

* **Sayfa görüntüleme özeti:** page\_view event’lerini filtreleyen, url\_path ve website\_id ile ORDER BY yapan küçük bir tablo. Dashboard’ın ana sorgusu bunu kullanır.

* **Günlük metrik özeti:** SummingMergeTree ile günlük toplam pageview, unique visitor, session sayısını otomatik hesapla. Trend grafikleri için idealdir.

* **Referrer özeti:** Traffic source bazında gruplandırılmış toplam değerler.

**PostgreSQL (Uygulama Verileri):** Plausible ve Umami yaklaşımı: web sitesi kayıtları, kullanıcı hesapları, team bilgileri, API key’ler, dashboard ayarları gibi işlemsel verileri PostgreSQL’de tut. Bu veriler az satırlı ama sık güncellenebilir — OLTP workload.

## **3.5 Katman 4: Visualization (Dashboard)**

**Seçenekler ve Tavsiye:**

| Seçenek | Avantaj | Dezavantaj | Tavsiye |
| :---- | :---- | :---- | :---- |
| Grafana | ClickHouse plugin hazır, ücretsiz, esnek | Özel analytics UI değil | MVP için en hızlı yol |
| Metabase | SQL bilmeyenler için de kolay | ClickHouse desteği plugin ile | Ekip kullanımı için iyi |
| Custom (React) | Tam kontrol, ürün olarak sunulabilir | Geliştirme süresi uzun | Ürünleştirme hedefi varsa |
| Evidence.dev | Markdown \+ SQL, zarif | Topluluk küçük | Dahili raporlama için |

**MVP İçin Tavsiye:** Grafana ile başla. ClickHouse data source plugin’i kur, birkaç panel ile temel metrikleri görselleştir: günlük pageviews, unique visitors, top pages, traffic sources, browser/device dağılımı. Haftalara değil saatlere mal olur. Ürünleştirmek istersen sonra custom React dashboard geç.

# **4\. TEKNOLOJİ SEÇİMİ VE MALİYET**

## **4.1 Önerilen Stack**

| Katman | Teknoloji | Neden |
| :---- | :---- | :---- |
| JS Tracker | Vanilla JS (kendi) | 2KB, bağımlılık yok, tam kontrol |
| Ingestion | Node.js (Fastify) veya Go | Hızlı, async I/O, geniş ekosistem |
| Analytics DB | ClickHouse Cloud (free tier) | Clickstream için tasarlanmış, managed |
| App DB | PostgreSQL (Supabase free) | Olgun, güvenilir, ücretsiz tier |
| GeoIP | MaxMind GeoLite2 | Ücretsiz, haftalık güncelleme |
| Device Parse | ua-parser-js (npm) | Hafif, doğru, aktüel |
| Dashboard | Grafana OSS | ClickHouse native, ücretsiz |
| Deploy | Railway / Fly.io / VPS | Kolay, ucuz, tek komut deploy |

## **4.2 Tahmini Aylık Maliyet**

| Bileşen | Küçük Site (\<100K/ay) | Orta Site (100K-1M/ay) | Büyük Site (1M-10M/ay) |
| :---- | :---- | :---- | :---- |
| ClickHouse Cloud | Ücretsiz tier | Ücretsiz tier | \~$50-100 |
| Server (Ingestion) | Ücretsiz (Railway) | $5-10 (Fly.io) | $20-40 (VPS) |
| PostgreSQL | Ücretsiz (Supabase) | Ücretsiz (Supabase) | $15-25 |
| Grafana | Ücretsiz (self-host) | Ücretsiz (self-host) | Ücretsiz (self-host) |
| Domain \+ SSL | $0 (subdomain) | $0 (subdomain) | $12/yıl |
| TOPLAM | $0/ay | $5-10/ay | $85-177/ay |

# **5\. GELİŞTİRME PLANI VE FAZLAR**

## **5.1 Faz 1 — MVP Tracker ve Pipeline (Hafta 1-3)**

**Hedef:** Bir web sitesinden page\_view event’leri toplayıp ClickHouse’a yazabilmek.

* **Hafta 1:** JS Tracker yazımı. page\_view event’i, client\_id cookie, session\_id sessionStorage, sendBeacon ile gönderim. Kendi test sitenle dene.

* **Hafta 2:** Collect endpoint’i (Node.js/Fastify). JSON validation, basit enrichment (GeoIP \+ UA parse), in-memory buffer, ClickHouse’a batch insert.

* **Hafta 3:** ClickHouse Cloud’da tablo oluşturma, ilk verileri yazma ve basit SQL sorguları ile doğrulama. Bad events tablosu.

**Çıktı:** Tracker script’i bir siteye ekleyebilir, event’leri ClickHouse’da görebilir, SQL ile sorgulayabilirsin.

## **5.2 Faz 2 — Temel Dashboard (Hafta 4-5)**

**Hedef:** Grafana ile ana metrikleri görselleştirmek.

1. Grafana kurulumu ve ClickHouse data source bağlantısı

2. Temel paneller: günlük/haftalık pageviews (zaman serisi), unique visitors, top 10 sayfa, traffic sources (referrer domain), browser ve cihaz dağılımı (pie chart), ülke haritası

3. Tarih aralığı seçici ile filtreleme

4. Birden fazla website\_id desteği (variable olarak)

**Çıktı:** Çalışan, paylaşılabilir bir analytics dashboard.

## **5.3 Faz 3 — Enrichment ve Kalite (Hafta 6-7)**

**Hedef:** Veri kalitesini artırmak, bot trafiğini ayıklamak, session mantığını sağlamlaştırmak.

1. IAB bot listesi entegrasyonu — bilinen bot User-Agent’larını filtrele

2. UTM parametre parsing ve referrer classification

3. Session stitching logic: 30dk inactivity timeout, gece yarısı yeni gün başlangıcı

4. Bounce rate hesaplaması: tek page\_view olan session’ları işaretle

5. Bad events monitoring: geçersiz event oranını izle, alert kur

6. Materialized view’lar: günlük özet, sayfa özeti, referrer özeti

## **5.4 Faz 4 — Advanced Analytics (Hafta 8-12)**

**Hedef:** Custom event’ler, funnel analizi, retention gibi ileri seviye özellikler.

1. Custom event tracking API: lynq.event('signup\_click', { plan: 'pro' })

2. Funnel analizi: belirli event sırasının tamamlanma oranları (ClickHouse windowFunnel fonksiyonu)

3. Retention analizi: cohort bazlı geri dönüş oranları (ClickHouse retention fonksiyonu)

4. Real-time dashboard: son 5 dakikanın canlı verileri

5. Scroll depth tracking ve web vitals entegrasyonu

6. API endpoint’leri: dış sistemlerin analytics verisine erişimi için REST API

## **5.5 Faz 5 — AI Katmanı ve Ürünleştirme (Hafta 12+)**

1. **Anomaly Detection:** Günlük metrikler için basit z-score hesapla. Örneğin trafik dünün aynı gününe göre 2 standart sapma düştüyse alert gönder (Slack/email). Dieter Plaetinck’in yaklaşımı: basit tutun, işe yarar.

2. **Natural Language Querying:** LLM (Claude/GPT) ile 'Geçen hafta en çok trafik alan 5 sayfa neydi?' sorusunu SQL’e çevir, ClickHouse’da çalıştır, sonucu döndür. Text-to-SQL pipeline.

3. **Automated Insights:** Haftalık otomatik rapor: en çok büyüyen sayfalar, düşen sayfalar, yeni trafik kaynakları, cihaz dağılımı değişimleri.

4. **Multi-tenant Ürünleştirme:** Eğer SaaS olarak sunacaksan: kullanıcı kayıt, website onboarding, embed tracker kodu, paylaşılabilir dashboard, billing.

# **6\. KRİTİK UYARILAR VE BEST PRACTICE**

## **6.1 Kesinlikle Yapman Gerekenler**

* **Ham veriyi her zaman sakla:** Snowplow’un non-lossy ilkesi. Enrichment veya işleme sırasında bir şey bozulursa ham veriden yeniden işleyebilirsin. Ham event’leri ayrı bir tabloda veya S3/GCS bucket’ında tut.

* **Batch insert kullan:** ClickHouse’a asla tek tek satır yazma. Minimum 1000 satırlık batch’ler halinde insert yap. Aksi takdirde ‘too many parts’ hatası alırsın.

* **Proxy/ingestion layer kullan:** Browser’dan doğrudan ClickHouse’a yazdırma. Arada mutlaka validation ve rate limiting yapan bir katman olsun.

* **Tracker’ı kendi domain’inden serve et:** cdn.lynq.studio/t.js gibi. Başka bir domain’den serve edersen adblocker riski artar.

* **HTTPS zorunlu:** Tracker ve collect endpoint’i mutlaka HTTPS üzerinden çalışmalı.

## **6.2 Kesinlikle Yapmaman Gerekenler**

* **Fingerprinting yapma:** Canvas fingerprint, WebGL fingerprint gibi teknikler hem etik değil hem de giderek daha çok tarayıcı tarafından engelleniyor. First-party cookie yeterli.

* **Kişisel veri toplama (consent olmadan):** IP adresini hash’le veya truncate et, tam IP saklama. E-posta, isim gibi PII bilgileri ancak explicit consent ile topla.

* **Her şeyi sıfırdan yazma:** GeoIP için MaxMind, device parsing için ua-parser-js, visualization için Grafana kullan. Tekerleği yeniden icat etme.

* **Premature optimization:** Henüz günde 1000 event alırken Kafka veya Kinesis kurmaya kalkışma. Basit HTTP server \+ buffer \+ ClickHouse yeterli. Milyonlarca event/gün aşınca message queue düşün.

* **Client-side’da hassas işlem yapma:** Session ID üretimini, GeoIP çözümlemeyi client’ta değil server’da yap.

## **6.3 GDPR / KVKK Uyumu**

Privacy-first bir analytics tool’u yapmak, hukuki uyumluğu otomatik olarak kolaylaştırır. Plausible’ın yaklaşımından ilham al:

* Cookie kullanmayan modda çalışabilme desteği sun (Umami/Plausible gibi hash-based session)

* Cookie kullanılacaksa, cookie banner entegrasyonu şart. Consent alınmadan client\_id cookie’si set etme

* IP adresini loglama — hashing veya truncation uygula (son okteti sil)

* Data retention politikası belirle ve otomatik silme mekanizması kur (ClickHouse TTL ile)

* Kullanıcıya veri silme (right to erasure) imkanı sun

# **7\. REFERANS VE KAYNAKLAR**

## **7.1 Okunması Gereken Kaynaklar (Öncelik Sırasıyla)**

* **Umami Source Code:** github.com/umami-software/umami — Tracker JS, collect endpoint, session logic ve database schema’sını incele. Next.js biliyorsan doğrudan anlarsın.

* **ClickHouse Product Analytics Blog:** clickhouse.com/blog/building-product-analytics-with-clickhouse — Galaxy’nin schema tasarımı, materialized view stratejisi, güvenlik yaklaşımı. En pratiğe dönük kaynak.

* **Snowplow Docs (Architecture Overview):** docs.snowplow.io/docs/fundamentals/architecture-overview — Pipeline felsefesini ve enrichment mantığını anlamak için.

* **Plausible GitHub:** github.com/plausible/analytics — Özellikle tracker script’i ve ClickHouse migration dosyalarına bak.

* **ClickHouse Schema Design Docs:** clickhouse.com/docs/data-modeling/schema-design — MergeTree, ORDER BY, LowCardinality, materialized view best practices.

* **Shekhar Gulati \- Umami Architecture Analysis:** shekhargulati.com/2022/05/22/code-reading-and-building-1-umami — Umami’nin adım adım code walkthrough’u.

## **7.2 Yararlı Araçlar ve Kütüphaneler**

| İşlev | Araç | Not |
| :---- | :---- | :---- |
| GeoIP | MaxMind GeoLite2 | Ücretsiz, haftalık güncelleme, mmdb format |
| User-Agent Parse | ua-parser-js (npm) | Regüler güncellenen parser |
| Bot Detection | isbot (npm) | IAB uyumlu bot detection |
| UUID Üretimi | crypto.randomUUID() | Native, bağımlılık gereksiz |
| HTTP Framework | Fastify (Node.js) | Express’ten 2-3x hızlı |
| ClickHouse Client | @clickhouse/client | Resmi Node.js client |
| Visualization | Grafana OSS | ClickHouse plugin mevcut |

# **8\. SONUÇ**

Lynq Studio projesi, tek kişilik bir geliştirici için kesinlikle yapılabilir. Kritik olan doğru kapsamı belirlemek ve her katmanda olgun açık kaynak araçları kullanarak tekerleği yeniden icat etmemektir.

Snowplow’dan pipeline felsefesini, Plausible’dan dual-database ve privacy-first yaklaşımı, Umami’dan basitlik ve hızlı değer üretme disiplinini, ClickHouse’dan denormalize şema ve materialized view stratejisini alarak çok sağlam bir temel oluşturabilirsin.

İlk 3 haftada çalışan bir MVP elde edebilir, 7 haftada production-ready bir sisteme sahip olabilirsin. Sonrasında AI katmanı ve ürünleştirme ile projeyi büyütebilirsin.

**En önemli ilk adım:** Umami’nin kaynak kodunu klonla, docker compose up yap, çalıştır ve tracker’ın nasıl event gönderdiğini, collect endpoint’inin nasıl çalıştığını, veritabanı şemasını incele. Bu sana birkaç saat içinde tüm resmi gösterir.