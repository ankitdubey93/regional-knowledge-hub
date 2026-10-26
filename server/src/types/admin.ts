import { z } from 'zod';

export const PLATFORM_ADMIN_ROLE = 'platform_admin';

export const USERS_PAGE_SIZE = 50;

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  banned: boolean;
  isPlatformAdmin: boolean;
  lastActiveAt: Date | null;
  workspaces: { id: string; name: string; kind: string; role: string }[];
}

export const userListQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export const banBodySchema = z.object({ reason: z.string().trim().min(3).max(200) });
