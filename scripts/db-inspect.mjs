// Local read-only operator view. Never selects password hashes, tokens or media bytes.
import pg from "pg";
import { databaseConfig } from "./lib/database-config.mjs";
const views = {
  users: `SELECT u.id,u.name,u.email,u.created_at,count(v.id)::int AS videos FROM ph_users u LEFT JOIN ph_videos v ON v.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`,
  videos: `SELECT id,user_id,prompt,title,duration,status,error,gif_bytes,created_at FROM ph_videos ORDER BY created_at DESC LIMIT 100`,
  audit: `SELECT id,user_id,event,details->>'videoId' AS video_id,details->>'stage' AS stage,details->>'outcome' AS outcome,details->>'reason' AS reason,created_at FROM ph_audit ORDER BY id DESC LIMIT 100`,
};
const view = process.argv[2] || "users";
if (!Object.hasOwn(views, view)) {
  console.error("Usage: npm run db:inspect -- users|videos|audit");
  process.exit(1);
}
const client = new pg.Client(databaseConfig());
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout='10s'");
  console.table((await client.query(views[view])).rows);
  await client.query("COMMIT");
} finally {
  await client.end();
}
