import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "canto_nativo_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
const dummyPasswordHashPromise = hashPassword(randomBytes(24).toString("hex"));

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function fail(response, error) {
  if (error instanceof ApiError) {
    sendJson(response, error.status, {
      ok: false,
      error: { code: error.code, message: error.message }
    });
    return;
  }

  console.error("Falha ao processar endpoint da API:", error);
  sendJson(response, 500, {
    ok: false,
    error: { code: "internal_error", message: "Não foi possível concluir a solicitação." }
  });
}

async function readJson(request) {
  const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiError(415, "unsupported_media_type", "Envie o corpo da solicitação como application/json.");
  }

  const chunks = [];
  let totalBytes = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      tooLarge = true;
    } else {
      chunks.push(chunk);
    }
  }
  if (tooLarge) throw new ApiError(413, "payload_too_large", "O corpo da solicitação excedeu 16 KB.");
  if (totalBytes === 0) throw new ApiError(400, "invalid_json", "Envie um objeto JSON no corpo da solicitação.");

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("JSON deve ser objeto");
    return value;
  } catch {
    throw new ApiError(400, "invalid_json", "O corpo da solicitação não contém um objeto JSON válido.");
  }
}

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function rejectUnexpectedFields(payload, allowedFields) {
  if (Object.keys(payload).some((field) => !allowedFields.includes(field))) {
    throw new ApiError(400, "unexpected_fields", "O corpo contém campos não suportados.");
  }
}

function isEmail(value) {
  return value.length <= EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at
  };
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${Buffer.from(derivedKey).toString("base64url")}`;
}

async function verifyPassword(password, encodedHash) {
  const [algorithm, saltText, hashText] = String(encodedHash || "").split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;

  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    if (salt.length < 16 || expected.length !== 64) return false;
    const actual = Buffer.from(await scryptAsync(password, salt, expected.length));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function readSessionToken(request) {
  const cookieHeader = String(request.headers.cookie || "");
  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return "";
    }
  }
  return "";
}

function isPublicHttpsRequest(request) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "")
    .split(",", 1)[0]
    .trim()
    .toLowerCase();
  return forwardedProto === "https" || Boolean(request.socket.encrypted);
}

function writeSessionCookie(request, response, token, maxAgeSeconds) {
  const sameSite = isPublicHttpsRequest(request) ? "None" : "Lax";
  const secure = isPublicHttpsRequest(request) ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${secure}`
  );
}

function createSession(database, request, response, userId) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(tokenHash, userId, expiresAt);
  writeSessionCookie(request, response, token, SESSION_DURATION_MS / 1000);
}

function clearSessionCookie(request, response) {
  const sameSite = isPublicHttpsRequest(request) ? "None" : "Lax";
  const secure = isPublicHttpsRequest(request) ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}`
  );
}

function getSessionUser(database, token) {
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return database.prepare(`
    SELECT users.id, users.name, users.email, users.created_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, new Date().toISOString()) || null;
}

function methodNotAllowed(response, allowed) {
  sendJson(response, 405, {
    ok: false,
    error: { code: "method_not_allowed", message: "Método não permitido para este endpoint." }
  }, { Allow: allowed });
}

