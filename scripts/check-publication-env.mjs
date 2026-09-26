// Release builds must never ship without a usable public Supabase endpoint/key.
const fail = () => { console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to public release configuration."); process.exit(1); };
try {
  const url = new URL(process.env.VITE_SUPABASE_URL);
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !key.trim()) fail();
  if (!key.startsWith("sb_publishable_")) {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    if (payload.role !== "anon") fail();
  }
} catch { fail(); }
console.log("Public Student release configuration is present.");
