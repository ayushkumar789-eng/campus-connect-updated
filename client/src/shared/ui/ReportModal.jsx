import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { Button } from './Button.jsx';
import { useUIStore } from '../../app/store/uiStore.js';
import { postsApi } from '../../features/posts/index.js';
import { errorMessage } from '../api/client.js';
import { toast } from './Toast.jsx';

const REASONS = [
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'misinformation', label: 'False information' },
  { value: 'copyright', label: 'Copyright violation' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'other', label: 'Something else' },
];

/**
 * Global report dialog, opened from anywhere via the UI store. Reports land in
 * the `reports` collection for the admin moderation queue.
 */
export function ReportModal() {
  const target = useUIStore((s) => s.reportTarget);
  const closeReport = useUIStore((s) => s.closeReport);
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload) => postsApi.report(payload),
    onSuccess: (res) => {
      toast.success(res.message);
      closeReport();
      setReason('spam');
      setDetails('');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not submit that report.')),
  });

  const submit = (event) => {
    event.preventDefault();
    mutation.mutate({
      targetType: target.targetType,
      targetId: target.targetId,
      reason,
      details: details.trim(),
    });
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={closeReport}
      title="Report this content"
      description="Our student moderators review every report. Tell us what is wrong."
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Reason</legend>
          <div className="space-y-1">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-2"
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="accent-[var(--accent)]"
                />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="report-details" className="mb-1.5 block text-[13px] font-medium text-ink-2">
            Anything else? <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <textarea
            id="report-details"
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, 500))}
            rows={3}
            maxLength={500}
            placeholder="Add context that would help a moderator"
            className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          <p className="mt-1 text-right text-[11.5px] text-ink-3">{details.length}/500</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button variant="ghost" onClick={closeReport}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" leftIcon={Flag} loading={mutation.isPending}>
            Submit report
          </Button>
        </div>
      </form>
    </Modal>
  );
}
