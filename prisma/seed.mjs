import 'dotenv/config';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const { PrismaClient } = pkg;
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });



async function main() {
  const company = await prisma.company.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'Acme Trading', slug: 'acme' },
  });

  const passwordHash = await bcrypt.hash('Falcon-Marina-7734', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@atlas.local' },
    update: {},
    create: {
      email: 'admin@atlas.local',
      name: 'Atlas Admin',
      passwordHash,
      isSuperAdmin: true,
    },
  });

  await prisma.membership.upsert({
    where: { userId_companyId: { userId: admin.id, companyId: company.id } },
    update: {},
    create: { userId: admin.id, companyId: company.id, role: 'ADMIN' },
  });

  console.log('Seeded:', company.name, '/', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());