export async function handleApiRequest(request, response, url, database) {
  const { pathname } = url;

  if (pathname === "/api/health") {
    if (request.method !== "GET") return methodNotAllowed(response, "GET");
    return sendJson(response, 200, { ok: true, status: "ok", database: "ok" });
  }

  if (pathname === "/api/auth/register") {
    if (request.method !== "POST") return methodNotAllowed(response, "POST");
    try {
      const payload = await readJson(request);
      rejectUnexpectedFields(payload, ["name", "email", "password"]);
      const name = typeof payload.name === "string" ? payload.name.trim().normalize("NFC") : "";
      const email = normalizeEmail(payload.email);
      const password = typeof payload.password === "string" ? payload.password : "";

      if ([...name].length < 2 || [...name].length > NAME_MAX_LENGTH) {
        throw new ApiError(400, "invalid_name", "Informe um nome entre 2 e 100 caracteres.");
      }
      if (!isEmail(email)) {
        throw new ApiError(400, "invalid_email", "Informe um endereço de e-mail válido.");
      }
      if ([...password].length < PASSWORD_MIN_LENGTH || [...password].length > PASSWORD_MAX_LENGTH) {
        throw new ApiError(400, "invalid_password", "A senha deve ter entre 8 e 128 caracteres.");
      }
      if (Buffer.byteLength(password, "utf8") > 1024) {
        throw new ApiError(400, "invalid_password", "A senha é longa demais.");
      }

      const existingUser = database.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
      if (existingUser) {
        throw new ApiError(409, "email_already_registered", "Este e-mail já possui cadastro. Tente entrar.");
      }

      const passwordHash = await hashPassword(password);
      let result;
      try {
        result = database.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
          .run(name, email, passwordHash);
      } catch (error) {
        if (String(error?.message || "").includes("UNIQUE constraint failed: users.email")) {
          throw new ApiError(409, "email_already_registered", "Este e-mail já possui cadastro. Tente entrar.");
        }
        throw error;
      }

      const user = database.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(Number(result.lastInsertRowid));
      createSession(database, request, response, user.id);
      return sendJson(response, 201, { ok: true, user: publicUser(user) });
    } catch (error) {
      return fail(response, error);
    }
  }

  if (pathname === "/api/auth/login") {
    if (request.method !== "POST") return methodNotAllowed(response, "POST");
    try {
      const payload = await readJson(request);
      rejectUnexpectedFields(payload, ["email", "password"]);
      const email = normalizeEmail(payload.email);
      const password = typeof payload.password === "string" ? payload.password : "";
      if ([...password].length > PASSWORD_MAX_LENGTH || Buffer.byteLength(password, "utf8") > 1024) {
        throw new ApiError(400, "invalid_password", "A senha é longa demais.");
      }
      const userRow = isEmail(email)
        ? database.prepare("SELECT id, name, email, password_hash, created_at FROM users WHERE email = ? COLLATE NOCASE").get(email)
        : null;
      const storedHash = userRow?.password_hash || await dummyPasswordHashPromise;
      const matches = password.length > 0 && Buffer.byteLength(password, "utf8") <= 1024
        ? await verifyPassword(password, storedHash)
        : false;

      if (!userRow || !matches) {
        throw new ApiError(401, "invalid_credentials", "E-mail ou senha incorretos.");
      }

      createSession(database, request, response, userRow.id);
      return sendJson(response, 200, { ok: true, user: publicUser(userRow) });
    } catch (error) {
      return fail(response, error);
    }
  }

  if (pathname === "/api/me") {
    if (request.method !== "GET") return methodNotAllowed(response, "GET");
    const token = readSessionToken(request);
    const user = getSessionUser(database, token);
    if (!user) {
      if (token) clearSessionCookie(request, response);
      return sendJson(response, 401, {
        ok: false,
        error: { code: "not_authenticated", message: "Entre na sua conta para continuar." }
      });
    }
    return sendJson(response, 200, { ok: true, user: publicUser(user) });
  }

  if (pathname === "/api/auth/logout") {
    if (request.method !== "POST") return methodNotAllowed(response, "POST");
    try {
      const payload = await readJson(request);
      rejectUnexpectedFields(payload, []);
    } catch (error) {
      return fail(response, error);
    }
    const token = readSessionToken(request);
    if (token) {
      const tokenHash = createHash("sha256").update(token).digest("hex");
      database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    }
    clearSessionCookie(request, response);
    return sendJson(response, 200, { ok: true, message: "Você saiu da sua conta." });
  }

  return sendJson(response, 404, {
    ok: false,
    error: { code: "not_found", message: "Endpoint não encontrado." }
  });
}
