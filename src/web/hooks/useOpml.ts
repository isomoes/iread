// src/web/hooks/useOpml.ts
// OPML import (POST raw body read from a File) + export (download from GET /api/opml).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { feedsKey } from './useFeeds';
import { toast } from './useUiStore';
import type { ImportOpmlResponse } from '../../shared/types';

/** Import an OPML file: reads its text, posts it, invalidates feeds on success. */
export function useImportOpml() {
  const qc = useQueryClient();
  return useMutation<ImportOpmlResponse, ApiError, File>({
    mutationFn: async (file: File) => {
      const text = await file.text();
      return api.importOpml(text);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: feedsKey });
      qc.invalidateQueries({ queryKey: ['items'] });
      const parts = [`Imported ${data.added} feeds`];
      if (data.skipped > 0) parts.push(`${data.skipped} skipped`);
      if (data.failed > 0) parts.push(`${data.failed} failed`);
      toast({
        kind: data.failed > 0 && data.added === 0 ? 'error' : 'success',
        message: parts.join(', '),
      });
    },
    onError: (e) => {
      toast({ kind: 'error', message: e.message || 'Could not import OPML.' });
    },
  });
}

/** Trigger a browser download of the current feeds as an OPML file. */
export function exportOpml(): void {
  const a = document.createElement('a');
  a.href = api.opmlExportUrl();
  a.download = 'iread.opml';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Hook wrapper exposing the import mutation + export trigger together. */
export function useOpml() {
  const importMutation = useImportOpml();
  return {
    importOpml: importMutation.mutate,
    importPending: importMutation.isPending,
    exportOpml,
  };
}
