const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const cloudinary = require("cloudinary").v2;

const root = __dirname;
const dataDir = path.join(root, "data");
const dataFile = path.join(dataDir, "site.json");

loadEnv();

const preferredPort = Number(process.env.PORT || 5173);
const adminToken = process.env.ADMIN_TOKEN || "";
const mongoUri = process.env.MONGODB_URI || "";
const mongoDbName = process.env.MONGODB_DB || "veloura_spaces";
const mongoCollectionName = process.env.MONGODB_COLLECTION || "site_content";
const allowJsonFallback = process.env.ALLOW_JSON_FALLBACK === "true";
const brevoApiKey = process.env.BREVO_API_KEY || "";
const brevoSenderEmail = process.env.BREVO_SENDER_EMAIL || "";
const brevoSenderName = process.env.BREVO_SENDER_NAME || "Veloura Spaces";
const brevoToEmail = process.env.BREVO_TO_EMAIL || "";
const brevoToName = process.env.BREVO_TO_NAME || "Veloura Spaces Team";
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY || "";
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET || "";
const cloudinaryFolder = process.env.CLOUDINARY_FOLDER || "veloura-spaces";

let mongoClient = null;
let mongoCollection = null;
let storageMode = "json";
let storageReady = false;
let storageInitialization = null;

const editableCollections = new Set(["metrics", "services", "projects", "testimonials"]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

if (cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret) {
  cloudinary.config({
    cloud_name: cloudinaryCloudName,
    api_key: cloudinaryApiKey,
    api_secret: cloudinaryApiSecret,
    secure: true
  });
}

function loadEnv() {
  const envFile = path.join(root, ".env");
  if (!fs.existsSync(envFile)) return;

  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separator = trimmed.indexOf("=");
    if (separator === -1) return;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function readJsonData() {
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function writeJsonData(data) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`);
}

function stripMongoFields(document) {
  if (!document) return null;
  const { _id, key, ...data } = document;
  return data;
}

async function initStorage() {
  if (!mongoUri) {
    storageReady = true;
    console.log("Storage mode: local JSON");
    return;
  }

  try {
    mongoClient = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_TIMEOUT_MS || 30000)
    });
    await mongoClient.connect();

    const database = mongoClient.db(mongoDbName);
    mongoCollection = database.collection(mongoCollectionName);
    await mongoCollection.createIndex({ key: 1 }, { unique: true });

    const current = await mongoCollection.findOne({ key: "current" });
    if (!current) {
      await mongoCollection.replaceOne(
        { key: "current" },
        { key: "current", ...readJsonData(), migratedAt: new Date().toISOString() },
        { upsert: true }
      );
    }

    storageMode = "mongodb";
    storageReady = true;
    console.log(`Storage mode: MongoDB database "${mongoDbName}" collection "${mongoCollectionName}"`);
  } catch (error) {
    mongoClient = null;
    mongoCollection = null;
    storageMode = "json";

    if (allowJsonFallback) {
      storageReady = true;
      console.warn(`MongoDB unavailable, using local JSON storage: ${error.message}`);
      return;
    }

    throw new Error(`MongoDB connection failed: ${error.message}`);
  }
}

async function ensureStorage() {
  if (storageReady) return;

  if (!storageInitialization) {
    storageInitialization = initStorage().catch((error) => {
      storageInitialization = null;
      throw error;
    });
  }

  await storageInitialization;
}

async function readData() {
  if (!mongoCollection) return readJsonData();

  const document = await mongoCollection.findOne({ key: "current" });
  return stripMongoFields(document) || readJsonData();
}

async function writeData(data) {
  if (!mongoCollection) {
    writeJsonData(data);
    return;
  }

  await mongoCollection.replaceOne(
    { key: "current" },
    { key: "current", ...data },
    { upsert: true }
  );
}

function publicData(data) {
  const { leads, ...site } = data;
  return site;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function postJson(url, headers, payload) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(payload);

    const req = https.request(
      {
        method: "POST",
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers
        }
      },
      (res) => {
        let responseBody = "";

        res.on("data", (chunk) => {
          responseBody += chunk;
        });

        res.on("end", () => {
          let data = {};

          try {
            data = responseBody ? JSON.parse(responseBody) : {};
          } catch {
            data = { raw: responseBody };
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data });
            return;
          }

          reject(new Error(data.message || data.error || `Request failed with ${res.statusCode}`));
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "object" && req.body !== null) {
      return Promise.resolve(req.body);
    }

    try {
      return Promise.resolve(JSON.parse(String(req.body || "{}")));
    } catch {
      return Promise.reject(new Error("Request body must be valid JSON"));
    }
  }

  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 15_000_000) {
        req.destroy();
        reject(new Error("Request body is too large"));
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must be valid JSON"));
      }
    });
  });
}

function makeId(prefix = "item") {
  const safePrefix = String(prefix)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return `${safePrefix || "item"}-${Date.now().toString(36)}`;
}

function cleanString(value) {
  return String(value || "").trim();
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function brevoConfigured() {
  return Boolean(brevoApiKey && brevoSenderEmail && brevoToEmail);
}

function cloudinaryConfigured() {
  return Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);
}

function validateDataUrl(value) {
  const dataUrl = cleanString(value);
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,([a-z0-9+/=\r\n]+)$/i);

  if (!match) {
    throw new Error("Upload must be an image data URL");
  }

  return {
    dataUrl,
    format: match[1].toLowerCase(),
    buffer: Buffer.from(match[2].replace(/\s/g, ""), "base64")
  };
}

async function cloudinaryUploadBuffer(buffer, options) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureParams = {
    folder: options.folder,
    public_id: options.public_id,
    timestamp
  };
  const signature = cloudinary.utils.api_sign_request(signatureParams, cloudinaryApiSecret);
  const form = new FormData();

  form.append("file", new Blob([buffer]), "upload.png");
  form.append("api_key", cloudinaryApiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", options.folder);
  form.append("public_id", options.public_id);
  form.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinaryCloudName)}/image/upload`,
    {
      method: "POST",
      body: form
    }
  );
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || `Cloudinary upload failed with ${response.status}`);
  }

  return result;
}

