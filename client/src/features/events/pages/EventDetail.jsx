import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Users, Video, Edit, Trash2, Loader2, MoreHorizontal } from 'lucide-react';
import { useEvent, useEventRegistration, useEventAttendees, useRegisterEvent, useUnregisterEvent, useDeleteEvent } from '../../../shared/hooks/useData.js';
import { errorMessage } from '../../../shared/api/client.js';
import { Card, Badge } from '../../../shared/ui/Card.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Dropdown } from '../../../shared/ui/Dropdown.jsx';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.jsx';
import { ErrorState, CardSkeleton } from '../../../shared/ui/States.jsx';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { formatDateTime, compactNumber } from '../../../shared/utils/format.js';
import { EventComposer } from '../components/EventComposer.jsx';
import { toast } from '../../../shared/ui/Toast.jsx';

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [composerOpen, setComposerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: event, isLoading, error, refetch } = useEvent(id);
  const { data: registration, isLoading: regLoading } = useEventRegistration(id);
  
  const {
    data: attendeesData,
    isLoading: attendeesLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useEventAttendees(id);

  const registerMutation = useRegisterEvent();
  const unregisterMutation = useUnregisterEvent();
  const deleteMutation = useDeleteEvent();

  const attendees = attendeesData?.pages?.flatMap(p => p.data) || [];

  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/events')} className="-ml-3 gap-2">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Events
        </Button>
        <ErrorState onRetry={refetch} message={errorMessage(error)} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" disabled className="-ml-3 gap-2">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Events
        </Button>
        <CardSkeleton lines={6} />
      </div>
    );
  }

  if (!event) return null;

  const isFull = event.capacity && event.registrationCount >= event.capacity;
  const isEnded = event.endsAt && new Date(event.endsAt) < new Date();
  const isPast = event.startsAt && new Date(event.startsAt) < new Date();
  const canRegister = !isFull && !isEnded && !isPast && !registration?.registered;

  const handleDelete = () => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Event deleted');
        navigate('/events', { replace: true });
      },
      onError: (err) => {
        toast.error(errorMessage(err));
        setDeleteOpen(false);
      }
    });
  };

  return (
    <div className="space-y-6 pb-6">
      <Button variant="ghost" onClick={() => navigate('/events')} className="-ml-3 gap-2">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Events
      </Button>

      {/* Main Event Card */}
      <Card className="overflow-hidden">
        {event.coverImage?.url && (
          <div className="aspect-[21/9] w-full bg-surface-2 border-b border-line">
            <img 
              src={event.coverImage.url} 
              alt={event.title} 
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold tracking-tight text-ink">{event.title}</h1>
            {event.isOwner && (
              <Dropdown
                trigger={
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4 text-ink-2" />
                  </Button>
                }
                items={[
                  { label: 'Edit Event', icon: Edit, onSelect: () => setComposerOpen(true) },
                  { label: 'Delete Event', icon: Trash2, danger: true, onSelect: () => setDeleteOpen(true) },
                ]}
              />
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2.5 text-sm text-ink-2">
            {event.startsAt && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-ink-3" />
                <span>
                  {formatDateTime(event.startsAt)}
                  {event.endsAt ? ` - ${formatDateTime(event.endsAt)}` : ''}
                </span>
              </div>
            )}
            
            {(event.location || event.isOnline) && (
              <div className="flex items-center gap-2">
                {event.isOnline ? <Video className="h-4 w-4 text-ink-3" /> : <MapPin className="h-4 w-4 text-ink-3" />}
                <span>
                  {event.isOnline ? 'Online Event' : event.location}
                  {event.isOnline && event.location ? ` • ${event.location}` : ''}
                </span>
              </div>
            )}
            
            {event.isOnline && event.meetingLink && (registration?.registered || event.isOwner) && (
              <div className="flex items-center gap-2 ml-6 text-accent">
                <a href={event.meetingLink} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Join Meeting
                </a>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(isFull || isEnded || isPast) && (
              <Badge tone={isEnded || isPast ? 'neutral' : 'accent'}>
                {isEnded || isPast ? 'Past Event' : 'Full'}
              </Badge>
            )}
            {event.college && <Badge>{event.college}</Badge>}
            {event.tags?.map(t => (
              <Badge key={t}>#{t}</Badge>
            ))}
            {event.group && (
              <Link to={`/groups/${event.group}`}>
                <Badge tone="neutral" className="hover:bg-surface-2 cursor-pointer transition-colors">
                  View Group
                </Badge>
              </Link>
            )}
          </div>

          <div className="mt-6 prose prose-sm max-w-none text-ink whitespace-pre-wrap leading-relaxed">
            {event.description}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
            <div className="flex items-center gap-3">
              <Link to={`/u/${event.organizer.username}`}>
                <Avatar user={event.organizer} size="md" />
              </Link>
              <div className="flex flex-col text-sm">
                <span className="text-ink-2 text-[12.5px]">Organized by</span>
                <Link to={`/u/${event.organizer.username}`} className="font-medium text-ink hover:underline">
                  {event.organizer.name}
                </Link>
              </div>
            </div>

            {!regLoading && !event.isOwner && (
              <div>
                {registration?.registered ? (
                  <Button
                    variant="secondary"
                    onClick={() => unregisterMutation.mutate(id)}
                    disabled={unregisterMutation.isPending}
                  >
                    {unregisterMutation.isPending ? 'Canceling...' : 'Cancel RSVP'}
                  </Button>
                ) : (
                  <Button
                    onClick={() => registerMutation.mutate(id)}
                    disabled={registerMutation.isPending || !canRegister}
                  >
                    {registerMutation.isPending ? 'Registering...' : 
                     (isFull ? 'Event Full' : (isEnded || isPast ? 'Ended' : 'RSVP Now'))}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Attendees Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-ink">Attendees</h2>
          <div className="flex items-center gap-1.5 text-sm text-ink-2 bg-surface-2 px-3 py-1 rounded-full">
            <Users className="h-4 w-4" />
            <span className="font-medium">{compactNumber(event.registrationCount)}</span>
            {event.capacity ? <span>/ {compactNumber(event.capacity)}</span> : null}
          </div>
        </div>

        {attendeesLoading ? (
          <div className="space-y-4">
            <CardSkeleton lines={1} />
            <CardSkeleton lines={1} />
          </div>
        ) : attendees.length === 0 ? (
          <div className="text-center py-8 text-ink-3 text-sm">
            No one has registered for this event yet.
          </div>
        ) : (
          <div className="space-y-4">
            {attendees.map((attendee) => (
              <div key={attendee.id} className="flex items-center justify-between">
                <Link to={`/u/${attendee.user.username}`} className="flex items-center gap-3 group">
                  <Avatar user={attendee.user} size="sm" />
                  <div>
                    <div className="text-sm font-medium text-ink group-hover:underline">
                      {attendee.user.name}
                    </div>
                    <div className="text-[12.5px] text-ink-3">
                      @{attendee.user.username}
                    </div>
                  </div>
                </Link>
                <div className="text-[12.5px] text-ink-3">
                  {new Date(attendee.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
            {hasNextPage && (
              <div ref={sentinelRef} className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-ink-3" aria-hidden />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Modals */}
      {composerOpen && (
        <EventComposer 
          open={composerOpen} 
          onClose={() => setComposerOpen(false)} 
          event={event} 
        />
      )}

      {deleteOpen && (
        <ConfirmDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
          title="Delete Event"
          body="Are you sure you want to delete this event? This action cannot be undone and all registrations will be lost."
          confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete Event'}
          danger
        />
      )}
    </div>
  );
}
