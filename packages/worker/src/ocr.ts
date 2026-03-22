/**
 * ocr.ts — Google Cloud Vision API via REST
 *
 * Replaces: @google-cloud/vision SDK (Node.js only) + pdf-parse (Node.js only)
 * Pattern:  Service-account JWT → access token → Vision REST API.
 *           Images: images:annotate with DOCUMENT_TEXT_DETECTION
 *           PDFs:   files:annotate with DOCUMENT_TEXT_DETECTION (handles text layer + scanned)
 * Unchanged: isOcrAvailable() logic, processDocument() interface, log messages.
 */

// ── base64 helpers ──────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// ── Google service-account OAuth2 ──────────────────────────────────────────

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, "")
    .replace(/-----END RSA PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken(credentialsJson: string): Promise<string> {
  const creds = JSON.parse(credentialsJson);
  const { client_email, private_key, token_uri } = creds;
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();

  const headerB64 = base64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payloadB64 = base64url(
    enc.encode(
      JSON.stringify({
        iss: client_email,
        scope: "https://www.googleapis.com/auth/cloud-vision",
        aud: token_uri,
        exp: now + 3600,
        iat: now,
      })
    )
  );
  const signingInput = `${headerB64}.${payloadB64}`;
  const privateKey = await importPrivateKey(private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    enc.encode(signingInput)
  );

  const jwt = `${signingInput}.${base64url(signature)}`;
  const tokenRes = await fetch(token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = (await tokenRes.json()) as any;
  if (!tokenData.access_token) {
    throw new Error(`[OCR] Token exchange failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// ── Vision API calls ────────────────────────────────────────────────────────

async function extractTextFromImage(
  fileBuffer: ArrayBuffer,
  credentialsJson: string
): Promise<string | null> {
  try {
    const token = await getAccessToken(credentialsJson);
    const base64 = arrayBufferToBase64(fileBuffer);
    const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{ image: { content: base64 }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }],
      }),
    });
    const data = (await res.json()) as any;
    const fullText = data.responses?.[0]?.fullTextAnnotation?.text || null;
    if (fullText) {
      console.log(`[OCR] Extracted ${fullText.length} characters from image`);
    } else {
      console.log("[OCR] No text found in image");
    }
    return fullText;
  } catch (err: any) {
    console.error("[OCR] Error processing image:", err.message);
    return null;
  }
}

async function extractTextFromPdf(
  fileBuffer: ArrayBuffer,
  credentialsJson: string
): Promise<string | null> {
  // Replaces: pdf-parse (Node.js only). Uses Vision files:annotate for PDFs.
  // Handles both text-layer PDFs and scanned PDFs.
  try {
    const token = await getAccessToken(credentialsJson);
    const base64 = arrayBufferToBase64(fileBuffer);
    const res = await fetch("https://vision.googleapis.com/v1/files:annotate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            inputConfig: { content: base64, mimeType: "application/pdf" },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            pages: [1, 2, 3, 4, 5],
          },
        ],
      }),
    });
    const data = (await res.json()) as any;
    const pages = data.responses?.[0]?.responses || [];
    const text = pages
      .map((r: any) => r.fullTextAnnotation?.text || "")
      .filter(Boolean)
      .join("\n\n");
    if (text) {
      console.log(`[OCR] Extracted ${text.length} characters from PDF`);
    } else {
      console.log("[OCR] PDF has no useful text layer, skipping OCR for PDF (MVP)");
    }
    return text || null;
  } catch (err: any) {
    console.error("[OCR] Error parsing PDF:", err.message);
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function processDocument(
  fileBuffer: ArrayBuffer,
  mimeType: string,
  credentialsJson: string
): Promise<string | null> {
  if (mimeType === "application/pdf") return extractTextFromPdf(fileBuffer, credentialsJson);
  if (["image/jpeg", "image/jpg", "image/png"].includes(mimeType))
    return extractTextFromImage(fileBuffer, credentialsJson);
  console.log(`[OCR] Unsupported file type: ${mimeType}`);
  return null;
}

export function isOcrAvailable(credentialsJson: string | undefined): boolean {
  return !!credentialsJson;
}
