# Veloura Spaces

A premium construction and interior design website with a lightweight Node backend, editable content store, admin panel, lead capture, and a polished mobile-first public experience.

## Run Locally

```bash
npm run dev
```

PowerShell may block `npm.ps1` on some Windows machines. Use this equivalent command if that happens:

```bash
npm.cmd run dev
```

The server automatically tries the next port when `5173` is already in use.

## Admin Panel

Open:

```text
http://127.0.0.1:5173/admin
```

If the server moves to another port, use that port instead. The admin panel can edit:

- hero and section copy
- hero metrics
- services
- gallery projects / case studies
- testimonials
- consultation leads

## API Routes

```text
GET    /api/site
GET    /api/admin/data
PUT    /api/admin/settings
DELETE /api/admin/leads/:id
POST   /api/admin/upload-image
DELETE /api/admin/upload-image
POST   /api/admin/metrics
PUT    /api/admin/metrics/:id
DELETE /api/admin/metrics/:id
POST   /api/admin/services
PUT    /api/admin/services/:id
DELETE /api/admin/services/:id
POST   /api/admin/projects
PUT    /api/admin/projects/:id
DELETE /api/admin/projects/:id
POST   /api/admin/testimonials
PUT    /api/admin/testimonials/:id
DELETE /api/admin/testimonials/:id
POST   /api/leads
```

## Data Layer

Primary storage is MongoDB Atlas when `MONGODB_URI` is present in `.env`:

```text
MONGODB_URI=...
MONGODB_DB=veloura_spaces
MONGODB_COLLECTION=site_content
MONGODB_TIMEOUT_MS=30000
ALLOW_JSON_FALLBACK=false
```

The app stores the editable website content in one document keyed as `current`. This keeps the API simple and makes the admin panel immediately usable.

Local JSON remains as the seed and can be used as a deliberate development fallback:

```text
data/site.json
```

On first MongoDB startup, the server seeds the database from `data/site.json` if no `current` document exists. When `MONGODB_URI` is configured, startup fails if MongoDB is unavailable instead of silently writing admin changes to JSON. Set `ALLOW_JSON_FALLBACK=true` only for intentional offline development.

## Brevo Email Notifications

Consultation leads are saved first, then the server attempts to send an email notification through Brevo.

Required environment variables:

```text
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=verified-sender@yourdomain.com
BREVO_SENDER_NAME=Veloura Spaces Website
BREVO_TO_EMAIL=leads@yourdomain.com
BREVO_TO_NAME=Veloura Spaces Team
```

`BREVO_SENDER_EMAIL` must be a verified sender in Brevo. If Brevo rejects the email, the lead still remains saved in MongoDB and the admin lead card shows the notification failure reason.

## Cloudinary Image Uploads

Project images can be uploaded from the admin panel. The server uploads the image to Cloudinary and places the returned secure URL into the project image field.

Required environment variables:

```text
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_FOLDER=veloura-spaces
```

The Cloudinary API secret is used only on the server. Browser code never receives it.
The Cloudinary API key must allow asset creation/upload operations. If its permissions do not include `create`, the admin uploader will display Cloudinary's permission error and no asset will be created. The Vercel-compatible admin upload limit is 3 MB per image.

For production, set an admin token before starting the server:

```bash
ADMIN_TOKEN=your-secure-token npm run dev
```

The admin UI has a token input that stores the token locally in the browser and sends it with admin API requests.
