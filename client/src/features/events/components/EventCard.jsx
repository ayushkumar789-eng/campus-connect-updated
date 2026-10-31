import { Link } from 'react-router-dom';
import { Calendar, MapPin, Users, Video } from 'lucide-react';
import { Card, Badge } from '../../../shared/ui/Card.jsx';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { compactNumber, formatDateTime } from '../../../shared/utils/format.js';

export function EventCard({ event, hideOrganizer = false }) {
  const isFull = event.capacity && event.registrationCount >= event.capacity;
  const isEnded = event.endsAt && new Date(event.endsAt) < new Date();
  const isPast = event.startsAt && new Date(event.startsAt) < new Date();

  return (
    <Card className={`p-4 transition-colors hover:border-line-strong ${isEnded || isPast ? 'opacity-75' : ''}`}>
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Cover Image */}
        {event.coverImage?.url ? (
          <div className="shrink-0 h-32 sm:h-24 sm:w-32 rounded-lg bg-surface-2 overflow-hidden border border-line">
            <img 
              src={event.coverImage.url} 
              alt={event.title} 
              className="h-full w-full object-cover" 
            />
          </div>
        ) : (
          <div className="hidden shrink-0 sm:flex h-24 w-24 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Calendar className="h-8 w-8" aria-hidden />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link to={`/events/${event.id}`} className="group min-w-0">
                <h3 className="truncate text-base font-semibold text-ink group-hover:underline">
                  {event.title}
                </h3>
              </Link>
            </div>
            {(isFull || isEnded || isPast) && (
              <Badge size="sm" tone={isEnded || isPast ? 'neutral' : 'accent'} className="shrink-0">
                {isEnded || isPast ? 'Past' : 'Full'}
              </Badge>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink-2">
            {event.startsAt && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{formatDateTime(event.startsAt)}</span>
              </div>
            )}
            
            {(event.location || event.isOnline) && (
              <div className="flex items-center gap-1.5">
                {event.isOnline ? <Video className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{event.isOnline && event.location ? `Online & ${event.location}` : (event.isOnline ? 'Online' : event.location)}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {compactNumber(event.registrationCount)} {event.capacity ? `/ ${compactNumber(event.capacity)}` : ''} attending
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {event.college && <Badge size="sm">{event.college}</Badge>}
            {event.tags?.map(t => (
              <Badge key={t} size="sm">#{t}</Badge>
            ))}
            {event.group && (
              <Badge size="sm" tone="neutral" className="pointer-events-none">
                Group Event
              </Badge>
            )}
          </div>

          {!hideOrganizer && event.organizer && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-ink-3">
              <Link to={`/u/${event.organizer.username}`} className="flex items-center gap-1.5 hover:text-ink">
                <Avatar user={event.organizer} size="xs" />
                <span className="truncate max-w-[120px] font-medium">{event.organizer.name}</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
