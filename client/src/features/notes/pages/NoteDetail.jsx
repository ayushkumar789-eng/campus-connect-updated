import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Download, Edit3, Trash2, File as FileIcon } from 'lucide-react';
import { useNote, useDeleteNote, useDownloadNote } from '../../../shared/hooks/useData.js';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';
import { Card, Badge } from '../../../shared/ui/Card.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { ErrorBoundary } from '../../../shared/ui/ErrorBoundary.jsx';
import { EmptyState, ErrorState, CardSkeleton } from '../../../shared/ui/States.jsx';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.jsx';
import { NoteComposer } from '../components/NoteComposer.jsx';
import { timeAgo, formatBytes, compactNumber } from '../../../shared/utils/format.js';
import { errorMessage } from '../../../shared/api/client.js';
import { toast } from '../../../shared/ui/Toast.jsx';

function NoteDetailContent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const { data: note, isLoading, error, refetch } = useNote(id);
  const deleteNote = useDeleteNote();
  const downloadNote = useDownloadNote();

  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (isLoading) return <CardSkeleton lines={6} />;
  
  if (error) {
    if (error.response?.status === 404) {
      return (
        <EmptyState
          title="Note not found"
          description="This resource may have been deleted or does not exist."
          action={<Button onClick={() => navigate('/notes')}>Back to Notes</Button>}
        />
      );
    }
    return <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  }

  const isOwner = user?.id === note.uploadedBy?.id;
  const isAdmin = user?.role === 'admin';
  const canEdit = isOwner;
  const canDelete = isOwner || isAdmin;

  const handleDownload = async () => {
    if (!note.file?.url) {
      toast.error('File URL is missing.');
      return;
    }
    
    // Increment count on server
    downloadNote.mutate(id);
    
    // Provide file download
    window.open(note.file.url, '_blank');
  };

  const handleDelete = () => {
    deleteNote.mutate(id, {
      onSuccess: () => navigate('/notes'),
    });
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/notes')}
          className="h-8 w-8 px-0"
          aria-label="Back to Notes"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold tracking-[-0.02em] text-ink truncate">Note Details</h1>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-ink">{note.title}</h2>
            {note.description && (
              <p className="mt-2 text-sm leading-relaxed text-ink-2 whitespace-pre-wrap">
                {note.description}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone="accent">{note.subject}</Badge>
              {note.course && <Badge>{note.course}</Badge>}
              {note.branch && <Badge>{note.branch}</Badge>}
              {note.semester && <Badge>Sem {note.semester}</Badge>}
              {note.year && <Badge>Year {note.year}</Badge>}
            </div>
            
            {note.tags?.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {note.tags.map(t => (
                  <Badge key={t} size="sm">#{t}</Badge>
                ))}
              </div>
            )}
          </div>
          
          <div className="w-full sm:w-64 shrink-0 space-y-4">
            <div className="rounded-lg border border-line bg-surface-2 p-4">
              <div className="flex items-center gap-3 mb-3">
                <FileIcon className="h-8 w-8 text-ink-3" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink" title={note.file?.name}>
                    {note.file?.name}
                  </p>
                  <p className="text-xs text-ink-3">{formatBytes(note.file?.size)}</p>
                </div>
              </div>
              <Button onClick={handleDownload} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Download
              </Button>
              <p className="mt-2 text-center text-[11px] text-ink-3">
                Downloaded {compactNumber(note.downloadCount)} times
              </p>
            </div>
          </div>
        </div>

        <hr className="my-6 border-line" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {note.uploadedBy ? (
              <Link to={`/u/${note.uploadedBy.username}`} className="flex items-center gap-3 group">
                <Avatar user={note.uploadedBy} size="md" />
                <div>
                  <p className="text-sm font-semibold text-ink group-hover:underline">
                    {note.uploadedBy.name}
                  </p>
                  <p className="text-xs text-ink-3">Uploaded {timeAgo(note.createdAt)}</p>
                </div>
              </Link>
            ) : (
              <div className="flex items-center gap-3">
                <Avatar user={null} size="md" />
                <div>
                  <p className="text-sm font-semibold text-ink">Unknown User</p>
                  <p className="text-xs text-ink-3">Uploaded {timeAgo(note.createdAt)}</p>
                </div>
              </div>
            )}
          </div>

          {(canEdit || canDelete) && (
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-2">
                  <Edit3 className="h-4 w-4" />
                  Edit
                </Button>
              )}
              {canDelete && (
                <Button variant="outline" size="sm" onClick={() => setIsDeleting(true)} className="text-danger hover:border-danger hover:bg-danger-soft gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {isEditing && (
        <NoteComposer
          open={isEditing}
          onClose={() => setIsEditing(false)}
          note={note}
        />
      )}

      {isDeleting && (
        <ConfirmDialog
          open={isDeleting}
          onClose={() => setIsDeleting(false)}
          title="Delete Note"
          description="Are you sure you want to delete this note? This action cannot be undone and the file will be removed permanently."
          confirmLabel="Delete Note"
          onConfirm={handleDelete}
          destructive
          loading={deleteNote.isPending}
        />
      )}
    </div>
  );
}

export default function NoteDetail() {
  return (
    <ErrorBoundary>
      <NoteDetailContent />
    </ErrorBoundary>
  );
}
