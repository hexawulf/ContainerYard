import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Trash2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { SavedSearch } from '@shared/schema';

interface SavedSearchesProps {
  isOpen: boolean;
  onClose: () => void;
  onApplySearch: (query: string) => void;
  currentQuery?: string;
}

export function SavedSearches({ isOpen, onClose, onApplySearch, currentQuery }: SavedSearchesProps) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [newSearch, setNewSearch] = useState({ name: '', description: '', query: currentQuery || '' });

  const { data: searches = [], isLoading } = useQuery<SavedSearch[]>({
    queryKey: ['/api/saved-searches'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newSearch) => {
      return await apiRequest('POST', '/api/saved-searches', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/saved-searches'] });
      setIsCreating(false);
      setNewSearch({ name: '', description: '', query: '' });
      toast({
        title: 'Search saved',
        description: 'Your search has been saved successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to save search',
        description: error.message,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/saved-searches/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/saved-searches'] });
      toast({
        title: 'Search deleted',
        description: 'Saved search has been removed',
      });
    },
  });

  const handleCreate = () => {
    if (!newSearch.name || !newSearch.query) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Name and query are required',
      });
      return;
    }
    createMutation.mutate(newSearch);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" data-testid="dialog-saved-searches">
        <DialogHeader>
          <DialogTitle>Saved Searches</DialogTitle>
          <DialogDescription>
            Save and reuse your favorite log search queries
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-4">
          {isCreating ? (
            <div className="space-y-3 p-4 border rounded-md bg-card">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Name</label>
                <Input
                  placeholder="e.g., Error Logs"
                  value={newSearch.name}
                  onChange={(e) => setNewSearch({ ...newSearch, name: e.target.value })}
                  data-testid="input-search-name"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Description (optional)</label>
                <Textarea
                  placeholder="What does this search find?"
                  value={newSearch.description}
                  onChange={(e) => setNewSearch({ ...newSearch, description: e.target.value })}
                  className="resize-none h-20"
                  data-testid="input-search-description"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Query</label>
                <Input
                  placeholder="e.g., error OR warn"
                  value={newSearch.query}
                  onChange={(e) => setNewSearch({ ...newSearch, query: e.target.value })}
                  data-testid="input-search-query"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-save-search">
                  {createMutation.isPending ? 'Saving...' : 'Save Search'}
                </Button>
                <Button variant="outline" onClick={() => setIsCreating(false)} data-testid="button-cancel-search">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setNewSearch({ ...newSearch, query: currentQuery || '' });
                setIsCreating(true);
              }}
              data-testid="button-new-search"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Saved Search
            </Button>
          )}

          {isLoading ? (
            <div className="text-sm text-muted-foreground text-center py-8">Loading searches...</div>
          ) : searches.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No saved searches yet. Create one to get started!
            </div>
          ) : (
            <div className="space-y-2">
              {searches.map((search) => (
                <div
                  key={search.id}
                  className="p-3 border rounded-md hover-elevate active-elevate-2 cursor-pointer"
                  onClick={() => {
                    onApplySearch(search.query);
                    onClose();
                  }}
                  data-testid={`search-item-${search.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Search className="h-4 w-4 text-primary flex-shrink-0" />
                        <h4 className="font-medium text-sm">{search.name}</h4>
                      </div>
                      {search.description && (
                        <p className="text-xs text-muted-foreground mb-2">{search.description}</p>
                      )}
                      <Badge variant="outline" className="font-mono text-xs">
                        {search.query}
                      </Badge>
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(search.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(search.id);
                      }}
                      data-testid={`button-delete-search-${search.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-searches">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
