# ห้องฝากไฟล์ (Super cloud)

เว็บฝากไฟล์ให้เพื่อนและครอบครัว ฝากจากมือถือ โหลดจากคอมได้ ไฟล์หมดอายุเองใน 7/30/60 วัน

Next.js 16 (App Router) · Backblaze B2 (หรือ Cloudflare R2) · Supabase · Upstash Redis · Vercel · Gotenberg (ไม่บังคับ)

## ตั้งค่าครั้งแรก (Phase 0)

### 1. Backblaze B2 (ที่เก็บไฟล์ ฟรี 10 GB ไม่ต้องผูกบัตร)

1. สมัครที่ https://www.backblaze.com/sign-up/cloud-storage
2. **Buckets → Create a Bucket**: ตั้งชื่อ (ต้องไม่ซ้ำกับใครในโลก เช่น `supercloud-ชื่อเล่น-2026`),
   Files in Bucket = **Private**, Default Encryption ตามสะดวก, Object Lock = Disable
   จด **Endpoint** ที่หน้า bucket (เช่น `s3.us-west-004.backblazeb2.com`)
3. **Application Keys → Add a New Application Key**: Allow access to Bucket(s) = **เลือก bucket นี้**,
   Type of Access = **Read and Write** แล้วจด `keyID` และ `applicationKey` (แสดงครั้งเดียว)
   - `keyID` → `STORAGE_ACCESS_KEY_ID`
   - `applicationKey` → `STORAGE_SECRET_ACCESS_KEY`
   - `https://` + Endpoint → `STORAGE_ENDPOINT`
   - ชื่อ bucket → `STORAGE_BUCKET`
4. ตั้ง CORS และกฎลบไฟล์อัตโนมัติด้วยคำสั่งเดียว (ใช้ **Master Application Key** จากหน้า Application Keys
   → Generate New Master Application Key ใช้เฉพาะคำสั่งนี้ ห้ามใส่ใน Vercel)

   ```bash
   B2_KEY_ID=master-key-id B2_APP_KEY=master-app-key \
     node scripts/setup-b2.mjs ชื่อ-bucket https://YOUR-APP.vercel.app http://localhost:3000
   ```

   ได้โดเมนใหม่เมื่อไหร่ ให้รันคำสั่งนี้ซ้ำพร้อมใส่ทุกโดเมน (คำสั่งจะเขียนทับของเดิม)

> ใช้ Cloudflare R2 แทนก็ได้ ใส่ `STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`
> แล้วตั้ง CORS ใน R2 ให้รับ PUT/GET และ header `Content-Type`, `Content-Disposition`

### 2. Supabase

1. สร้างโปรเจกต์ → SQL Editor → รัน [`supabase/schema.sql`](supabase/schema.sql)
   (เปิด RLS ทุกตาราง ไม่มี policy สาธารณะ และ revoke สิทธิ์ anon/authenticated)
2. Project Settings → API → จด `Project URL` และ **service_role** key (หรือ secret key)
   key นี้ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น ห้ามใส่ `NEXT_PUBLIC_`

### 3. Upstash Redis

สร้างฐานข้อมูล (region ใกล้ Vercel เช่น Singapore) → จด `UPSTASH_REDIS_REST_URL` และ `UPSTASH_REDIS_REST_TOKEN`

### 4. Vercel

1. push repo ขึ้น GitHub แล้ว Import ใน Vercel
2. ใส่ Environment Variables ตาม [`.env.example`](.env.example)
   - `ADMIN_PIN` ใช้ตัวเลขยาว 8 หลักขึ้นไป
   - `CRON_SECRET` สร้างด้วย `openssl rand -hex 32`
3. Cron ตั้งไว้แล้วใน [`vercel.json`](vercel.json) เรียก `/api/cron/cleanup` ทุกวันเวลา 03:00 น. (เวลาไทย)
4. ตั้ง budget alert ใน Vercel และ caps & alerts ใน Backblaze (Account → Caps & Alerts)

### รันบนเครื่อง

```bash
cp .env.example .env.local   # ใส่ค่าให้ครบ
npm install                  # postinstall จะคัดลอก pdf.js worker ไปที่ public/
npm run dev
```

ถ้าทดสอบอัปโหลดจาก localhost ต้องมี `http://localhost:3000` ตอนรัน `setup-b2.mjs`

## การทำงานโดยสรุป

