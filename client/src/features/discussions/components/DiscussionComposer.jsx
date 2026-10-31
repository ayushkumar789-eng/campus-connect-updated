import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '../../../shared/ui/Modal.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Input, Textarea, Select } from '../../../shared/ui/Input.jsx';
import { TagPicker } from '../../../shared/ui/TagPicker.jsx';
import { useCreateDiscussion, useUpdateDiscussion } from '../../../shared/hooks/useData.js';

const DISCUSSION_CATEGORIES = [
  'programming',
  'placements',
  'academics',
  'college-life',
  'projects',
  'career',
  'general',
];

export function DiscussionComposer({ open, onClose, discussionToEdit, defaultGroup }) {
  const createMutation = useCreateDiscussion();
  const updateMutation = useUpdateDiscussion();
  const isEditing = Boolean(discussionToEdit);
  const isPending = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      title: '',
      body: '',
      category: 'general',
      tags: [],
    },
  });

  const tags = watch('tags');

  useEffect(() => {
    if (open) {
      if (isEditing) {
        reset({
          title: discussionToEdit.title || '',
          body: discussionToEdit.body || '',
          category: discussionToEdit.category || 'general',
          tags: discussionToEdit.tags || [],
        });
      } else {
        reset({
          title: '',
          body: '',
          category: 'general',
          tags: [],
        });
      }
    }
  }, [open, isEditing, discussionToEdit, reset]);

  const onSubmit = (data) => {
    const payload = {
      title: data.title.trim(),
      body: data.body.trim(),
      category: data.category,
      tags: data.tags,
    };
    if (defaultGroup) {
      payload.group = defaultGroup;
    }

    if (isEditing) {
      updateMutation.mutate(
        { id: discussionToEdit.id, payload },
        {
          onSuccess: () => {
            onClose();
          },
        }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          onClose();
        },
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Discussion' : 'Start a Discussion'}
      description={isEditing ? 'Update your discussion details.' : 'Ask a question or share something with the community.'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Title"
          placeholder="What is your discussion about?"
          error={errors.title?.message}
          {...register('title', {
            required: 'Title is required',
            minLength: { value: 8, message: 'Title must be at least 8 characters' },
            maxLength: { value: 200, message: 'Title cannot exceed 200 characters' },
          })}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Category"
            error={errors.category?.message}
            {...register('category')}
          >
            {DISCUSSION_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}
              </option>
            ))}
          </Select>
        </div>

        <Textarea
          label="Body (Optional)"
          placeholder="Elaborate on your topic..."
          rows={5}
          error={errors.body?.message}
          {...register('body', {
            maxLength: { value: 8000, message: 'Must not exceed 8000 characters' },
          })}
        />

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Tags
          </label>
          <TagPicker
            tags={tags}
            onChange={(newTags) => setValue('tags', newTags, { shouldValidate: true })}
            placeholder="Add up to 5 tags..."
            maxTags={5}
          />
          {errors.tags && <p className="mt-1.5 text-[13px] text-red-500">{errors.tags.message}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Post Discussion'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
