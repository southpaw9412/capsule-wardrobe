import { getChatGPTUser } from '../chatgpt-auth';
import OutfitStudio from './studio';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Outfits · Capsule' };
export default async function OutfitsPage() {
  return <OutfitStudio signedIn={!!(await getChatGPTUser())} />;
}
