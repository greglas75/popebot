import { auth } from 'thepopebot/auth';
import { SettingsGeneralPage } from 'thepopebot/chat';

export default async function SettingsGeneralRoute() {
  const session = await auth();
  return <SettingsGeneralPage session={session} />;
}
