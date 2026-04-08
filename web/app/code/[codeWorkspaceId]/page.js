import { auth } from 'thepopebot/auth';
import { CodePage } from 'thepopebot/code';
import { getChatByWorkspaceId } from 'thepopebot/db/chats';

export async function generateMetadata({ params }) {
  const { codeWorkspaceId } = await params;
  const chat = getChatByWorkspaceId(codeWorkspaceId);
  return { title: chat?.title || 'ThePopeBot' };
}

export default async function CodeRoute({ params }) {
  const session = await auth();
  const { codeWorkspaceId } = await params;
  return <CodePage session={session} codeWorkspaceId={codeWorkspaceId} />;
}
