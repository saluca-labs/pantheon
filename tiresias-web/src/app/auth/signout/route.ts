import { signOut } from '@workos-inc/authkit-nextjs';

export async function POST() {
  return signOut();
}
