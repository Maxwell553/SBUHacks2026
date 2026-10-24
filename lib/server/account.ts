import { transaction } from "@/lib/server/db";

/**
 * Removes an account and everything tied to it. Videos, assets, sessions and
 * cached models cascade from ph_users; safety-audit rows would otherwise be
 * kept with user_id set to NULL, so they are removed explicitly.
 */
export async function deleteAccountData(userId: string) {
  await transaction(async (db) => {
    await db.query("DELETE FROM ph_audit WHERE user_id=$1", [userId]);
    await db.query("DELETE FROM ph_users WHERE id=$1", [userId]);
  });
}