| Route | หน้าที่ |
| --- | --- |
| `POST /api/upload/init` | ตรวจจำนวน ขนาด นามสกุล mime และ rate limit แล้วออก presigned PUT URL พร้อมจำ key ที่ออกให้ไว้ใน Redis |
| `POST /api/upload/complete` | รับเฉพาะ key ที่ init ออกให้ (ใช้ได้ครั้งเดียว) ตรวจว่าไฟล์อยู่ในที่เก็บไฟล์จริง ขนาดไม่เกิน และไม่ใช่ไฟล์โปรแกรม (MZ/ELF) แล้วคำนวณ `expires_at` จาก 7/30/60 ฝั่งเซิร์ฟเวอร์ |
| `GET /api/bundles` | เฉพาะรายการที่ยังไม่หมดอายุ ไม่ส่ง key ของไฟล์ หรือ hash รหัสผ่านออกไป |
| `POST /api/files/[id]/download` | ตรวจวันหมดอายุและรหัสผ่าน (จำกัด 5 ครั้งผิด / 15 นาที / IP) แล้วออก signed GET URL อายุ 5 นาที ใส่ชื่อไฟล์จริงผ่าน `Content-Disposition` |
| `POST /api/admin/delete` | ตรวจ `ADMIN_PIN` (จำกัด 5 ครั้งผิด / 15 นาที / IP) แล้วลบทั้งชุดหรือรายไฟล์ ทั้งในที่เก็บไฟล์และฐานข้อมูล |
| `GET /api/cron/cleanup` | ตรวจ `Authorization: Bearer CRON_SECRET` แล้วลบชุดที่หมดอายุทั้งในที่เก็บไฟล์และฐานข้อมูล |

- ชื่อไฟล์ในที่เก็บสุ่มเป็น `u/<uuid>` (ต้นฉบับ) และ `p/<uuid>` (PDF ที่แปลงแล้ว) ไม่ใช้ชื่อไฟล์จริง
- รหัสผ่านตั้งต่อ **ชุดไฟล์** (หนึ่งครั้งที่ฝาก) ใช้กับทุกไฟล์ในชุด เก็บเป็น bcrypt hash
- ค่าจำกัดต่าง ๆ อยู่ใน [`src/lib/constants.ts`](src/lib/constants.ts) (100 MB/ไฟล์, 10 ไฟล์/ครั้ง, 300 MB/ครั้ง)
  และ [`src/lib/ratelimit.ts`](src/lib/ratelimit.ts)

## แปลงสกุลไฟล์ (Phase 4)

ในเบราว์เซอร์ ไม่ใช้เซิร์ฟเวอร์เพิ่ม:

| ต้นทาง | โหลดเป็น |
| --- | --- |
| JPG / PNG / WebP / GIF | JPG, PNG, WebP, PDF |
| HEIC (iPhone) | JPG, PNG |
| PDF | JPG หรือ PNG รายหน้า (หลายหน้าได้เป็น ZIP) |

Word / PowerPoint / Excel → PDF ใช้ Gotenberg (ไม่บังคับ):

1. deploy ตาม [`gotenberg/fly.toml`](gotenberg/fly.toml) (ตั้งให้หลับเมื่อไม่ใช้ ค่าใช้จ่ายใกล้ศูนย์)
2. ใส่ `GOTENBERG_URL`, `GOTENBERG_USERNAME`, `GOTENBERG_PASSWORD` ใน Vercel
3. ตอนฝากไฟล์ office ระบบจะแปลงเป็น PDF หลังตอบกลับผู้ฝาก (`after()`) แล้วปุ่ม "PDF" จะขึ้นเองเมื่อแปลงเสร็จ

ถ้าไม่ตั้ง `GOTENBERG_URL` ทุกอย่างยังใช้ได้ เพียงไม่มีตัวเลือก PDF สำหรับไฟล์ office

## เช็กลิสต์ทดสอบจริง (Phase 5)

- [ ] iPhone Safari, Android Chrome, Windows (Chrome/Edge)
- [ ] เน็ตช้า (DevTools → Network → Slow 3G) และไฟล์ใหญ่ใกล้ 100 MB
- [ ] ชื่อไฟล์ภาษาไทย ทั้งตอนแสดงผลและตอนโหลดลงเครื่อง
- [ ] ไฟล์ล็อกรหัส: รหัสผิดโหลดไม่ได้ ผิดเกิน 5 ครั้งถูกพัก 15 นาที
- [ ] ติดตั้งลงหน้าจอโฮม (PWA) ทั้ง iOS และ Android
- [ ] เรียก cron ด้วยมือ: `curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP/api/cron/cleanup`
- [ ] ให้เพื่อน 3–5 คนและคนในบ้านลองใช้โดยไม่อธิบาย แล้วจดว่าติดตรงไหน

## สคริปต์

- `npm run dev` / `npm run build` / `npm run lint` / `npm run typecheck`
- `npm run icons` สร้างไอคอน PWA ใหม่จาก `public/icons-source.svg`
