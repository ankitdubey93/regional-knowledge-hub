import type pg from 'pg';

export type SetAdminResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

/** Runs as the owner role (scripts only). Promote fails if another platform admin exists. */
export async function setPlatformAdmin(pool: pg.Pool, email: string, on: boolean): Promise<SetAdminResult> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const found = await c.query<{ id: string; email: string; role: string | null }>(
      'select id, email, role from "user" where lower(email) = lower($1)',
      [email],
    );
    const row = found.rows[0];
    if (!row) {
      await c.query('ROLLBACK');
      return { ok: false, error: `No user with the email ${email}. Sign up first.` };
    }
    if (on) {
      const other = await c.query<{ email: string }>(
        `select email from "user" where role = 'platform_admin' and id <> $1`,
        [row.id],
      );
      const first = other.rows[0];
      if (first) {
        await c.query('ROLLBACK');
        return {
          ok: false,
          error: `A platform admin already exists: ${first.email}. Run npm run admin:demote -- ${first.email} first.`,
        };
      }
      await c.query(`update "user" set role = 'platform_admin', updated_at = now() where id = $1`, [row.id]);
    } else {
      if (row.role !== 'platform_admin') {
        await c.query('ROLLBACK');
        return { ok: false, error: `${email} is not the platform admin.` };
      }
      await c.query(`update "user" set role = 'user', updated_at = now() where id = $1`, [row.id]);
    }
    await c.query('COMMIT');
    return { ok: true, email: row.email };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
