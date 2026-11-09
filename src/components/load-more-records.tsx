'use client';
import {Button} from '@/components/ui/button';
export function LoadMoreRecords({hasMore,loadingMore,loadMore}:{hasMore:boolean;loadingMore:boolean;loadMore:()=>Promise<void>}){
 return hasMore?<div className="mt-5 space-y-2"><p className="text-xs text-muted-foreground">Showing loaded records. Load more to include older records in search.</p><Button variant="outline" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?'Loading…':'Load more records'}</Button></div>:null;
}