async function uploadImageToCloudinary(body) {
  if (!cloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured");
  }

  const image = validateDataUrl(body.dataUrl);
  const sourceName = cleanString(body.filename || body.title || "veloura-image")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);

  if (image.buffer.length > 3_000_000) {
    throw new Error("Choose an image under 3 MB");
  }

  const result = await cloudinaryUploadBuffer(image.buffer, {
    folder: cloudinaryFolder,
    public_id: `${sourceName || "veloura-image"}-${Date.now().toString(36)}`,
    resource_type: "image",
    overwrite: false,
    use_filename: false
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes
  };
}

async function deleteImageFromCloudinary(publicId) {
  if (!cloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured");
  }

  const cleanPublicId = cleanString(publicId);
  if (!cleanPublicId) {
    throw new Error("Cloudinary publicId is required");
  }

  const result = await cloudinary.uploader.destroy(cleanPublicId, {
    resource_type: "image"
  });

  return {
    publicId: cleanPublicId,
    result: result.result
  };
}

function leadEmailHtml(lead) {
  const brief = lead.brief || {};
  const rooms = Array.isArray(brief.rooms) ? brief.rooms.join(", ") : "";

  return `
    <html>
      <body style="margin:0;background:#f4f1eb;color:#171b1d;font-family:Arial,sans-serif;">
        <div style="max-width:680px;margin:0 auto;padding:28px;">
          <div style="background:#fffaf2;border:1px solid #ded6c9;padding:28px;">
            <p style="margin:0 0 8px;color:#8f4a3d;font-size:12px;font-weight:700;text-transform:uppercase;">New consultation request</p>
            <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:32px;">${escapeHtml(lead.name)}</h1>
            <p style="margin:0 0 22px;color:#626d69;">${escapeHtml(lead.message)}</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px;border-top:1px solid #ded6c9;font-weight:700;">Email</td><td style="padding:10px;border-top:1px solid #ded6c9;">${escapeHtml(lead.email)}</td></tr>
              <tr><td style="padding:10px;border-top:1px solid #ded6c9;font-weight:700;">Phone</td><td style="padding:10px;border-top:1px solid #ded6c9;">${escapeHtml(lead.phone || "Not provided")}</td></tr>
              <tr><td style="padding:10px;border-top:1px solid #ded6c9;font-weight:700;">Location</td><td style="padding:10px;border-top:1px solid #ded6c9;">${escapeHtml(lead.location)}</td></tr>
              <tr><td style="padding:10px;border-top:1px solid #ded6c9;font-weight:700;">Service</td><td style="padding:10px;border-top:1px solid #ded6c9;">${escapeHtml(lead.service || "Not selected")}</td></tr>
              <tr><td style="padding:10px;border-top:1px solid #ded6c9;font-weight:700;">Budget</td><td style="padding:10px;border-top:1px solid #ded6c9;">${escapeHtml(lead.budget || "Not selected")}</td></tr>
              <tr><td style="padding:10px;border-top:1px solid #ded6c9;font-weight:700;">Brief</td><td style="padding:10px;border-top:1px solid #ded6c9;">${escapeHtml([brief.projectType, brief.mood, rooms, brief.budget, brief.timeline].filter(Boolean).join(" | "))}</td></tr>
            </table>
          </div>
        </div>
      </body>
    </html>
  `;
}

