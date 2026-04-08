import { auth } from 'thepopebot/auth';
import { ProfileLayout } from 'thepopebot/chat';

export default async function Layout({ children }) {
  const session = await auth();
  return <ProfileLayout session={session}>{children}</ProfileLayout>;
}
