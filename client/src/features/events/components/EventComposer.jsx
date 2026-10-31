import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Camera } from 'lucide-react';
import { Modal } from '../../../shared/ui/Modal.jsx';
import { Input, Textarea } from '../../../shared/ui/Input.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { TagPicker } from '../../../shared/ui/TagPicker.jsx';
import { toast } from '../../../shared/ui/Toast.jsx';
import { useCreateEvent, useUpdateEvent } from '../../../shared/hooks/useData.js';
import { errorMessage } from '../../../shared/api/client.js';

export function EventComposer({ open, onClose, event = null, groupId = null }) {
  const isEditing = Boolean(event);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(event?.coverImage?.url || null);
  const coverInput = useRef(null);

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const isSubmitting = createEvent.isPending || updateEvent.isPending;

  // Helper to format ISO dates to datetime-local string
  const toDateTimeLocal = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      title: event?.title || '',
      description: event?.description || '',
      startsAt: toDateTimeLocal(event?.startsAt),
      endsAt: toDateTimeLocal(event?.endsAt),
      location: event?.location || '',
      isOnline: event?.isOnline || false,
      meetingLink: event?.meetingLink || '',
      capacity: event?.capacity ? String(event.capacity) : '',
      tags: event?.tags || [],
    },
  });

  const tags = watch('tags');
  const isOnline = watch('isOnline');

  useEffect(() => {
    if (open) {
      if (event) {
        reset({
          title: event.title || '',
          description: event.description || '',
          startsAt: toDateTimeLocal(event.startsAt),
          endsAt: toDateTimeLocal(event.endsAt),
          location: event.location || '',
          isOnline: event.isOnline || false,
          meetingLink: event.meetingLink || '',
          capacity: event.capacity ? String(event.capacity) : '',
          tags: event.tags || [],
        });
        setCoverPreview(event.coverImage?.url || null);
      } else {
        reset({
          title: '',
          description: '',
          startsAt: '',
          endsAt: '',
          location: '',
          isOnline: false,
          meetingLink: '',
          capacity: '',
          tags: [],
        });
        setCoverPreview(null);
      }
      setCoverFile(null);
    }
  }, [open, event, reset]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (f.size > 5 * 1024 * 1024) {
        toast.error('File size must be under 5MB');
        return;
      }
      setCoverFile(f);
      setCoverPreview(URL.createObjectURL(f));
    }
  };

  const submit = (data) => {
    if (data.endsAt && new Date(data.startsAt) >= new Date(data.endsAt)) {
      toast.error('Event must end after it starts');
      return;
    }
    if (data.isOnline && !data.meetingLink) {
      toast.error('Meeting link is required for online events');
      return;
    }

    const formData = new FormData();
    formData.append('title', data.title.trim());
    if (data.description) formData.append('description', data.description.trim());
    
    formData.append('startsAt', new Date(data.startsAt).toISOString());
    if (data.endsAt) {
      formData.append('endsAt', new Date(data.endsAt).toISOString());
    }

    if (data.location) formData.append('location', data.location.trim());
    
    formData.append('isOnline', data.isOnline ? 'true' : 'false');
    if (data.isOnline && data.meetingLink) {
      formData.append('meetingLink', data.meetingLink.trim());
    }

    if (data.capacity) {
      formData.append('capacity', parseInt(data.capacity, 10));
    }

    if (data.tags.length > 0) {
      data.tags.forEach(t => formData.append('tags[]', t));
    }
    
    if (coverFile) {
      formData.append('coverImage', coverFile);
    }

    if (!isEditing && groupId) {
      formData.append('group', groupId);
    }

    if (isEditing) {
      updateEvent.mutate(
        { id: event.id, payload: formData },
        {
          onSuccess: () => {
            toast.success('Event updated successfully');
            onClose();
          },
          onError: (err) => toast.error(errorMessage(err)),
        }
      );
    } else {
      createEvent.mutate(formData, {
        onSuccess: () => {
          toast.success('Event created successfully');
          onClose();
        },
        onError: (err) => toast.error(errorMessage(err)),
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Event' : 'Create Event'}
      size="lg"
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-6">
        {/* Cover Image */}
        <div>
          <label className="mb-1.5 block text-[13.5px] font-medium text-ink">Cover Image</label>
          <div className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line bg-surface-2 p-6 transition-colors hover:border-line-strong hover:bg-surface">
            {coverPreview ? (
              <div className="relative w-full overflow-hidden rounded-md pt-[30%]">
                <img src={coverPreview} alt="Cover preview" className="absolute top-0 left-0 h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-32 w-full flex-col items-center justify-center text-ink-3">
                <Camera className="mb-2 h-8 w-8" aria-hidden />
                <span className="text-[13.5px]">Upload a cover image (optional)</span>
              </div>
            )}
            <input
              ref={coverInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => coverInput.current?.click()}
              className="mt-4"
            >
              {coverPreview ? 'Change Image' : 'Choose File'}
            </Button>
          </div>
        </div>

        <Input
          label="Event Title"
          {...register('title', { required: 'Event title is required', minLength: { value: 3, message: 'Minimum 3 characters' }, maxLength: 140 })}
          error={errors.title?.message}
          placeholder="e.g. Intro to Machine Learning Workshop"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Starts At"
            type="datetime-local"
            {...register('startsAt', { required: 'Start time is required' })}
            error={errors.startsAt?.message}
          />
          <Input
            label="Ends At (Optional)"
            type="datetime-local"
            {...register('endsAt')}
          />
        </div>

        <div className="space-y-4 rounded-lg border border-line p-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line text-accent focus:ring-accent/25"
              {...register('isOnline')}
            />
            <span className="text-[13.5px] font-medium text-ink">This is an online event</span>
          </label>

          {isOnline ? (
            <Input
              label="Meeting Link"
              {...register('meetingLink', { required: isOnline ? 'Meeting link is required' : false })}
              error={errors.meetingLink?.message}
              placeholder="e.g. https://zoom.us/j/..."
            />
          ) : (
            <Input
              label="Location"
              {...register('location')}
              placeholder="e.g. Room 101, Computer Science Building"
            />
          )}
        </div>

        <Input
          label="Capacity (Optional)"
          type="number"
          min="1"
          {...register('capacity')}
          placeholder="Leave blank for unlimited"
        />

        <Textarea
          label="Description"
          rows={4}
          maxLength={4000}
          {...register('description')}
          placeholder="Provide more details about your event..."
        />

        <TagPicker
          label="Tags"
          values={tags}
          onChange={(v) => setValue('tags', v, { shouldDirty: true })}
          hint="Add tags to help people find your event (up to 10)"
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-line">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Event' : 'Create Event')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
