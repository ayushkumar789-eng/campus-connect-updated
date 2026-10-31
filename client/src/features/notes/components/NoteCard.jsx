import { Link } from 'react-router-dom';
import { Download, File } from 'lucide-react';
import { Card, Badge } from '../../../shared/ui/Card.jsx';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { compactNumber, timeAgo, formatBytes } from '../../../shared/utils/format.js';

export function NoteCard({ note, hideAuthor = false }) {
  return (
    <Card className="p-4 transition-colors hover:border-line-strong">
      <div className="flex gap-4">
        <div className="hidden shrink-0 sm:block">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <File className="h-6 w-6" aria-hidden />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link to={`/notes/${note.id}`} className="group min-w-0">
                <h3 className="truncate text-base font-semibold text-ink group-hover:underline">
                  {note.title}
                </h3>
              </Link>
              {note.description && (
                <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">
                  {note.description}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge size="sm" tone="accent">{note.subject}</Badge>
            {note.course && <Badge size="sm">{note.course}</Badge>}
            {note.branch && <Badge size="sm">{note.branch}</Badge>}
            {note.semester && <Badge size="sm">Sem {note.semester}</Badge>}
            {note.year && <Badge size="sm">Year {note.year}</Badge>}
            {note.tags?.map(t => (
              <Badge key={t} size="sm">#{t}</Badge>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-ink-3">
            {!hideAuthor && note.uploadedBy && (
              <Link to={`/u/${note.uploadedBy.username}`} className="flex items-center gap-1.5 hover:text-ink">
                <Avatar user={note.uploadedBy} size="xs" />
                <span className="truncate max-w-[120px] font-medium">{note.uploadedBy.name}</span>
              </Link>
            )}
            
            <div className="flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" aria-hidden />
              <span>{compactNumber(note.downloadCount)} downloads</span>
            </div>

            {note.file && (
              <span className="truncate max-w-[150px]">
                {note.file.name} · {formatBytes(note.file.size)}
              </span>
            )}

            <span>{timeAgo(note.createdAt)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
