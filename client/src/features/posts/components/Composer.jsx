import { useRef, useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image, FileText, BarChart3, X, Smile } from 'lucide-react';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Field } from '../../../shared/ui/Input.jsx';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';
import { postsApi } from '../index.js';
import { errorMessage } from '../../../shared/api/client.js';
import { toast } from '../../../shared/ui/Toast.jsx';
import { formatBytes, classNames } from '../../../shared/utils/format.js';

const MAX_CONTENT = 2200;
const MAX_FILES = 6;
const ACCEPT = 'image/*,video/*,.pdf,.zip,.doc,.docx,.ppt,.pptx,.txt';

const EMOJI = ['🚀', '📚', '☕', '🔥', '💡', '🎯', '😅', '✅', '📎', '🧠'];

/**
 * Post composer. Supports the four post types from the brief: text, image or
 * video, poll, and an attached academic resource.
 */
export function Composer({ autoFocus = false, onPosted, groupId = null }) {
  const user = useAuthStore((s) => s.user);

  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [mode, setMode] = useState('text');
  const [poll, setPoll] = useState({ question: '', options: ['', ''] });
  const [resourceTitle, setResourceTitle] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [error, setError] = useState('');

  const fileInput = useRef(null);
  const queryClient = useQueryClient();

  // Revoke object URLs so previews do not leak memory.
  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), [files]);

  const mutation = useMutation({
    mutationFn: (formData) => postsApi.create(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      if (groupId) {
        queryClient.invalidateQueries({ queryKey: ['groups', 'posts', groupId] });
      }
      toast.success('Posted successfully');
      reset();
      onPosted?.();
    },
    onError: (err) => setError(errorMessage(err, 'Could not publish that post.')),
  });

  const reset = () => {
    setContent('');
    setFiles([]);
    setMode('text');
    setPoll({ question: '', options: ['', ''] });
    setResourceTitle('');
    setError('');
  };

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList ?? []);
    if (files.length + incoming.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} files.`);
      return;
    }
    const prepared = incoming.map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
    setFiles((prev) => [...prev, ...prepared]);
    setError('');

    // A single non-media file implies a resource post.
    if (mode === 'text' && incoming.length === 1 && !incoming[0].type.startsWith('image/') && !incoming[0].type.startsWith('video/')) {
      setMode('resource');
    }
  };

  const submit = (event) => {
    event.preventDefault();
    setError('');

    if (!content.trim() && !files.length && mode !== 'poll') {
      setError('Write something or attach a file first.');
      return;
    }
    if (mode === 'poll') {
      const options = poll.options.map((o) => o.trim()).filter(Boolean);
      if (!poll.question.trim()) return setError('Give your poll a question.');
      if (options.length < 2) return setError('A poll needs at least 2 options.');
    }

    const form = new FormData();
    form.append('content', content);
    if (groupId) {
      form.append('visibility', 'group');
      form.append('group', groupId);
    } else {
      form.append('visibility', 'public');
    }
    for (const f of files) form.append('files', f.file);
    if (mode === 'poll') {
      form.append('type', 'poll');
      form.append('poll[question]', poll.question.trim());
      poll.options
        .map((o) => o.trim())
        .filter(Boolean)
        .forEach((o, i) => form.append(`poll[options][${i}]`, o));
    }
    if (mode === 'resource' && resourceTitle.trim()) {
      form.append('type', 'resource');
      form.append('resourceTitle', resourceTitle.trim());
    }

    mutation.mutate(form);
  };

  const remaining = MAX_CONTENT - content.length;
  const canSubmit = content.trim() || files.length || mode === 'poll';

  return (
    <form onSubmit={submit} className="rounded-lg border border-line bg-surface shadow-card">
      <div className="flex gap-3 p-4">
        <Avatar user={user} size="md" />

        <div className="min-w-0 flex-1">
          <textarea
            value={content}
            autoFocus={autoFocus}
            onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT))}
            onKeyDown={(e) => {
              // Cmd/Ctrl+Enter submits, matching the usual composer shortcut.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e);
            }}
            rows={2}
            placeholder="What are you working on today?"
            aria-label="Write your post"
            className="w-full resize-none border-0 bg-transparent text-[15px] leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none"
          />

          {mode === 'poll' && (
            <div className="mt-3 space-y-2.5 rounded-lg border border-line bg-surface-2 p-3">
              <Field label="Poll question">
                <input
                  value={poll.question}
                  onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value.slice(0, 200) }))}
                  placeholder="Which language are you learning?"
                  className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                />
              </Field>

              <div className="space-y-1.5">
                <span className="text-[13px] font-medium text-ink-2">Options</span>
                {poll.options.map((option, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={option}
                      onChange={(e) => {
                        const next = [...poll.options];
                        next[i] = e.target.value.slice(0, 80);
                        setPoll((p) => ({ ...p, options: next }));
                      }}
                      placeholder={`Option ${i + 1}`}
                      className="h-9 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                    />
                    {poll.options.length > 2 && (
                      <button
                        type="button"
                        aria-label={`Remove option ${i + 1}`}
                        onClick={() => setPoll((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}
                        className="rounded p-1.5 text-ink-3 hover:bg-surface-3 hover:text-danger"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {poll.options.length < 6 && (
                <button
                  type="button"
                  onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ''] }))}
                  className="text-[13px] font-medium text-accent hover:underline"
                >
                  + Add option
                </button>
              )}
            </div>
          )}

          {mode === 'resource' && files.length > 0 && (
            <div className="mt-3">
              <Field label="File name" hint="Students see this title instead of the raw filename.">
                <input
                  value={resourceTitle}
                  onChange={(e) => setResourceTitle(e.target.value.slice(0, 140))}
                  placeholder={files[0]?.file?.name ?? 'Lecture notes.pdf'}
                  className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                />
              </Field>
            </div>
          )}

          {/* Attachments */}
          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="group relative">
                  {f.preview ? (
                    <img src={f.preview} alt="" className="h-20 w-20 rounded-md border border-line object-cover" />
                  ) : (
                    <div className="flex h-20 w-36 flex-col justify-center rounded-md border border-line bg-surface-2 px-2.5">
                      <FileText className="mb-1 h-4 w-4 text-accent" aria-hidden />
                      <p className="truncate text-[11.5px] font-medium text-ink">{f.file.name}</p>
                      <p className="text-[11px] text-ink-3">{formatBytes(f.file.size)}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${f.file.name}`}
                    onClick={() => {
                      if (f.preview) URL.revokeObjectURL(f.preview);
                      setFiles((prev) => prev.filter((_, j) => j !== i));
                    }}
                    className="absolute -top-1.5 -right-1.5 rounded-full border border-line bg-surface p-0.5 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="mt-2 text-[12.5px] font-medium text-danger">{error}</p>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 border-t border-line px-2 py-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />

        <ToolbarButton icon={Image} label="Add images or video" onClick={() => fileInput.current?.click()} />
        <ToolbarButton
          icon={FileText}
          label="Attach a resource"
          active={mode === 'resource'}
          onClick={() => {
            setMode((m) => (m === 'resource' ? 'text' : 'resource'));
            fileInput.current?.click();
          }}
        />
        <ToolbarButton
          icon={BarChart3}
          label="Create a poll"
          active={mode === 'poll'}
          onClick={() => setMode((m) => (m === 'poll' ? 'text' : 'poll'))}
        />

        <div className="relative">
          <ToolbarButton icon={Smile} label="Add emoji" onClick={() => setShowEmoji((v) => !v)} />
          {showEmoji && (
            <div className="absolute bottom-full left-0 z-20 mb-2 grid w-48 grid-cols-5 gap-1 rounded-lg border border-line bg-surface p-2 shadow-overlay">
              {EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setContent((c) => c + e);
                    setShowEmoji(false);
                  }}
                  className="rounded p-1 text-lg hover:bg-surface-2"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {content.length > 0 && (
          <span
            className={classNames(
              'ml-1 text-[12px] tabular-nums',
              remaining < 100 ? 'text-warning' : 'text-ink-3',
            )}
          >
            {remaining}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {mode !== 'text' && (
            <Button variant="ghost" size="sm" onClick={() => setMode('text')}>
              Cancel {mode === 'poll' ? 'poll' : 'file'}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!canSubmit} loading={mutation.isPending}>
            Post
          </Button>
        </div>
      </div>
    </form>
  );
}

function ToolbarButton({ icon: Icon, label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={classNames(
        'rounded-md p-2 transition-colors',
        active ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
      )}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </button>
  );
}
