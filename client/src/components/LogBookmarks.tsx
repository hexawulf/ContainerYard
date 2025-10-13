import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Bookmark, Clock, Filter, Trash2, ExternalLink } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { LogBookmark } from '@shared/schema';
import { formatDistanceToNow } from 'date-fns';

interface LogBookmarksProps {
  containerId?: string;
  currentTimestamp?: string;
  currentFilters?: string;
  onJumpTo?: (containerId: string, timestamp: string, filters?: string) => void;
}

export function LogBookmarks({
  containerId,
  currentTimestamp,
  currentFilters,
  onJumpTo,
}: LogBookmarksProps) {
  const [open, setOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [note, setNote] = useState('');
  const { toast } = useToast();

  const { data: bookmarks = [], isLoading } = useQuery<LogBookmark[]>({
    queryKey: ['/api/bookmarks'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { containerId: string; timestamp: string; note?: string; filters?: string }) => {
      return apiRequest<LogBookmark>('POST', '/api/bookmarks', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks'] });
      toast({
        title: 'Bookmark saved',
        description: 'Log moment bookmarked successfully',
      });
      setSaveDialogOpen(false);
      setNote('');
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save bookmark',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/bookmarks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks'] });
      toast({
        title: 'Bookmark deleted',
        description: 'Bookmark removed successfully',
      });
    },
  });

  const handleSaveBookmark = () => {
    if (!containerId || !currentTimestamp) {
      toast({
        title: 'Cannot save bookmark',
        description: 'No container or timestamp selected',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      containerId,
      timestamp: currentTimestamp,
      note: note.trim() || undefined,
      filters: currentFilters,
    });
  };

  const handleJumpToBookmark = (bookmark: LogBookmark) => {
    onJumpTo?.(bookmark.containerId, bookmark.timestamp, bookmark.filters || undefined);
    setOpen(false);
  };

  const copyDeepLink = (bookmark: LogBookmark) => {
    const url = new URL(window.location.href);
    url.searchParams.set('container', bookmark.containerId);
    url.searchParams.set('timestamp', bookmark.timestamp);
    if (bookmark.filters) {
      url.searchParams.set('filters', bookmark.filters);
    }
    
    navigator.clipboard.writeText(url.toString());
    toast({
      title: 'Link copied',
      description: 'Deep link copied to clipboard',
    });
  };

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <>
      {/* Save Current Moment */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!containerId || !currentTimestamp}
            data-testid="button-save-bookmark"
            title="Bookmark this log moment"
          >
            <Bookmark className="h-3 w-3 mr-2" />
            Bookmark
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Log Moment</DialogTitle>
            <DialogDescription>
              Bookmark this point in time for easy reference later
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                {currentTimestamp && formatTimestamp(currentTimestamp)}
              </div>
              {currentFilters && (
                <div className="flex items-center gap-2 text-muted-foreground mt-1">
                  <Filter className="h-4 w-4" />
                  Active filters: {currentFilters}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Note (optional)</label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note to remember why you bookmarked this..."
                className="mt-1"
                data-testid="textarea-bookmark-note"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveBookmark}
              disabled={createMutation.isPending}
              data-testid="button-confirm-bookmark"
            >
              Save Bookmark
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View All Bookmarks */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            data-testid="button-view-bookmarks"
            title="View all bookmarks"
          >
            <Bookmark className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Log Bookmarks</DialogTitle>
            <DialogDescription>
              Jump to saved log moments
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 overflow-y-auto max-h-[60vh]">
            {isLoading && <div className="text-center text-muted-foreground">Loading...</div>}
            
            {!isLoading && bookmarks.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No bookmarks saved yet
              </div>
            )}

            {bookmarks.map((bookmark) => (
              <div
                key={bookmark.id}
                className="border rounded-md p-3 hover-elevate"
                data-testid={`bookmark-${bookmark.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {bookmark.containerId}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(bookmark.timestamp)}
                      </span>
                    </div>
                    
                    {bookmark.note && (
                      <p className="text-sm text-muted-foreground mb-2">{bookmark.note}</p>
                    )}
                    
                    {bookmark.filters && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Filter className="h-3 w-3" />
                        {bookmark.filters}
                      </div>
                    )}
                    
                    <div className="text-xs text-muted-foreground mt-1">
                      Saved {formatDistanceToNow(new Date(bookmark.createdAt))} ago
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleJumpToBookmark(bookmark)}
                      data-testid={`button-jump-${bookmark.id}`}
                      title="Jump to this moment"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyDeepLink(bookmark)}
                      data-testid={`button-copy-link-${bookmark.id}`}
                      title="Copy deep link"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteMutation.mutate(bookmark.id)}
                      data-testid={`button-delete-${bookmark.id}`}
                      title="Delete bookmark"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
