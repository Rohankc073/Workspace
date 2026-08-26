// One-off script to create the first super admin in an empty database.
// Uses the app's own configured Prisma client (Prisma 7 needs a driver
// adapter, which src/lib/db.js already sets up).
//
// Run from the project root:  node bootstrap-admin.mjs
// Edit the three values below first.

import bcrypt from 'bcryptjs';
import { prisma } from './src/lib/db.js';

const EMAIL = 'admin@atlas.local';        // your super admin email
const NAME = 'Atlas Admin';               // your name
const PASSWORD = 'change-me-at-least-12'; // at least 12 chars — CHANGE THIS

async function main() {
  if (PASSWORD.length < 12) {
    throw new Error('Set PASSWORD to at least 12 characters before running.');
  }

  const email = EMAIL.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { isSuperAdmin: true, isActive: true },
    });
    console.log(`Existing user ${email} promoted to super admin.`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: NAME,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      isSuperAdmin: true,
      isActive: true,
    },
  });

  console.log(`Super admin created: ${user.email}`);
  console.log('Log in, then delete this script.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
