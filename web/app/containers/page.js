import { auth } from 'thepopebot/auth';
import { ContainersPage } from 'thepopebot/chat';

export default async function ContainersRoute() {
  const session = await auth();
  return <ContainersPage session={session} />;
}
