import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Camera } from 'lucide-react';
import { Input, Textarea, Select } from '../../../shared/ui/Input.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { TagPicker } from '../../../shared/ui/TagPicker.jsx';
import { toast } from '../../../shared/ui/Toast.jsx';

const GROUP_CATEGORIES = [
  'general',
  'course',
  'subject',
  'placement',
  'development',
  'photography',
  'events',
];

export function GroupForm({ group = null, onSubmit, isSubmitting = false }) {
  const isEditing = Boolean(group);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(group?.coverImage || null);
  const coverInput = useRef(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: group?.name || '',
      description: group?.description || '',
      category: group?.category || 'general',
      tags: group?.tags || [],
      rules: group?.rules || [],
      isPrivate: group?.isPrivate ? 'true' : 'false',
    },
  });

  const tags = watch('tags');
  const rules = watch('rules');

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
    const formData = new FormData();
    formData.append('name', data.name.trim());
    if (data.description) formData.append('description', data.description.trim());
    if (data.category) formData.append('category', data.category);
    formData.append('isPrivate', data.isPrivate === 'true' ? 'true' : 'false');

    if (data.tags.length > 0) {
      data.tags.forEach(t => formData.append('tags[]', t));
    }
    if (data.rules.length > 0) {
      data.rules.forEach(r => formData.append('rules[]', r));
    }
    
    if (coverFile) {
      formData.append('coverImage', coverFile);
    }

    onSubmit(formData);
  };

  return (
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
        label="Group Name"
        {...register('name', { required: 'Group name is required', minLength: { value: 3, message: 'Minimum 3 characters' }, maxLength: 60 })}
        error={errors.name?.message}
        placeholder="e.g. Computer Science 2024"
      />

      <Textarea
        label="Description"
        rows={3}
        maxLength={1000}
        {...register('description')}
        placeholder="What is this group about?"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Category" {...register('category')}>
          {GROUP_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </Select>

        <Select label="Privacy" {...register('isPrivate')}>
          <option value="false">Public (Anyone can see and join)</option>
          <option value="true">Private (Requires invite or admin approval)</option>
        </Select>
      </div>

      <TagPicker
        label="Tags"
        values={tags}
        onChange={(v) => setValue('tags', v, { shouldDirty: true })}
        hint="Add tags to help people find your group (up to 30)"
      />

      <TagPicker
        label="Rules (Optional)"
        values={rules}
        onChange={(v) => setValue('rules', v, { shouldDirty: true })}
        hint="Add rules for your group (e.g. 'No spamming')"
      />

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isEditing ? 'Save Changes' : 'Create Group'}
        </Button>
      </div>
    </form>
  );
}
