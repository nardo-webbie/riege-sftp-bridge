require("dotenv").config();
const express    = require("express");
const SftpClient = require("ssh2-sftp-client");

const app = express();
app.use(express.json({ limit: "20mb" }));

const CONFIG = {
  SFTP_HOST:     process.env.SFTP_HOST     || "ftp.riege.com",
  SFTP_PORT:     parseInt(process.env.SFTP_PORT || "22"),
  SFTP_USER:     process.env.SFTP_USER     || "vdh-scpdocs-test",
  SFTP_PASSWORD: process.env.SFTP_PASSWORD,
  SFTP_FOLDER:   process.env.SFTP_FOLDER   || "/ftp/incoming",
  BRIDGE_SECRET: process.env.BRIDGE_SECRET,
};

// ── Auth middleware ──────────────────────────────────────
function requireAuth(req, res, next) {
  if (!CONFIG.BRIDGE_SECRET) return next();
  if (req.headers["authorization"] !== `Bearer ${CONFIG.BRIDGE_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Health check ─────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "riege-sftp-bridge", time: new Date().toISOString() });
});

// ── Deliver endpoint ─────────────────────────────────────
// POST /deliver
// Body: { filename: "shipment_xml_...xml", content: "<base64 of XML>" }
app.post("/deliver", requireAuth, async (req, res) => {
  const { filename, content } = req.body;

  if (!filename || !content) {
    return res.status(400).json({ success: false, error: "filename en content zijn verplicht" });
  }

  const sftp = new SftpClient();
  try {
    console.log(`[${now()}] 🔗 Verbinden met ${CONFIG.SFTP_HOST}...`);
    await sftp.connect({
      host:     CONFIG.SFTP_HOST,
      port:     CONFIG.SFTP_PORT,
      username: CONFIG.SFTP_USER,
      password: CONFIG.SFTP_PASSWORD,
    });

    // Decodeer Base64 naar buffer
    const buffer   = Buffer.from(content, "base64");
    const remotePath = `${CONFIG.SFTP_FOLDER}/${filename}`;

    console.log(`[${now()}] 📤 Uploaden: ${remotePath} (${buffer.length} bytes)`);
    await sftp.put(buffer, remotePath);
    await sftp.end();

    console.log(`[${now()}] ✅ Afgeleverd: ${filename}`);
    res.json({ success: true, filename, remotePath });

  } catch (err) {
    console.error(`[${now()}] ❌ SFTP fout: ${err.message}`);
    try { await sftp.end(); } catch(_) {}
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[${now()}] 🚀 Riege SFTP Bridge op poort ${PORT}`);
  console.log(`[${now()}] 📂 SFTP: ${CONFIG.SFTP_USER}@${CONFIG.SFTP_HOST}:${CONFIG.SFTP_FOLDER}`);
});

function now() { return new Date().toISOString(); }
