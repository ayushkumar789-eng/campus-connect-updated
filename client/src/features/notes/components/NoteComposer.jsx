import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Upload, X } from 'lucide-react';
import { Modal } from '../../../shared/ui/Modal.jsx';
import { Input, Textarea, Select } from '../../../shared/ui/Input.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { useCreateNote, useUpdateNote } from '../../../shared/hooks/useData.js';
import { SUBJECTS, COURSES } from '../../../app/layout/navItems.js';
import { formatBytes } from '../../../shared/utils/format.js';
import { toast } from '../../../shared/ui/Toast.jsx';
import { TagPicker } from '../../../shared/ui/TagPicker.jsx';



export function NoteComposer({ open, onClose, note = null, groupId = null }) {
  const isEditing = Boolean(note);
  const [file, setFile] = useState(null);
  const [tags, setTags] = useState(note?.tags || []);
  
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const isSubmitting = createNote.isPending || updateNote.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      title: note?.title || '',
      description: note?.description || '',
      subject: note?.subject || '',
      course: note?.course || '',
      branch: note?.branch || '',
      semester: note?.semester ? String(note.semester) : '',
      year: note?.year ? String(note.year) : '',
    },
  });

  useEffect(() => {
    if (open) {
      if (note) {
        reset({
          title: note.title || '',
          description: note.description || '',
          subject: note.subject || '',
          course: note.course || '',
          branch: note.branch || '',
          semester: note.semester ? String(note.semester) : '',
          year: note.year ? String(note.year) : '',
        });
        setTags(note.tags || []);
      } else {
        reset();
        setTags([]);
      }
      setFile(null);
    }
  }, [open, note, reset]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (f.size > 10 * 1024 * 1024) {
        toast.error('File size must be under 10MB');
        return;
      }
      setFile(f);
    }
  };

  const onSubmit = (data) => {
    if (!isEditing && !file) {
      toast.error('A file is required to create a note');
      return;
    }

    const formData = new FormData();
    formData.append('title', data.title.trim());
    if (data.description) formData.append('description', data.description.trim());
    formData.append('subject', data.subject.trim());
    if (data.course) formData.append('course', data.course.trim());
    if (data.branch) formData.append('branch', data.branch.trim());
    if (data.semester) formData.append('semester', data.semester);
    if (data.year) formData.append('year', data.year);
    if (groupId) formData.append('group', groupId);
    
    if (tags.length > 0) {
      tags.forEach(t => formData.append('tags[]', t));
    }
    
    if (file) {
      formData.append('file', file);
    }

    if (isEditing) {
      updateNote.mutate(
        { id: note.id, payload: formData },
        { onSuccess: onClose }
      );
    } else {
      createNote.mutate(formData, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      open={open}
      onClose={isSubmitting ? undefined : onClose}
      title={isEditing ? 'Edit Note' : 'Upload Note'}
      size="md"
    >
      <form id="note-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Title"
          required
          {...register('title', { required: 'Title is required', minLength: { value: 3, message: 'Title is too short' }, maxLength: 140 })}
          error={errors.title?.message}
          disabled={isSubmitting}
        />
        
        <div className="grid grid-cols-2 gap-4">
          <Select label="Subject" required {...register('subject', { required: 'Subject is required' })} error={errors.subject?.message} disabled={isSubmitting}>
            <option value="">Select subject...</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          
          <Select label="Course" {...register('course')} error={errors.course?.message} disabled={isSubmitting}>
            <option value="">Select course (Optional)</option>
            {COURSES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input label="Branch" {...register('branch')} error={errors.branch?.message} disabled={isSubmitting} />
          <Select label="Semester" {...register('semester')} error={errors.semester?.message} disabled={isSubmitting}>
            <option value="">N/A</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>Sem {n}</option>
            ))}
          </Select>
          <Select label="Year" {...register('year')} error={errors.year?.message} disabled={isSubmitting}>
            <option value="">N/A</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>Year {n}</option>
            ))}
          </Select>
        </div>

        <Textarea
          label="Description (Optional)"
          {...register('description')}
          error={errors.description?.message}
          disabled={isSubmitting}
        />

        <div className="space-y-1.5">
          <label className="block text-[13px] font-medium text-ink-2">Tags</label>
          <TagPicker tags={tags} onChange={setTags} max={5} disabled={isSubmitting} />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[13px] font-medium text-ink-2">
            File {isEditing ? '(Optional to replace)' : '*'}
          </label>
          {!file && (!isEditing || !note?.file) ? (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface-2 py-6 transition-colors hover:bg-surface">
              <Upload className="mb-2 h-6 w-6 text-ink-3" aria-hidden />
              <span className="text-[13px] font-medium text-ink-2">Click to select a file</span>
              <span className="mt-1 text-[12px] text-ink-3">PDF, DOC, DOCX, PPT, PPTX up to 10MB</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.ppt,.pptx"
                onChange={handleFileChange}
                disabled={isSubmitting}
              />
            </label>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-line p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{file ? file.name : note.file.name}</p>
                <p className="text-xs text-ink-3">{file ? formatBytes(file.size) : formatBytes(note.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="ml-3 p-1.5 text-ink-3 hover:text-danger"
                aria-label="Remove file"
                disabled={isSubmitting}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting} type="button">
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {isEditing ? 'Save Changes' : 'Upload'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
