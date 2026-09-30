-- VARANGYM automatic IP geolocation cache.
-- Real users are enriched asynchronously by geo-server.js from their latest session IP.
-- Demo accounts are seeded so dashboards have realistic city/region/country data immediately.

CREATE TABLE IF NOT EXISTS user_geo_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ip text,
  country_code text,
  country text,
  region text,
  city text,
  timezone text,
  latitude numeric,
  longitude numeric,
  source text NOT NULL DEFAULT 'ip',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_geo_profiles_country_idx ON user_geo_profiles(country_code,country);
CREATE INDEX IF NOT EXISTS user_geo_profiles_region_idx ON user_geo_profiles(region);
CREATE INDEX IF NOT EXISTS user_geo_profiles_city_idx ON user_geo_profiles(city);

INSERT INTO user_geo_profiles(user_id,ip,country_code,country,region,city,timezone,latitude,longitude,source)
VALUES
 ('10000000-0000-0000-0000-000000000001','198.51.100.21','UA','Ukraine','Kyiv City','Kyiv','Europe/Kyiv',50.4501,30.5234,'demo_seed'),
 ('10000000-0000-0000-0000-000000000002','198.51.100.22','UA','Ukraine','Lviv Oblast','Lviv','Europe/Kyiv',49.8397,24.0297,'demo_seed'),
 ('10000000-0000-0000-0000-000000000003','198.51.100.23','UA','Ukraine','Odesa Oblast','Odesa','Europe/Kyiv',46.4825,30.7233,'demo_seed'),
 ('10000000-0000-0000-0000-000000000004','198.51.100.24','UA','Ukraine','Khmelnytskyi Oblast','Khmelnytskyi','Europe/Kyiv',49.4229,26.9871,'demo_seed'),
 ('10000000-0000-0000-0000-000000000005','198.51.100.25','UA','Ukraine','Dnipropetrovsk Oblast','Dnipro','Europe/Kyiv',48.4647,35.0462,'demo_seed'),
 ('10000000-0000-0000-0000-000000000006','198.51.100.26','UA','Ukraine','Vinnytsia Oblast','Vinnytsia','Europe/Kyiv',49.2331,28.4682,'demo_seed'),
 ('10000000-0000-0000-0000-000000000007','198.51.100.27','DE','Germany','North Rhine-Westphalia','Witten','Europe/Berlin',51.4439,7.3532,'demo_seed'),
 ('10000000-0000-0000-0000-000000000008','198.51.100.28','PL','Poland','Masovian Voivodeship','Warsaw','Europe/Warsaw',52.2297,21.0122,'demo_seed'),
 ('10000000-0000-0000-0000-000000000009','198.51.100.29','UA','Ukraine','Ivano-Frankivsk Oblast','Ivano-Frankivsk','Europe/Kyiv',48.9226,24.7111,'demo_seed'),
 ('10000000-0000-0000-0000-000000000010','198.51.100.30','UA','Ukraine','Ternopil Oblast','Ternopil','Europe/Kyiv',49.5535,25.5948,'demo_seed'),
 ('20000000-0000-0000-0000-000000000001',NULL,'UA','Ukraine','Kyiv City','Kyiv','Europe/Kyiv',50.4501,30.5234,'demo_seed'),
 ('30000000-0000-0000-0000-000000000001',NULL,'UA','Ukraine','Khmelnytskyi Oblast','Khmelnytskyi','Europe/Kyiv',49.4229,26.9871,'demo_seed'),
 ('30000000-0000-0000-0000-000000000002',NULL,'UA','Ukraine','Khmelnytskyi Oblast','Khmelnytskyi','Europe/Kyiv',49.4229,26.9871,'demo_seed'),
 ('30000000-0000-0000-0000-000000000003',NULL,'UA','Ukraine','Khmelnytskyi Oblast','Khmelnytskyi','Europe/Kyiv',49.4229,26.9871,'demo_seed')
ON CONFLICT(user_id) DO NOTHING;