function leadEmailText(lead) {
  const brief = lead.brief || {};
  const rooms = Array.isArray(brief.rooms) ? brief.rooms.join(", ") : "";

  return [
    "New consultation request",
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone || "Not provided"}`,
    `Location: ${lead.location}`,
    `Service: ${lead.service || "Not selected"}`,
    `Budget: ${lead.budget || "Not selected"}`,
    `Brief: ${[brief.projectType, brief.mood, rooms, brief.budget, brief.timeline].filter(Boolean).join(" | ")}`,
    "",
    lead.message
  ].join("\n");
}

async function sendLeadNotification(lead) {
  if (!brevoConfigured()) {
    return {
      sent: false,
      reason: "Brevo is not fully configured. Set BREVO_API_KEY, BREVO_SENDER_EMAIL, and BREVO_TO_EMAIL."
    };
  }

  const payload = {
    sender: {
      name: brevoSenderName,
      email: brevoSenderEmail
    },
    to: [
      {
        email: brevoToEmail,
        name: brevoToName
      }
    ],
    replyTo: {
      email: lead.email,
      name: lead.name
    },
    subject: `New Veloura consultation request from ${lead.name}`,
    htmlContent: leadEmailHtml(lead),
    textContent: leadEmailText(lead)
  };

  const result = await postJson(
    "https://api.brevo.com/v3/smtp/email",
    { "api-key": brevoApiKey },
    payload
  );

  return {
    sent: true,
    messageId: result.data.messageId || null
  };
}

function itemPayload(collection, body, existing = {}) {
  const now = new Date().toISOString();
  const shared = {
    id: existing.id || makeId(body.title || body.name || collection),
    title: cleanString(body.title || existing.title),
    category: cleanString(body.category || existing.category),
    description: cleanString(body.description || existing.description),
    sortOrder: cleanNumber(body.sortOrder ?? existing.sortOrder, 50),
    featured: Boolean(body.featured),
    updatedAt: now,
    createdAt: existing.createdAt || now
  };

  if (collection === "metrics") {
    return {
      id: existing.id || makeId(body.label || collection),
      value: cleanString(body.value || existing.value),
      label: cleanString(body.label || existing.label),
      sortOrder: cleanNumber(body.sortOrder ?? existing.sortOrder, 50),
      updatedAt: now,
      createdAt: existing.createdAt || now
    };
  }

  if (collection === "services") {
    return {
      ...shared,
      cta: cleanString(body.cta || existing.cta || "Discuss this service")
    };
  }

  if (collection === "projects") {
    return {
      ...shared,
      image: cleanString(body.image || existing.image || "assets/veloura-hero.png"),
      scope: cleanString(body.scope || existing.scope),
      location: cleanString(body.location || existing.location)
    };
  }

  return {
    id: existing.id || makeId(body.name || collection),
    quote: cleanString(body.quote || existing.quote),
    name: cleanString(body.name || existing.name),
    role: cleanString(body.role || existing.role),
    sortOrder: cleanNumber(body.sortOrder ?? existing.sortOrder, 50),
    featured: Boolean(body.featured),
    updatedAt: now,
    createdAt: existing.createdAt || now
  };
}

function adminAllowed(req) {
  if (!adminToken) return true;
  return req.headers["x-admin-token"] === adminToken;
}

async function handleApi(req, res, parsed) {
  const segments = parsed.pathname.split("/").filter(Boolean);
  const method = req.method;

  if (method === "GET" && parsed.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      storage: storageMode,
      email: {
        provider: "brevo",
        configured: brevoConfigured()
      },
      uploads: {
        provider: "cloudinary",
        configured: cloudinaryConfigured(),
        cloudName: cloudinaryConfigured() ? cloudinaryCloudName : null
      }
    });
    return;
  }

  if (method === "GET" && parsed.pathname === "/api/site") {
    sendJson(res, 200, publicData(await readData()));
    return;
  }

  if (method === "POST" && parsed.pathname === "/api/leads") {
    const body = await readBody(req);
    const required = ["name", "email", "location", "message"];
    const missing = required.filter((field) => !cleanString(body[field]));

    if (missing.length) {
      sendError(res, 400, `Missing required fields: ${missing.join(", ")}`);
      return;
    }

    const data = await readData();
    const now = new Date().toISOString();
    const lead = {
      id: makeId(body.name),
      name: cleanString(body.name),
      email: cleanString(body.email),
      phone: cleanString(body.phone),
      location: cleanString(body.location),
      service: cleanString(body.service),
      budget: cleanString(body.budget),
      message: cleanString(body.message),
      brief: body.brief || null,
      status: "new",
      createdAt: now
    };

    let email = { sent: false, reason: "Email notification was not attempted" };

    try {
      email = await sendLeadNotification(lead);
    } catch (error) {
      email = { sent: false, reason: error.message };
      console.warn(`Brevo notification failed for lead ${lead.id}: ${error.message}`);
    }

    lead.notification = email;
    data.leads = [lead, ...(data.leads || [])];
    data.updatedAt = now;
    await writeData(data);
    sendJson(res, 201, { lead, email });
    return;
  }

  if (segments[1] !== "admin") {
    sendError(res, 404, "API route not found");
    return;
  }

  if (!adminAllowed(req)) {
    sendError(res, 401, "Admin token is required");
    return;
  }

  if (method === "GET" && parsed.pathname === "/api/admin/data") {
    sendJson(res, 200, { ...(await readData()), storage: storageMode });
    return;
  }

  if (method === "POST" && parsed.pathname === "/api/admin/upload-image") {
    const body = await readBody(req);
    const upload = await uploadImageToCloudinary(body);
    sendJson(res, 201, { upload });
    return;
  }

  if (method === "DELETE" && parsed.pathname === "/api/admin/upload-image") {
    const body = await readBody(req);
    const deleted = await deleteImageFromCloudinary(body.publicId);
    sendJson(res, 200, { deleted });
    return;
  }

  if (method === "PUT" && parsed.pathname === "/api/admin/settings") {
    const body = await readBody(req);
    const data = await readData();
    data.settings = { ...(data.settings || {}), ...body };
    data.updatedAt = new Date().toISOString();
    await writeData(data);
    sendJson(res, 200, data);
    return;
  }

  const collection = segments[2];
  const id = segments[3];

  if (collection === "leads") {
    const data = await readData();
    data.leads = Array.isArray(data.leads) ? data.leads : [];
    const index = data.leads.findIndex((lead) => lead.id === id);

    if (index === -1) {
      sendError(res, 404, "Lead not found");
      return;
    }

    if (method === "DELETE" && segments.length === 4) {
      const [removed] = data.leads.splice(index, 1);
      data.updatedAt = new Date().toISOString();
      await writeData(data);
      sendJson(res, 200, removed);
      return;
    }

    sendError(res, 405, "Method not allowed");
    return;
  }

  if (!editableCollections.has(collection)) {
    sendError(res, 404, "Editable collection not found");
    return;
  }

  const data = await readData();
  data[collection] = Array.isArray(data[collection]) ? data[collection] : [];

  if (method === "POST" && segments.length === 3) {
    const body = await readBody(req);
    const item = itemPayload(collection, body);
    data[collection].push(item);
    data.updatedAt = new Date().toISOString();
    await writeData(data);
    sendJson(res, 201, item);
    return;
  }

  const index = data[collection].findIndex((item) => item.id === id);

  if (index === -1) {
    sendError(res, 404, "Item not found");
    return;
  }

  if (method === "PUT" && segments.length === 4) {
    const body = await readBody(req);
    const item = itemPayload(collection, body, data[collection][index]);
    data[collection][index] = item;
    data.updatedAt = new Date().toISOString();
    await writeData(data);
    sendJson(res, 200, item);
    return;
  }

  if (method === "DELETE" && segments.length === 4) {
    const [removed] = data[collection].splice(index, 1);
    data.updatedAt = new Date().toISOString();
    await writeData(data);
    sendJson(res, 200, removed);
    return;
  }

  sendError(res, 405, "Method not allowed");
}

function resolveRequest(url) {
  const parsed = new URL(url, "http://localhost");
  const cleanPath = decodeURIComponent(parsed.pathname);
  let requestPath = cleanPath === "/" ? "/index.html" : cleanPath;

  if (requestPath === "/admin" || requestPath === "/admin/") {
    requestPath = "/admin/index.html";
  }

  if (requestPath.startsWith("/data/") || requestPath.startsWith("/.")) {
    return null;
  }

  const filePath = path.normalize(path.join(root, requestPath));

  if (!filePath.startsWith(root)) {
    return null;
  }

  return filePath;
}

function serveFile(req, res) {
  const filePath = resolveRequest(req.url);

  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

async function route(req, res) {
  const parsed = new URL(req.url, "http://localhost");

  if (parsed.pathname === "/admin") {
    res.writeHead(308, { Location: `/admin/${parsed.search}` });
    res.end();
    return;
  }

  if (parsed.pathname.startsWith("/api/")) {
    try {
      await ensureStorage();
      await handleApi(req, res, parsed);
    } catch (error) {
      sendError(res, 400, error.message);
    }
    return;
  }

  serveFile(req, res);
}

function listen(port, attemptsLeft = 12) {
  const server = http.createServer(route);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }

    throw error;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Veloura Spaces running at http://127.0.0.1:${port}`);
    console.log(`Admin panel available at http://127.0.0.1:${port}/admin`);
  });
}

async function handleServerlessApi(req, res, routePath = "") {
  const cleanRoute = String(routePath || "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  const parsed = new URL(`/api/${cleanRoute}`, "http://localhost");

  try {
    await ensureStorage();
    await handleApi(req, res, parsed);
  } catch (error) {
    sendError(res, 400, error.message);
  }
}

module.exports = { handleServerlessApi };

if (require.main === module) {
  ensureStorage()
    .then(() => {
      listen(preferredPort);
    })
    .catch((error) => {
      console.error(`Server startup failed: ${error.message}`);
      process.exitCode = 1;
    });
}
