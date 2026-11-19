import React from 'react';
import { createRoot } from 'react-dom/client';
import { SellerProductEditor, emptyDraft } from '@/components/seller-product-editor';
import { LegalContact } from '@/components/legal-contact';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription } from '@/components/ui/alert-dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { SupportChatWorkspace } from '@/components/support-chat-workspace';
const long = 'customer-support-' + 'longaddress'.repeat(9) + '@treatstory.example';
const mode = new URLSearchParams(location.search).get('mode');
const fields = <><Input aria-label="Contact email" defaultValue={long}/><Select defaultValue="long"><SelectTrigger aria-label="Delivery location"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="long">{long}</SelectItem><SelectItem value="short">Pickup</SelectItem></SelectContent></Select><LegalContact/></>;
const dropdownLayout = <div style={{minHeight:'190vh',padding:'20px 0'}}>
  <aside data-testid="fixed-sidebar" style={{position:'fixed',right:22,top:26,padding:12,background:'#e8dfd2',zIndex:1}}>Sidebar remains visible</aside>
  <main data-testid="dropdown-layout" style={{width:'min(640px,85%)',margin:'0 auto',padding:24,background:'#fffaf5'}}>
    <h1>Desktop dropdown layout test</h1>{fields}
    <p>Keep the centred page position stable when a select menu opens.</p>
  </main>
</div>;
const fixtureUser = { getIdToken: async () => 'fixture-token' };
function DescriptionEditor() {
  const [draft, setDraft] = React.useState({ ...emptyDraft, name: 'Cocoa cookies', category: 'Cookies', price: '100', description: 'Original description' });
  const [saved, setSaved] = React.useState('');
  return <><output data-testid="saved">{saved}</output><SellerProductEditor user={fixtureUser} open editing={mode === 'ai-edit'}
    busy={false} enabled draft={draft} setDraft={setDraft} categories={[]} onClose={() => {}}
    onSubmit={status => setSaved(status + '/' + draft.description)} onUploadPhotos={async files => { setDraft(d => ({ ...d, imageUrls: files.map(f => 'https://images.example.com/' + f.name).join('\n') })); }} uploading={false} uploadProgress="" /></>;
}
const view = mode?.startsWith('ai-') ? <DescriptionEditor/> : mode === 'dropdown' ? dropdownLayout : mode === 'dialog' ? <Dialog open><DialogContent><DialogTitle>Delivery details</DialogTitle><DialogDescription>Review your contact details.</DialogDescription>{fields}</DialogContent></Dialog> : mode === 'alert' ? <AlertDialog open><AlertDialogContent><AlertDialogTitle>Account confirmation</AlertDialogTitle><AlertDialogDescription>{long}</AlertDialogDescription>{fields}</AlertDialogContent></AlertDialog> : mode === 'support' ? <SupportChatWorkspace tickets={[]} title="Your support requests" secure={false} backHref="/account" backLabel="Back to account" newConversation={fields} topNotice={<a href={'mailto:'+long}>{long}</a>} renderConversation={()=>null}/> : <main style={{maxWidth:700,margin:'auto',padding:16}}>{fields}</main>;
createRoot(document.getElementById('app')!).render(view);
