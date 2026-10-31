import { Link } from 'react-router-dom';
import { Users, Lock, Globe } from 'lucide-react';
import { Card, Badge } from '../../../shared/ui/Card.jsx';
import { compactNumber } from '../../../shared/utils/format.js';

export function GroupCard({ group }) {
  return (
    <Card className="p-4 transition-colors hover:border-line-strong">
      <div className="flex gap-4">
        <div className="hidden shrink-0 sm:block">
          {group.coverImage?.url ? (
            <img
              src={group.coverImage.url}
              alt=""
              className="h-16 w-16 rounded-lg object-cover bg-surface-2"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Users className="h-8 w-8" aria-hidden />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link to={`/groups/${group.slug || group.id}`} className="group min-w-0 flex items-center gap-2">
                <h3 className="truncate text-base font-semibold text-ink group-hover:underline">
                  {group.name}
                </h3>
                {group.isPrivate ? (
                  <Lock className="h-3.5 w-3.5 text-ink-3" aria-label="Private group" />
                ) : (
                  <Globe className="h-3.5 w-3.5 text-ink-3" aria-label="Public group" />
                )}
              </Link>
              {group.description && (
                <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">
                  {group.description}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge size="sm" tone="accent" className="capitalize">{group.category}</Badge>
            {group.tags?.map(t => (
              <Badge key={t} size="sm">#{t}</Badge>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-ink-3">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" aria-hidden />
              <span>{compactNumber(group.memberCount)} members</span>
            </div>

            {/* If the API response includes a field representing membership, we could display it here. 
                For example, if group.isMember exists: */}
            {group.isMember && (
              <span className="font-medium text-accent">Joined</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
