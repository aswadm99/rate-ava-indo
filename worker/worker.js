// Cloudflare Worker "avaindo-loader"
// Butuh: KV binding bernama TOKENS, dan 3 secret:
//   RBX_CLIENT_ID, RBX_CLIENT_SECRET, GAME_SECRET

const BASE = "https://avaindo-loader.aswadm6399.workers.dev";
// Roblox menolak workers.dev sebagai redirect URL, jadi redirect ke halaman GitHub Pages.
// Halaman itu meneruskan code + state ke ${BASE}/callback, lalu Worker menukarnya jadi token.
const REDIRECT_URI = "https://aswadm99.github.io/rate-ava-indo/";
const SCOPES = "openid user.inventory-item:read";

// GANTI: isi dengan kontak yang bisa dihubungi pemain (username Roblox / email)
const CONTACT = "ISI_KONTAKMU_DI_SINI";

const html = (body, status = 200) =>
  new Response(
    `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Loader Ava Indo</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.6}
a.btn{display:inline-block;background:#335fff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none}</style>
</head><body>${body}</body></html>`,
    { status, headers: { "content-type": "text/html;charset=utf-8" } }
  );

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

function randomString(bytes = 32) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256Base64Url(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function tokenRequest(env, params) {
  const res = await fetch("https://apis.roblox.com/oauth/v1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.RBX_CLIENT_ID,
      client_secret: env.RBX_CLIENT_SECRET,
      ...params,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------- Halaman ----------

function home() {
  return html(`
    <h1>Loader Ava Indo</h1>
    <p>Hubungkan akun Roblox-mu agar game <b>Rate Ava Indo</b> bisa membaca inventory-mu.</p>
    <p><a class="btn" href="/login">Hubungkan akun Roblox</a></p>
    <p><a href="/privacy">Kebijakan Privasi</a> · <a href="/terms">Ketentuan Layanan</a></p>`);
}

function privacy() {
  return html(`
    <h1>Kebijakan Privasi</h1>
    <p>Terakhir diperbarui: 26 November 2026.</p>
    <h2>Data yang kami simpan</h2>
    <ul>
      <li>UserId Roblox-mu.</li>
      <li>Token akses dari Roblox yang kamu setujui, agar kami bisa membaca daftar inventory-mu.</li>
    </ul>
    <p>Kami tidak menyimpan kata sandi, email, atau data pembayaran. Kami tidak pernah melihat kata sandi Roblox-mu.</p>
    <h2>Untuk apa data dipakai</h2>
    <p>Hanya untuk membaca inventory-mu dan menampilkannya di game Rate Ava Indo. Data tidak dijual atau dibagikan ke pihak lain.</p>
    <h2>Menghapus data / mencabut izin</h2>
    <p>Kamu bisa mencabut izin kapan saja lewat pengaturan akun Roblox (bagian aplikasi yang terhubung). Untuk meminta penghapusan data, hubungi: ${CONTACT}.</p>
    <p><a href="/">Kembali</a></p>`);
}

function terms() {
  return html(`
    <h1>Ketentuan Layanan</h1>
    <p>Terakhir diperbarui: 26 November 2026.</p>
    <ul>
      <li>Layanan ini menghubungkan akun Roblox-mu dengan game Rate Ava Indo untuk membaca inventory.</li>
      <li>Kamu setuju memberi izin baca inventory dan boleh mencabutnya kapan saja.</li>
      <li>Layanan diberikan apa adanya tanpa jaminan, dan bisa berubah atau dihentikan sewaktu-waktu.</li>
      <li>Dilarang menyalahgunakan layanan ini, misalnya mencoba mengakses data pemain lain.</li>
    </ul>
    <p>Pertanyaan: ${CONTACT}.</p>
    <p><a href="/">Kembali</a></p>`);
}

// ---------- OAuth ----------

async function login(env) {
  const state = randomString(16);
  const verifier = randomString(32);
  const challenge = await sha256Base64Url(verifier);
  await env.TOKENS.put(`state:${state}`, verifier, { expirationTtl: 600 });

  const url = new URL("https://apis.roblox.com/oauth/v1/authorize");
  url.search = new URLSearchParams({
    client_id: env.RBX_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return Response.redirect(url.toString(), 302);
}

async function callback(url, env) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return html("<p>Permintaan tidak valid.</p>", 400);

  const verifier = await env.TOKENS.get(`state:${state}`);
  if (!verifier) return html("<p>Sesi kedaluwarsa, silakan coba lagi.</p>", 400);
  await env.TOKENS.delete(`state:${state}`);

  const tokens = await tokenRequest(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  if (!tokens) return html("<p>Gagal menghubungkan akun.</p>", 400);

  const info = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  }).then((r) => r.json());

  await env.TOKENS.put(
    `user:${info.sub}`,
    JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: Date.now() + (tokens.expires_in || 900) * 1000,
    })
  );

  return html(`<h1>Berhasil!</h1><p>Akunmu sudah terhubung. Silakan kembali ke game.</p>`);
}

// ---------- Endpoint untuk game ----------

async function getValidToken(env, userId) {
  const raw = await env.TOKENS.get(`user:${userId}`);
  if (!raw) return null;
  const data = JSON.parse(raw);

  if (Date.now() < data.expires_at - 30000) return data.access_token;
  if (!data.refresh_token) return null;

  const fresh = await tokenRequest(env, {
    grant_type: "refresh_token",
    refresh_token: data.refresh_token,
  });
  if (!fresh) return null;

  const updated = {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token || data.refresh_token,
    expires_at: Date.now() + (fresh.expires_in || 900) * 1000,
  };
  await env.TOKENS.put(`user:${userId}`, JSON.stringify(updated));
  return updated.access_token;
}

async function inventory(request, url, env, userId) {
  if (request.headers.get("x-game-secret") !== env.GAME_SECRET) {
    return json({ error: "forbidden" }, 403);
  }
  if (!/^\d+$/.test(userId)) return json({ error: "userId tidak valid" }, 400);

  const token = await getValidToken(env, userId);
  if (!token) return json({ error: "not_linked" }, 404);

  const api = new URL(`https://apis.roblox.com/cloud/v2/users/${userId}/inventory-items`);
  api.searchParams.set("maxPageSize", url.searchParams.get("maxPageSize") || "100");
  for (const key of ["pageToken", "filter"]) {
    const v = url.searchParams.get(key);
    if (v) api.searchParams.set(key, v);
  }

  const res = await fetch(api.toString(), {
    headers: { authorization: `Bearer ${token}` },
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

// ---------- Router ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/") return home();
    if (path === "/privacy") return privacy();
    if (path === "/terms") return terms();
    if (path === "/login") return login(env);
    if (path === "/callback") return callback(url, env);

    const m = path.match(/^\/inventory\/(\d+)$/);
    if (m) return inventory(request, url, env, m[1]);

    return html("<p>Halaman tidak ditemukan.</p>", 404);
  },
};
