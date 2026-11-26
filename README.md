# ห้องฝากไฟล์ (Super cloud)

เว็บฝากไฟล์ให้เพื่อนและครอบครัว ฝากจากมือถือ โหลดจากคอมได้ ไฟล์หมดอายุเองใน 7/30/60 วัน

Next.js 16 (App Router) · Cloudflare R2 · Supabase · Upstash Redis · Vercel · Gotenberg (ไม่บังคับ)

## ตั้งค่าครั้งแรก (Phase 0)

### 1. Cloudflare R2

1. สร้าง bucket แบบ **private** (ไม่เปิด public access / ไม่ผูก custom domain)
2. R2 → Manage API tokens → สร้าง token สิทธิ์ **Object Read & Write** เลือก **เฉพาะ bucket นี้**
   จด `Access Key ID`, `Secret Access Key` และ `Account ID`
3. Bucket → Settings → **CORS policy** วางเนื้อหาจาก [`r2-cors.json`](r2-cors.json)
   แล้วแก้ `https://YOUR-APP.vercel.app` เป็นโดเมนจริง (ใส่ได้หลายโดเมน)
4. แนะนำ: Bucket → Settings → **Object lifecycle rules** → ลบ object ที่อายุเกิน **61 วัน**
   เป็นตาข่ายกันพลาด เผื่อมีไฟล์ที่อัปโหลดแล้วไม่ได้กดยืนยัน หรือ cron ล้มเหลว

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
4. ตั้ง budget alert ทั้งใน Vercel และ Cloudflare

### รันบนเครื่อง

```bash
cp .env.example .env.local   # ใส่ค่าให้ครบ
npm install                  # postinstall จะคัดลอก pdf.js worker ไปที่ public/
npm run dev
```

ถ้าทดสอบอัปโหลดจาก localhost ต้องมี `http://localhost:3000` ใน CORS ของ R2

## การทำงานโดยสรุป

| Route | หน้าที่ |
| --- | --- |
| `POST /api/upload/init` | ตรวจจำนวน ขนาด นามสกุล mime และ rate limit แล้วออก presigned PUT URL พร้อมจำ key ที่ออกให้ไว้ใน Redis |
| `POST /api/upload/complete` | รับเฉพาะ key ที่ init ออกให้ (ใช้ได้ครั้งเดียว) ตรวจว่าไฟล์อยู่ใน R2 จริง ขนาดไม่เกิน และไม่ใช่ไฟล์โปรแกรม (MZ/ELF) แล้วคำนวณ `expires_at` จาก 7/30/60 ฝั่งเซิร์ฟเวอร์ |
| `GET /api/bundles` | เฉพาะรายการที่ยังไม่หมดอายุ ไม่ส่ง r2 key หรือ hash รหัสผ่านออกไป |
| `POST /api/files/[id]/download` | ตรวจวันหมดอายุและรหัสผ่าน (จำกัด 5 ครั้งผิด / 15 นาที / IP) แล้วออก signed GET URL อายุ 5 นาที ใส่ชื่อไฟล์จริงผ่าน `Content-Disposition` |
| `POST /api/admin/delete` | ตรวจ `ADMIN_PIN` (จำกัด 5 ครั้งผิด / 15 นาที / IP) แล้วลบทั้งชุดหรือรายไฟล์ ทั้งใน R2 และฐานข้อมูล |
| `GET /api/cron/cleanup` | ตรวจ `Authorization: Bearer CRON_SECRET` แล้วลบชุดที่หมดอายุทั้งใน R2 และฐานข้อมูล |

- ชื่อ object ใน R2 สุ่มเป็น `u/<uuid>` (ต้นฉบับ) และ `p/<uuid>` (PDF ที่แปลงแล้ว) ไม่ใช้ชื่อไฟล์จริง
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
